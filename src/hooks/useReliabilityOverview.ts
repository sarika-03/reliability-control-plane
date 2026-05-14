import { useCallback, useEffect, useState } from 'react';
import { ReliabilityControlPlaneSettings, ReliabilityOverview, TelemetryHealth } from '../types';
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
import { calculateReliabilityOverview } from '../services/slo';

interface ReliabilityOverviewState {
  error?: string;
  loading: boolean;
  overview?: ReliabilityOverview;
  refresh: () => Promise<void>;
  telemetryHealth?: TelemetryHealth;
}

export function useReliabilityOverview(settings: ReliabilityControlPlaneSettings = {}): ReliabilityOverviewState {
  const [overview, setOverview] = useState<ReliabilityOverview>();
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
        setOverview(undefined);
        setError('No Prometheus datasource was found. Configure Prometheus in Grafana to calculate SLOs.');
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

      if (datasources.tempo) {
        const probe = await probeTempoReadiness(datasources.tempo);
        healthStatuses.tempo = probe.health;
      }

      const health = buildTelemetryHealth(datasources, healthStatuses);
      const correlation = correlateIncidentSignals(serviceHealth, errorPatterns, [], health.warnings);

      setTelemetryHealth((previous) => retainPreviousDatasourceSuccess(health, previous));
      setOverview(calculateReliabilityOverview(serviceHealth, correlation.signals));
      setError(serviceHealth.length === 0 ? 'Prometheus returned no service health data. SLO view is degraded.' : undefined);
    } catch (err) {
      setOverview(undefined);
      setError(err instanceof Error ? err.message : 'Failed to calculate reliability overview.');
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
    error,
    loading,
    overview,
    refresh,
    telemetryHealth,
  };
}
