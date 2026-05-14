import { DatasourceInfo, TraceReference, TraceSummary } from '../../types';
import { normalizeHexTraceId } from '../../utils/traceIds';
import { createQueryRequest, discoverTelemetryDatasources, executeDatasourceQuery } from '../datasources';
import { parseTempoTraceFrames } from './parser';
import { createTraceByIdQuery } from './queries';

export function getTempoDatasource(): DatasourceInfo | undefined {
  return discoverTelemetryDatasources().tempo;
}

export async function queryTraceById(tempo: DatasourceInfo, traceId: string): Promise<TraceSummary> {
  const normalized = normalizeHexTraceId(traceId) ?? traceId.replace(/-/g, '').toLowerCase();
  const response = await executeDatasourceQuery(tempo, createQueryRequest(tempo, [createTraceByIdQuery(normalized)]));
  return parseTempoTraceFrames(response.data, normalized);
}

export async function queryTracesByReferences(
  tempo: DatasourceInfo,
  references: TraceReference[],
  limit = 5
): Promise<TraceSummary[]> {
  const uniqueTraceIds = Array.from(
    new Set(
      references
        .map((reference) => normalizeHexTraceId(reference.traceId) ?? reference.traceId.replace(/-/g, '').toLowerCase())
        .filter(Boolean)
    )
  ).slice(0, limit);
  const settled = await Promise.allSettled(uniqueTraceIds.map((traceId) => queryTraceById(tempo, traceId)));

  return settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
}
