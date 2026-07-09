import { DatasourceInfo } from '../../types';
import { createQueryRequest, discoverTelemetryDatasources, executeDatasourceQuery } from '../datasources';
import { groupErrorPatterns } from './errorPatterns';
import { parseLokiLogFrames } from './parser';
import { createErrorLogsQuery, createGroupedFailuresQuery, createRecentLogsQuery, LokiLogQueryOptions } from './queries';
import { probeLokiReadinessWithLabels } from '../config/telemetryProbes';

let cachedWorkingMatcher: string | undefined;

async function getWorkingSelector(loki: DatasourceInfo): Promise<string> {
  if (cachedWorkingMatcher) {
    return cachedWorkingMatcher;
  }
  const probeResult = await probeLokiReadinessWithLabels(loki);
  if (probeResult.health.status === 'healthy' && probeResult.lastQueryExpr) {
    cachedWorkingMatcher = probeResult.lastQueryExpr;
    return cachedWorkingMatcher;
  }
  // Default fallback if probe is not successful
  return '{service=~".+"}';
}

export function getLokiDatasource(): DatasourceInfo | undefined {
  return discoverTelemetryDatasources().loki;
}

export async function queryRecentLogs(loki: DatasourceInfo, options: LokiLogQueryOptions = {}) {
  let customSelector = options.customSelector;
  const hasFilters = options.labelFilters && Object.values(options.labelFilters).some((v) => v.trim().length > 0);

  if (!hasFilters && !customSelector) {
    customSelector = await getWorkingSelector(loki);
  }

  const response = await executeDatasourceQuery(
    loki,
    createQueryRequest(loki, [createRecentLogsQuery('recentLogs', { ...options, customSelector })])
  );
  return parseLokiLogFrames(response.data);
}

export async function queryErrorLogs(loki: DatasourceInfo, options: LokiLogQueryOptions = {}) {
  let customSelector = options.customSelector;
  const hasFilters = options.labelFilters && Object.values(options.labelFilters).some((v) => v.trim().length > 0);

  if (!hasFilters && !customSelector) {
    customSelector = await getWorkingSelector(loki);
  }

  const response = await executeDatasourceQuery(
    loki,
    createQueryRequest(loki, [createErrorLogsQuery('errorLogs', { ...options, customSelector })])
  );
  return parseLokiLogFrames(response.data);
}

export async function queryGroupedFailures(loki: DatasourceInfo, options: LokiLogQueryOptions = {}) {
  let customSelector = options.customSelector;
  const hasFilters = options.labelFilters && Object.values(options.labelFilters).some((v) => v.trim().length > 0);

  if (!hasFilters && !customSelector) {
    customSelector = await getWorkingSelector(loki);
  }

  const response = await executeDatasourceQuery(
    loki,
    createQueryRequest(loki, [createGroupedFailuresQuery('groupedFailures', { ...options, customSelector })])
  );

  return groupErrorPatterns(parseLokiLogFrames(response.data));
}
