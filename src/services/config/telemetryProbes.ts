import { DatasourceInfo, DatasourceHealth } from '../../types';
import { createQueryRequest, executeDatasourceQuery } from '../datasources';
import { getResponseStateDescription, isSuccessfulDatasourceResponse } from '../datasources/queryResponse';
import { LOKI_READINESS_PROBE_MATCHERS, createLokiStreamProbeQuery } from '../loki/queries';
import { parseLokiLogFrames } from '../loki/parser';
import { createTempoReadinessQueries } from '../tempo/queries';
import { degradedDatasourceHealth, successfulDatasourceHealth } from '../resilience';

export type TempoReadinessPath = 'traceql' | 'traceId' | 'none';

export interface LokiReadinessProbeResult {
  health: DatasourceHealth;
  labelKeysSample: string[];
  lastQueryExpr?: string;
  responseState?: string;
  compatibilityMode: 'sequential-valid-matchers';
}

export interface TempoReadinessProbeResult {
  health: DatasourceHealth;
  path: TempoReadinessPath;
  lastQueryType?: string;
  responseState?: string;
  compatibilityMode: 'traceid-then-traceql';
}

/**
 * Loki: try `{service=~".+"}` then `{service_name=~".+"}` then `{job=~".+"}`.
 * Healthy on HTTP/Grafana success with no query error — zero log lines is OK.
 */
export async function probeLokiReadinessWithLabels(loki: DatasourceInfo): Promise<LokiReadinessProbeResult> {
  let lastExpr: string | undefined;
  let lastState: string | undefined;
  let lastReason: string | undefined;

  for (let index = 0; index < LOKI_READINESS_PROBE_MATCHERS.length; index += 1) {
    const matcher = LOKI_READINESS_PROBE_MATCHERS[index];
    const refId = `lokiReadiness${index}`;
    lastExpr = matcher;

    try {
      const response = await executeDatasourceQuery(loki, createQueryRequest(loki, [createLokiStreamProbeQuery(refId, matcher, 1)]));
      lastState = getResponseStateDescription(response);
      const check = isSuccessfulDatasourceResponse(response);

      if (!check.ok) {
        lastReason = check.reason;
        continue;
      }

      const logs = parseLokiLogFrames(response.data);
      const keys = logs[0] ? Array.from(new Set(Object.keys(logs[0].labels))).sort().slice(0, 24) : [];

      return {
        health: successfulDatasourceHealth('loki', loki.uid, loki.name),
        labelKeysSample: keys,
        lastQueryExpr: matcher,
        responseState: lastState,
        compatibilityMode: 'sequential-valid-matchers',
      };
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
  }

  const message = lastReason ?? 'All Loki readiness selectors failed.';

  return {
    health: degradedDatasourceHealth('loki', loki.uid, loki.name, `${message} (last query: ${lastExpr ?? 'n/a'})`),
    labelKeysSample: [],
    lastQueryExpr: lastExpr,
    responseState: lastState,
    compatibilityMode: 'sequential-valid-matchers',
  };
}

/**
 * Tempo: traceId then TraceQL. Success = datasource responds without error state (empty traces OK).
 */
export async function probeTempoReadiness(tempo: DatasourceInfo): Promise<TempoReadinessProbeResult> {
  const queries = createTempoReadinessQueries();

  for (const target of queries) {
    try {
      const response = await executeDatasourceQuery(tempo, createQueryRequest(tempo, [target]));
      const check = isSuccessfulDatasourceResponse(response);

      if (!check.ok) {
        continue;
      }

      const path: TempoReadinessPath = target.queryType === 'traceql' ? 'traceql' : 'traceId';

      return {
        health: successfulDatasourceHealth('tempo', tempo.uid, tempo.name),
        path,
        lastQueryType: target.queryType,
        responseState: getResponseStateDescription(response),
        compatibilityMode: 'traceid-then-traceql',
      };
    } catch {
      continue;
    }
  }

  return {
    health: degradedDatasourceHealth(
      'tempo',
      tempo.uid,
      tempo.name,
      'traceId and TraceQL probes did not complete without errors. Tempo may still work for real queries.'
    ),
    path: 'none',
    compatibilityMode: 'traceid-then-traceql',
  };
}
