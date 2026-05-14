import { CoreApp, DataQueryRequest, DataQueryResponse, dateTime } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { isObservable, lastValueFrom } from 'rxjs';
import { PERFORMANCE_BUDGETS } from '../../constants.performance';
import { DatasourceInfo } from '../../types';

export async function executeDatasourceQuery(
  datasource: DatasourceInfo,
  request: DataQueryRequest
): Promise<DataQueryResponse> {
  return executeWithRetry(() => executeOnce(datasource, request));
}

async function executeOnce(datasource: DatasourceInfo, request: DataQueryRequest): Promise<DataQueryResponse> {
  const datasourceApi = await withTimeout(
    getDataSourceSrv().get(toDatasourceRef(datasource)),
    PERFORMANCE_BUDGETS.datasourceQueryTimeoutMs,
    `${datasource.name} datasource lookup timed out.`
  );
  const response = datasourceApi.query(request);

  return withTimeout(
    isObservable(response) ? lastValueFrom(response) : response,
    PERFORMANCE_BUDGETS.datasourceQueryTimeoutMs,
    `${datasource.name} query timed out.`
  );
}

export function createQueryRequest<TQuery extends { refId: string }>(
  datasource: DatasourceInfo,
  targets: TQuery[]
): DataQueryRequest {
  const to = dateTime();
  const from = dateTime(to).subtract(15, 'minutes');

  return {
    app: CoreApp.Unknown,
    interval: '15s',
    intervalMs: 15000,
    maxDataPoints: 500,
    range: {
      from,
      to,
      raw: {
        from: 'now-15m',
        to: 'now',
      },
    },
    requestId: `reliability-control-plane-${Date.now()}`,
    scopedVars: {},
    startTime: Date.now(),
    targets: targets as DataQueryRequest['targets'],
    timezone: 'browser',
  };
}

export function toDatasourceRef(datasource: DatasourceInfo) {
  return {
    uid: datasource.uid,
    type: datasource.type,
  };
}

async function executeWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    await delay(PERFORMANCE_BUDGETS.datasourceRetryDelayMs);
    return operation();
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
