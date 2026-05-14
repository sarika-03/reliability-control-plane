import { DatasourceInfo } from '../../types';
import { createQueryRequest, discoverTelemetryDatasources, executeDatasourceQuery } from '../datasources';
import { groupErrorPatterns } from './errorPatterns';
import { parseLokiLogFrames } from './parser';
import { createErrorLogsQuery, createGroupedFailuresQuery, createRecentLogsQuery, LokiLogQueryOptions } from './queries';

export function getLokiDatasource(): DatasourceInfo | undefined {
  return discoverTelemetryDatasources().loki;
}

export async function queryRecentLogs(loki: DatasourceInfo, options: LokiLogQueryOptions = {}) {
  const response = await executeDatasourceQuery(loki, createQueryRequest(loki, [createRecentLogsQuery('recentLogs', options)]));
  return parseLokiLogFrames(response.data);
}

export async function queryErrorLogs(loki: DatasourceInfo, options: LokiLogQueryOptions = {}) {
  const response = await executeDatasourceQuery(loki, createQueryRequest(loki, [createErrorLogsQuery('errorLogs', options)]));
  return parseLokiLogFrames(response.data);
}

export async function queryGroupedFailures(loki: DatasourceInfo, options: LokiLogQueryOptions = {}) {
  const response = await executeDatasourceQuery(
    loki,
    createQueryRequest(loki, [createGroupedFailuresQuery('groupedFailures', options)])
  );

  return groupErrorPatterns(parseLokiLogFrames(response.data));
}
