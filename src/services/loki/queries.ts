export interface LokiLogQueryOptions {
  labelFilters?: Record<string, string>;
  maxLines?: number;
  search?: string;
  customSelector?: string;
}

export interface LokiLogQuery {
  refId: string;
  expr: string;
  queryType: 'range';
  direction: 'backward';
  editorMode: 'code';
  maxLines: number;
}

export function createRecentLogsQuery(refId = 'recentLogs', options: LokiLogQueryOptions = {}): LokiLogQuery {
  return createLokiQuery(refId, buildLogSelector(options), options.maxLines);
}

export function createErrorLogsQuery(refId = 'errorLogs', options: LokiLogQueryOptions = {}): LokiLogQuery {
  const errorFilter = '(?i)(error|exception|failed|failure|panic|fatal|timeout)';
  const expr = `${buildLogSelector(options)} |~ \`${errorFilter}\``;

  return createLokiQuery(refId, expr, options.maxLines);
}

export function createGroupedFailuresQuery(refId = 'groupedFailures', options: LokiLogQueryOptions = {}): LokiLogQuery {
  return createErrorLogsQuery(refId, {
    ...options,
    maxLines: options.maxLines ?? 1000,
  });
}

/** Valid single-stream matchers for readiness (each must include a regexp or equality matcher; never `{}`). */
export const LOKI_READINESS_PROBE_MATCHERS = ['{service=~".+"}', '{service_name=~".+"}', '{job=~".+"}'] as const;

/** Single-stream probe query (used sequentially until one succeeds without parse/API errors). */
export function createLokiStreamProbeQuery(refId: string, streamSelector: string, maxLines = 1): LokiLogQuery {
  return createLokiQuery(refId, streamSelector, maxLines);
}

function createLokiQuery(refId: string, expr: string, maxLines = 500): LokiLogQuery {
  return {
    refId,
    expr,
    queryType: 'range',
    direction: 'backward',
    editorMode: 'code',
    maxLines,
  };
}

function buildLogSelector(options: LokiLogQueryOptions): string {
  if (options.customSelector) {
    if (!options.search) {
      return options.customSelector;
    }
    return `${options.customSelector} |= \`${escapeLogFilter(options.search)}\``;
  }

  const filters = Object.entries(options.labelFilters ?? {})
    .filter(([, value]) => value.trim().length > 0)
    .map(([label, value]) => `${label}="${escapeLabelValue(value)}"`);

  if (filters.length === 0) {
    return '{service_name=~".+"}';
  }

  const selector = `{${filters.join(',')}}`;

  if (!options.search) {
    return selector;
  }

  return `${selector} |= \`${escapeLogFilter(options.search)}\``;
}

function escapeLabelValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function escapeLogFilter(value: string): string {
  return value.replaceAll('`', '\\`');
}
