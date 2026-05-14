import { DatasourceHealth, ReliabilityControlPlaneSettings, TelemetryReadiness } from '../../types';
import { discoverTelemetryDatasources, executeDatasourceQuery, createQueryRequest } from '../datasources';
import { createPrometheusQuery } from '../prometheus/queries';
import { failedDatasourceHealth, successfulDatasourceHealth } from '../resilience';
import { probeLokiReadinessWithLabels, probeTempoReadiness } from './telemetryProbes';

export async function testTelemetryReadiness(settings: ReliabilityControlPlaneSettings): Promise<TelemetryReadiness> {
  const inventory = discoverTelemetryDatasources(settings);
  const checks = await Promise.allSettled([
    inventory.prometheus
      ? executeDatasourceQuery(inventory.prometheus, createQueryRequest(inventory.prometheus, [createPrometheusQuery('readiness', 'up')]))
      : Promise.reject(new Error('Prometheus datasource is not configured.')),
    inventory.loki ? probeLokiReadinessWithLabels(inventory.loki) : Promise.reject(new Error('Loki datasource is not configured.')),
    inventory.tempo ? probeTempoReadiness(inventory.tempo) : Promise.reject(new Error('Tempo datasource is not configured.')),
  ]);
  const datasources: DatasourceHealth[] = [
    inventory.prometheus && checks[0]?.status === 'fulfilled'
      ? successfulDatasourceHealth('prometheus', inventory.prometheus.uid, inventory.prometheus.name)
      : failedDatasourceHealth('prometheus', inventory.prometheus?.uid, inventory.prometheus?.name ?? 'Prometheus', checks[0]?.status === 'rejected' ? checks[0].reason : undefined),
    inventory.loki && checks[1]?.status === 'fulfilled'
      ? checks[1].value.health
      : failedDatasourceHealth('loki', inventory.loki?.uid, inventory.loki?.name ?? 'Loki', checks[1]?.status === 'rejected' ? checks[1].reason : undefined),
    inventory.tempo && checks[2]?.status === 'fulfilled'
      ? checks[2].value.health
      : failedDatasourceHealth('tempo', inventory.tempo?.uid, inventory.tempo?.name ?? 'Tempo', checks[2]?.status === 'rejected' ? checks[2].reason : undefined),
  ];
  const missingSignals = datasources
    .filter((datasource) => datasource.status !== 'healthy')
    .map((datasource) => `${datasource.name}: ${datasource.error ?? datasource.status}`);

  return {
    generatedAt: new Date().toISOString(),
    datasources,
    ready: missingSignals.length === 0,
    missingSignals,
  };
}
