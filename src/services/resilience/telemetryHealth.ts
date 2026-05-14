import { PERFORMANCE_BUDGETS } from '../../constants.performance';
import { DatasourceHealth, DatasourceInventory, TelemetryDatasourceType, TelemetryHealth } from '../../types';

export function buildTelemetryHealth(
  inventory: DatasourceInventory | undefined,
  statuses: Partial<Record<TelemetryDatasourceType, DatasourceHealth>>
): TelemetryHealth {
  const generatedAt = new Date().toISOString();
  const datasources: DatasourceHealth[] = [
    buildDatasourceHealth('prometheus', inventory, statuses.prometheus),
    buildDatasourceHealth('loki', inventory, statuses.loki),
    buildDatasourceHealth('tempo', inventory, statuses.tempo),
  ];
  const warnings = datasources.flatMap((datasource) => {
    if (datasource.status === 'healthy' || datasource.status === 'unknown') {
      return [];
    }

    return [
      `${datasource.name} is ${datasource.status}${datasource.error ? `: ${datasource.error}` : ''}${
        datasource.message ? `: ${datasource.message}` : ''
      }`,
    ];
  });

  return {
    datasources,
    generatedAt,
    hasPartialData: datasources.some((datasource) => datasource.status !== 'healthy' && datasource.status !== 'unknown'),
    stale: datasources.some((datasource) => isStale(datasource.lastSuccessfulQuery)),
    warnings,
  };
}

export function successfulDatasourceHealth(type: TelemetryDatasourceType, uid: string, name: string): DatasourceHealth {
  return {
    type,
    uid,
    name,
    status: 'healthy',
    lastSuccessfulQuery: new Date().toISOString(),
  };
}

export function degradedDatasourceHealth(
  type: TelemetryDatasourceType,
  uid: string,
  name: string,
  message: string
): DatasourceHealth {
  return {
    type,
    uid,
    name,
    status: 'degraded',
    lastSuccessfulQuery: new Date().toISOString(),
    message,
  };
}

export function failedDatasourceHealth(
  type: TelemetryDatasourceType,
  uid: string | undefined,
  name: string,
  error: unknown
): DatasourceHealth {
  return {
    type,
    uid,
    name,
    status: uid ? 'unavailable' : 'not-configured',
    error: error instanceof Error ? error.message : 'Datasource query failed.',
  };
}

export function retainPreviousDatasourceSuccess(
  current: TelemetryHealth,
  previous: TelemetryHealth | undefined
): TelemetryHealth {
  if (!previous) {
    return current;
  }

  const previousByType = new Map(previous.datasources.map((datasource) => [datasource.type, datasource]));
  const datasources = current.datasources.map((datasource) => {
    const previousDatasource = previousByType.get(datasource.type);

    if (datasource.lastSuccessfulQuery || !previousDatasource?.lastSuccessfulQuery) {
      return datasource;
    }

    return {
      ...datasource,
      lastSuccessfulQuery: previousDatasource.lastSuccessfulQuery,
    };
  });

  return {
    ...current,
    datasources,
    stale: datasources.some((datasource) => isStale(datasource.lastSuccessfulQuery)),
  };
}

function buildDatasourceHealth(
  type: TelemetryDatasourceType,
  inventory: DatasourceInventory | undefined,
  status: DatasourceHealth | undefined
): DatasourceHealth {
  if (status) {
    return status;
  }

  const datasource = inventory?.[type];

  return {
    type,
    uid: datasource?.uid,
    name: datasource?.name ?? type,
    status: datasource ? 'unknown' : 'not-configured',
  };
}

function isStale(timestamp: string | undefined): boolean {
  if (!timestamp) {
    return false;
  }

  return Date.now() - new Date(timestamp).getTime() > PERFORMANCE_BUDGETS.staleTelemetryMs;
}
