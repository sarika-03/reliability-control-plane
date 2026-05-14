import { useCallback, useEffect, useState } from 'react';
import { PERFORMANCE_BUDGETS } from '../constants.performance';
import { CorrelationResult, DatasourceInventory, ReliabilityControlPlaneSettings, TelemetryCorrelationDebug, TelemetryHealth } from '../types';
import { probeLokiReadinessWithLabels, probeTempoReadiness } from '../services/config/telemetryProbes';
import { correlateIncidentSignals } from '../services/correlation';
import { discoverTelemetryDatasources } from '../services/datasources';
import { queryGroupedFailures } from '../services/loki';
import { queryServiceHealth } from '../services/prometheus';
import {
  buildTelemetryHealth,
  degradedDatasourceHealth,
  failedDatasourceHealth,
  retainPreviousDatasourceSuccess,
  successfulDatasourceHealth,
} from '../services/resilience';
import { queryTracesByReferences } from '../services/tempo';

interface IncidentCorrelationState {
  correlation?: CorrelationResult;
  datasources?: DatasourceInventory;
  error?: string;
  loading: boolean;
  refresh: () => Promise<void>;
  telemetryHealth?: TelemetryHealth;
  telemetryDebug?: TelemetryCorrelationDebug;
}

export function useIncidentCorrelation(
  settings: ReliabilityControlPlaneSettings = {},
  debugProbeTelemetry = false
): IncidentCorrelationState {
  const [correlation, setCorrelation] = useState<CorrelationResult>();
  const [datasources, setDatasources] = useState<DatasourceInventory>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [telemetryHealth, setTelemetryHealth] = useState<TelemetryHealth>();
  const [telemetryDebug, setTelemetryDebug] = useState<TelemetryCorrelationDebug>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const datasources = discoverTelemetryDatasources(settings);
      setDatasources(datasources);
      const healthStatuses: Parameters<typeof buildTelemetryHealth>[1] = {};

      const [serviceHealthResult, errorPatternsResult] = await Promise.allSettled([
        datasources.prometheus ? queryServiceHealth(datasources.prometheus) : Promise.resolve([]),
        datasources.loki ? queryGroupedFailures(datasources.loki) : Promise.resolve([]),
      ]);

      const serviceHealth = serviceHealthResult.status === 'fulfilled' ? serviceHealthResult.value : [];
      const errorPatterns = errorPatternsResult.status === 'fulfilled' ? errorPatternsResult.value : [];
      if (datasources.prometheus) {
        healthStatuses.prometheus =
          serviceHealthResult.status === 'fulfilled'
            ? serviceHealth.length > 0
              ? successfulDatasourceHealth('prometheus', datasources.prometheus.uid, datasources.prometheus.name)
              : degradedDatasourceHealth(
                  'prometheus',
                  datasources.prometheus.uid,
                  datasources.prometheus.name,
                  'query succeeded but returned no service metrics'
                )
            : failedDatasourceHealth('prometheus', datasources.prometheus.uid, datasources.prometheus.name, serviceHealthResult.reason);
      }

      if (datasources.loki) {
        healthStatuses.loki =
          errorPatternsResult.status === 'fulfilled'
            ? successfulDatasourceHealth('loki', datasources.loki.uid, datasources.loki.name)
            : failedDatasourceHealth('loki', datasources.loki.uid, datasources.loki.name, errorPatternsResult.reason);
      }

      const traceReferences = errorPatterns.flatMap((pattern) => pattern.traceReferences);
      const tracesResult =
        datasources.tempo && traceReferences.length > 0
          ? await Promise.allSettled([
              queryTracesByReferences(datasources.tempo, traceReferences, PERFORMANCE_BUDGETS.maxTraceSummaries),
            ])
          : [];
      const traces = tracesResult[0]?.status === 'fulfilled' ? tracesResult[0].value : [];

      let tempoProbeMeta: Pick<
        TelemetryCorrelationDebug,
        'tempoReadinessPath' | 'tempoEndpointTested' | 'tempoResponseState' | 'tempoCompatibilityMode'
      > = {};

      if (datasources.tempo) {
        const tempoProbe = await probeTempoReadiness(datasources.tempo);
        healthStatuses.tempo = tempoProbe.health;
        tempoProbeMeta = {
          tempoReadinessPath: tempoProbe.path,
          tempoEndpointTested: tempoProbe.lastQueryType,
          tempoResponseState: tempoProbe.responseState,
          tempoCompatibilityMode: tempoProbe.compatibilityMode,
        };
      }

      const traceDetailWarnings: string[] =
        traceReferences.length > 0 && traces.length > 0 && traces.every((trace) => trace.spanCount === 0)
          ? ['Tempo returned no spans for log-derived trace IDs; RCA may be limited to metrics and logs.']
          : [];

      let lokiProbeMeta: Pick<TelemetryCorrelationDebug, 'lokiReadinessQuery' | 'lokiResponseState' | 'lokiCompatibilityMode'> = {};

      if (debugProbeTelemetry && datasources.loki) {
        const lokiProbe = await probeLokiReadinessWithLabels(datasources.loki);
        lokiProbeMeta = {
          lokiReadinessQuery: lokiProbe.lastQueryExpr,
          lokiResponseState: lokiProbe.responseState,
          lokiCompatibilityMode: lokiProbe.compatibilityMode,
        };
      }

      const health = buildTelemetryHealth(datasources, healthStatuses);
      setTelemetryHealth((previous) => retainPreviousDatasourceSuccess(health, previous));

      setCorrelation(
        correlateIncidentSignals(serviceHealth, errorPatterns, traces, [...health.warnings, ...traceDetailWarnings])
      );
      setError(serviceHealth.length === 0 && errorPatterns.length === 0 ? 'No telemetry data is currently available.' : undefined);

      const spanTotal = traces.reduce((total, trace) => total + trace.spanCount, 0);
      const edgeCountApprox = traces.reduce((total, trace) => {
        const parents = trace.spans.filter((span) => Boolean(span.parentSpanId?.trim())).length;
        return total + parents;
      }, 0);

      setTelemetryDebug({
        errorPatternCount: errorPatterns.length,
        traceReferenceCount: traceReferences.length,
        tracesFetched: traces.length,
        spanTotal,
        edgeCountApprox,
        ...tempoProbeMeta,
        ...lokiProbeMeta,
      });
    } catch (err) {
      setCorrelation(undefined);
      setTelemetryDebug(undefined);
      setError(err instanceof Error ? err.message : 'Failed to correlate incident signals.');
    } finally {
      setLoading(false);
    }
  }, [settings, debugProbeTelemetry]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  return {
    correlation,
    datasources,
    error,
    loading,
    refresh,
    telemetryHealth,
    telemetryDebug,
  };
}
