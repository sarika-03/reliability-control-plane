import { useCallback, useEffect, useState } from 'react';
import { DatasourceInventory, ReliabilityControlPlaneSettings, ServiceHealth, TelemetryHealth } from '../types';
import { probeLokiReadinessWithLabels, probeTempoReadiness } from '../services/config/telemetryProbes';
import { discoverTelemetryDatasources } from '../services/datasources';
import { queryServiceHealth } from '../services/prometheus';
import {
  buildTelemetryHealth,
  degradedDatasourceHealth,
  failedDatasourceHealth,
  retainPreviousDatasourceSuccess,
  successfulDatasourceHealth,
} from '../services/resilience';

interface ServiceHealthState {
  datasources?: DatasourceInventory;
  error?: string;
  loading: boolean;
  refresh: () => Promise<void>;
  services: ServiceHealth[];
  telemetryHealth?: TelemetryHealth;
}

export function useServiceHealth(settings: ReliabilityControlPlaneSettings = {}): ServiceHealthState {
  const [datasources, setDatasources] = useState<DatasourceInventory>();
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [telemetryHealth, setTelemetryHealth] = useState<TelemetryHealth>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);

    try {
      const inventory = discoverTelemetryDatasources(settings);
      setDatasources(inventory);

      if (!inventory.prometheus) {
        setServices([]);
        setError('No Prometheus datasource was found. Configure Prometheus in Grafana to load service health.');
        setTelemetryHealth(buildTelemetryHealth(inventory, {}));
        return;
      }

      const result = await Promise.allSettled([queryServiceHealth(inventory.prometheus)]);
      const serviceHealth = result[0]?.status === 'fulfilled' ? result[0].value : [];
      const healthStatuses: Parameters<typeof buildTelemetryHealth>[1] = {
        prometheus:
          result[0]?.status === 'fulfilled'
            ? serviceHealth.length > 0
              ? successfulDatasourceHealth('prometheus', inventory.prometheus.uid, inventory.prometheus.name)
              : degradedDatasourceHealth(
                  'prometheus',
                  inventory.prometheus.uid,
                  inventory.prometheus.name,
                  'query succeeded but returned no service metrics'
                )
            : failedDatasourceHealth('prometheus', inventory.prometheus.uid, inventory.prometheus.name, result[0]?.reason),
      };

      if (inventory.loki) {
        const lokiProbe = await probeLokiReadinessWithLabels(inventory.loki);
        healthStatuses.loki = lokiProbe.health;
      }

      if (inventory.tempo) {
        const tempoProbe = await probeTempoReadiness(inventory.tempo);
        healthStatuses.tempo = tempoProbe.health;
      }

      const health = buildTelemetryHealth(inventory, healthStatuses);

      setTelemetryHealth((previous) => retainPreviousDatasourceSuccess(health, previous));
      setServices(serviceHealth);
      setError(result[0]?.status === 'rejected' ? 'Prometheus is unavailable. Showing degraded service state.' : undefined);
    } catch (err) {
      setServices([]);
      setError(err instanceof Error ? err.message : 'Failed to query Grafana datasources.');
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
    datasources,
    error,
    loading,
    refresh,
    services,
    telemetryHealth,
  };
}
