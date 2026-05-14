import { DatasourceInfo, IncidentSignal } from '../../types';
import { normalizeHexTraceId } from '../../utils/traceIds';

interface ExploreContext {
  loki?: DatasourceInfo;
  prometheus?: DatasourceInfo;
  tempo?: DatasourceInfo;
}

/** RFC4122-ish UUID (OTel often uses `service_instance_id` for this shape). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildLogsExploreUrl(signal: IncidentSignal, context: ExploreContext): string | undefined {
  if (!context.loki) {
    return undefined;
  }

  const serviceName = signal.dominantError?.serviceName ?? signal.affectedServices[0];
  const query = buildLogsExploreQuery(signal, serviceName);

  return buildExploreUrl(context.loki, getIncidentRange(signal), [
    {
      refId: 'A',
      expr: query,
      queryType: 'range',
      datasource: toDatasourceRef(context.loki),
    },
  ]);
}

export function buildMetricsExploreUrl(signal: IncidentSignal, context: ExploreContext): string | undefined {
  if (!context.prometheus) {
    return undefined;
  }

  const serviceName = signal.affectedServices[0];
  const query = buildAdaptiveMetricsExploreQuery(serviceName);

  return buildExploreUrl(context.prometheus, getIncidentRange(signal), [
    {
      refId: 'A',
      expr: query,
      instant: false,
      range: true,
      datasource: toDatasourceRef(context.prometheus),
    },
  ]);
}

export function buildTraceExploreUrl(
  traceId: string,
  context: ExploreContext,
  range: ExploreTimeRange = { from: 'now-1h', to: 'now' }
): string | undefined {
  if (!context.tempo) {
    return undefined;
  }

  return buildExploreUrl(context.tempo, range, [
    {
      refId: 'A',
      query: normalizeTraceForExplore(traceId),
      queryType: 'traceId',
      filters: [],
      datasource: toDatasourceRef(context.tempo),
    },
  ]);
}

interface ExploreTimeRange {
  from: string;
  to: string;
}

function buildExploreUrl(datasource: DatasourceInfo, range: ExploreTimeRange, queries: unknown[]): string {
  const left = {
    datasource: datasource.uid,
    queries,
    range,
  };

  return `/explore?left=${encodeURIComponent(JSON.stringify(left))}`;
}

function getIncidentRange(signal: IncidentSignal): ExploreTimeRange {
  const from = new Date(signal.firstSeen).getTime();
  const to = new Date(signal.lastSeen).getTime();

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { from: 'now-1h', to: 'now' };
  }

  return {
    from: new Date(from - 5 * 60 * 1000).toISOString(),
    to: new Date(to + 5 * 60 * 1000).toISOString(),
  };
}

function toDatasourceRef(datasource: DatasourceInfo) {
  return {
    uid: datasource.uid,
    type: datasource.type,
  };
}

function buildAdaptiveMetricsExploreQuery(serviceName: string): string {
  const labels = ['service', 'service_name', 'app', 'job', 'application', 'k8s_app'];
  const metrics = [
    'http_requests_total',
    'traces_spanmetrics_calls_total',
    'http_server_request_duration_seconds_count',
    'http_server_request_duration_milliseconds_count',
    'http_server_duration_seconds_count',
    'http_server_duration_milliseconds_count',
    'grpc_server_handled_total',
  ];
  const escapedService = escapeLabelValue(serviceName);

  return labels
    .flatMap((label) =>
      metrics.map((metric) => {
        const spanFilter = metric === 'traces_spanmetrics_calls_total' ? ',span_kind=~"SPAN_KIND_SERVER|SERVER|server"' : '';

        return `sum(rate(${metric}{${label}="${escapedService}"${spanFilter}}[5m]))`;
      })
    )
    .join(' or ');
}

function escapeLabelValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function escapeLogFilter(value: string): string {
  return value.replaceAll('`', '\\`');
}

function buildLogsExploreQuery(signal: IncidentSignal, serviceName: string | undefined): string {
  const streamExpr = buildServiceLogStreamExpr(serviceName);

  if (signal.dominantError?.signature) {
    return `${streamExpr} |= \`${escapeLogFilter(signal.dominantError.signature)}\``;
  }

  if (serviceName && shouldAppendServiceSubstringFilter(serviceName, streamExpr)) {
    return `${streamExpr} |= \`${escapeLogFilter(serviceName)}\``;
  }

  return streamExpr;
}

function shouldAppendServiceSubstringFilter(serviceName: string, streamExpr: string): boolean {
  if (serviceName === 'unknown-service') {
    return false;
  }
  if (UUID_RE.test(serviceName)) {
    return false;
  }
  return streamExpr === '{job=~".+"}';
}

/**
 * Prefer a single valid stream selector. Avoid `(a or b)` unions — some Loki stacks reject them
 * when combined with line filters, and `{}` is invalid for range queries.
 */
function buildServiceLogStreamExpr(serviceName: string | undefined): string {
  if (!serviceName || serviceName === 'unknown-service') {
    return '{job=~".+"}';
  }

  const v = escapeLabelValue(serviceName);
  if (UUID_RE.test(serviceName)) {
    return `{service_instance_id="${v}"}`;
  }

  return '{job=~".+"}';
}

function normalizeTraceForExplore(traceId: string): string {
  return normalizeHexTraceId(traceId) ?? traceId.replace(/-/g, '').toLowerCase();
}
