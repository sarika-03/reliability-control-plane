import { useCallback, useEffect, useState } from 'react';
import { PERFORMANCE_BUDGETS } from '../constants.performance';
import { ReliabilityControlPlaneSettings, TelemetryHealth } from '../types';
import { TopologyAnalysis } from '../types/topology';
import { probeTempoReadiness } from '../services/config/telemetryProbes';
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
import { buildTopologyAnalysis } from '../services/topology';
import { queryTracesByReferences } from '../services/tempo';

interface TopologyAnalysisState {
  analysis?: TopologyAnalysis;
  error?: string;
  loading: boolean;
  refresh: () => Promise<void>;
  telemetryHealth?: TelemetryHealth;
}

export function useTopologyAnalysis(settings: ReliabilityControlPlaneSettings = {}): TopologyAnalysisState {
  const [analysis, setAnalysis] = useState<TopologyAnalysis>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [telemetryHealth, setTelemetryHealth] = useState<TelemetryHealth>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const datasources = discoverTelemetryDatasources(settings);
      const healthStatuses: Parameters<typeof buildTelemetryHealth>[1] = {};

      if (!datasources.prometheus) {
        setAnalysis(undefined);
        setError('No Prometheus datasource was found. Configure Prometheus in Grafana to load service topology.');
        setTelemetryHealth(buildTelemetryHealth(datasources, healthStatuses));
        return;
      }

      const [serviceHealthResult, errorPatternsResult] = await Promise.allSettled([
        queryServiceHealth(datasources.prometheus),
        datasources.loki ? queryGroupedFailures(datasources.loki) : Promise.resolve([]),
      ]);
      const serviceHealth = serviceHealthResult.status === 'fulfilled' ? serviceHealthResult.value : [];
      const errorPatterns = errorPatternsResult.status === 'fulfilled' ? errorPatternsResult.value : [];
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

      if (datasources.tempo) {
        const tempoProbe = await probeTempoReadiness(datasources.tempo);
        healthStatuses.tempo = tempoProbe.health;
      }

      const health = buildTelemetryHealth(datasources, healthStatuses);
      const correlation = correlateIncidentSignals(serviceHealth, errorPatterns, traces, health.warnings);

      setTelemetryHealth((previous) => retainPreviousDatasourceSuccess(health, previous));
      setAnalysis(buildTopologyAnalysis(traces, serviceHealth, correlation.signals));
      setError(serviceHealth.length === 0 ? 'No service metrics are available for topology analysis.' : undefined);
    } catch (err) {
      setAnalysis(undefined);
      setError(err instanceof Error ? err.message : 'Failed to build service topology.');
    } finally {
      setLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  return {
    analysis,
    error,
    loading,
    refresh,
    telemetryHealth,
  };
}
