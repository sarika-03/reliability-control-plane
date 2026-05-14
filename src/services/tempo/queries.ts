export interface TempoTraceIdQuery {
  refId: string;
  queryType: 'traceId';
  query: string;
  filters: [];
}

export interface TempoTraceqlQuery {
  refId: string;
  queryType: 'traceql';
  query: string;
  filters: [];
}

export type TempoDatasourceQuery = TempoTraceIdQuery | TempoTraceqlQuery;

export function createTraceByIdQuery(traceId: string, refId = 'trace'): TempoTraceIdQuery {
  return {
    refId,
    queryType: 'traceId',
    query: traceId,
    filters: [],
  };
}

/**
 * Readiness: traceId first (widely supported), then TraceQL. Empty trace for a synthetic id still proves
 * reachability when the response has no error state.
 */
export function createTempoReadinessQueries(): TempoDatasourceQuery[] {
  return [
    { refId: 'tempoTraceId', queryType: 'traceId', query: '00000000000000000000000000000001', filters: [] },
    { refId: 'tempoTraceql', queryType: 'traceql', query: '{ true } | limit 1', filters: [] },
  ];
}
