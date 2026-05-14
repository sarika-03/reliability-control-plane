import { DataFrame, Field, FieldType } from '@grafana/data';
import { DatasourceInfo } from '../../types';
import { createQueryRequest, executeDatasourceQuery } from '../datasources';
import { createPrometheusQuery } from '../prometheus/queries';

export type LatencyUnit = 'seconds' | 'milliseconds' | 'unknown';

export interface PrometheusLabelMatcher {
  label: string;
  operator: '=' | '=~';
  value: string;
}

export interface DiscoveredMetrics {
  serviceLabel: string;
  requestMetric: string;
  requestMatchers: PrometheusLabelMatcher[];
  statusLabel?: string;
  statusErrorMatcher?: string;
  durationMetric?: string;
  durationMatchers: PrometheusLabelMatcher[];
  latencyUnit: LatencyUnit;
  discoveredAt: number;
  confidence: number;
}

interface Candidate {
  name: string;
  priority: number;
}

interface ScoredCandidate {
  label: string;
  metric: string;
  score: number;
  seriesCount: number;
}

const SERVICE_LABEL_CANDIDATES: Candidate[] = [
  { name: 'service_name', priority: 100 },
  { name: 'service', priority: 95 },
  { name: 'app', priority: 85 },
  { name: 'application', priority: 80 },
  { name: 'k8s_app', priority: 75 },
  { name: 'job', priority: 60 },
];

const REQUEST_METRIC_CANDIDATES: Candidate[] = [
  { name: 'http_requests_total', priority: 100 },
  { name: 'traces_spanmetrics_calls_total', priority: 95 },
  { name: 'http_server_requests_total', priority: 90 },
  { name: 'http_server_request_duration_seconds_count', priority: 86 },
  { name: 'http_server_request_duration_milliseconds_count', priority: 84 },
  { name: 'http_server_duration_seconds_count', priority: 82 },
  { name: 'http_server_duration_milliseconds_count', priority: 80 },
  { name: 'grpc_server_handled_total', priority: 78 },
];

const DURATION_METRIC_CANDIDATES: Candidate[] = [
  { name: 'http_request_duration_seconds_bucket', priority: 100 },
  { name: 'http_server_request_duration_seconds_bucket', priority: 96 },
  { name: 'traces_spanmetrics_latency_bucket', priority: 94 },
  { name: 'http_server_duration_seconds_bucket', priority: 90 },
  { name: 'http_server_request_duration_milliseconds_bucket', priority: 86 },
  { name: 'http_server_duration_milliseconds_bucket', priority: 84 },
  { name: 'duration_bucket', priority: 70 },
];

const STATUS_LABEL_CANDIDATES: Candidate[] = [
  { name: 'status_code', priority: 100 },
  { name: 'http_response_status_code', priority: 95 },
  { name: 'http_status_code', priority: 92 },
  { name: 'status', priority: 88 },
  { name: 'code', priority: 82 },
  { name: 'grpc_code', priority: 78 },
  { name: 'grpc_status_code', priority: 76 },
  { name: 'span_status', priority: 72 },
];

const SERVER_SPAN_KIND_MATCHER: PrometheusLabelMatcher = {
  label: 'span_kind',
  operator: '=~',
  value: 'SPAN_KIND_SERVER|SERVER|server',
};

const discoveryCache = new Map<string, { result: DiscoveredMetrics; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function discoverMetrics(prometheus: DatasourceInfo): Promise<DiscoveredMetrics> {
  const cached = discoveryCache.get(prometheus.uid);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const discovered = await performDiscovery(prometheus);
  discoveryCache.set(prometheus.uid, { result: discovered, timestamp: Date.now() });

  return discovered;
}

async function performDiscovery(prometheus: DatasourceInfo): Promise<DiscoveredMetrics> {
  const bestRequest = await discoverRequestMetric(prometheus);
  const requestMatchers = await discoverDefaultMatchers(prometheus, bestRequest.metric);
  const [status, duration] = await Promise.all([
    discoverStatusLabel(prometheus, bestRequest.metric, requestMatchers),
    discoverDurationMetric(prometheus, bestRequest.label, requestMatchers),
  ]);

  return {
    serviceLabel: bestRequest.label,
    requestMetric: bestRequest.metric,
    requestMatchers,
    statusLabel: status?.label,
    statusErrorMatcher: status?.matcher,
    durationMetric: duration?.metric,
    durationMatchers: duration?.matchers ?? requestMatchers,
    latencyUnit: duration?.unit ?? 'unknown',
    discoveredAt: Date.now(),
    confidence: calculateConfidence(bestRequest, duration?.metric, status?.label),
  };
}

async function discoverRequestMetric(prometheus: DatasourceInfo): Promise<ScoredCandidate> {
  const targets = REQUEST_METRIC_CANDIDATES.flatMap((metric, metricIndex) =>
    SERVICE_LABEL_CANDIDATES.map((label, labelIndex) =>
      createPrometheusQuery(
        discoveryRefId('request', metricIndex, labelIndex),
        `count(count by (${label.name}) (${metric.name}))`
      )
    )
  );
  const response = await executeDatasourceQuery(prometheus, createQueryRequest(prometheus, targets));

  const scored = REQUEST_METRIC_CANDIDATES.flatMap((metric, metricIndex) =>
    SERVICE_LABEL_CANDIDATES.map((label, labelIndex) => {
      const seriesCount = extractRefNumber(response.data, discoveryRefId('request', metricIndex, labelIndex));

      return {
        label: label.name,
        metric: metric.name,
        score: seriesCount > 0 ? seriesCount * 25 + metric.priority + label.priority : 0,
        seriesCount,
      };
    })
  );

  return (
    scored
      .filter((candidate) => candidate.seriesCount > 0)
      .sort((left, right) => right.score - left.score)[0] ?? {
      label: 'service',
      metric: 'http_requests_total',
      score: 0,
      seriesCount: 0,
    }
  );
}

async function discoverDefaultMatchers(
  prometheus: DatasourceInfo,
  metric: string
): Promise<PrometheusLabelMatcher[]> {
  const response = await executeDatasourceQuery(
    prometheus,
    createQueryRequest(prometheus, [
      createPrometheusQuery('spanKindServer', `count(${buildSelector(metric, [SERVER_SPAN_KIND_MATCHER])})`),
    ])
  );

  return extractRefNumber(response.data, 'spanKindServer') > 0 ? [SERVER_SPAN_KIND_MATCHER] : [];
}

async function discoverStatusLabel(
  prometheus: DatasourceInfo,
  metric: string,
  baseMatchers: PrometheusLabelMatcher[]
): Promise<{ label: string; matcher: string } | undefined> {
  const targets = STATUS_LABEL_CANDIDATES.map((label, index) =>
    createPrometheusQuery(
      discoveryRefId('status', index, 0),
      `count(count by (${label.name}) (${buildSelector(metric, baseMatchers)}))`
    )
  );
  const response = await executeDatasourceQuery(prometheus, createQueryRequest(prometheus, targets));

  const best = STATUS_LABEL_CANDIDATES.map((label, index) => ({
    label: label.name,
    score: extractRefNumber(response.data, discoveryRefId('status', index, 0)) * 20 + label.priority,
    count: extractRefNumber(response.data, discoveryRefId('status', index, 0)),
  }))
    .filter((candidate) => candidate.count > 0)
    .sort((left, right) => right.score - left.score)[0];

  return best ? { label: best.label, matcher: getErrorMatcher(best.label) } : undefined;
}

async function discoverDurationMetric(
  prometheus: DatasourceInfo,
  serviceLabel: string,
  requestMatchers: PrometheusLabelMatcher[]
): Promise<{ metric: string; matchers: PrometheusLabelMatcher[]; unit: LatencyUnit } | undefined> {
  const targets = DURATION_METRIC_CANDIDATES.map((metric, index) =>
    createPrometheusQuery(
      discoveryRefId('duration', index, 0),
      `count(count by (${serviceLabel}) (${buildSelector(metric.name, requestMatchers)}))`
    )
  );
  const response = await executeDatasourceQuery(prometheus, createQueryRequest(prometheus, targets));

  const best = DURATION_METRIC_CANDIDATES.map((metric, index) => {
    const seriesCount = extractRefNumber(response.data, discoveryRefId('duration', index, 0));

    return {
      metric: metric.name,
      matchers: requestMatchers,
      unit: inferLatencyUnit(metric.name),
      score: seriesCount > 0 ? seriesCount * 25 + metric.priority : 0,
      seriesCount,
    };
  })
    .filter((candidate) => candidate.seriesCount > 0)
    .sort((left, right) => right.score - left.score)[0];

  return best;
}

export function buildSelector(metric: string, matchers: PrometheusLabelMatcher[] = []): string {
  if (matchers.length === 0) {
    return metric;
  }

  return `${metric}{${matchers
    .map((matcher) => `${matcher.label}${matcher.operator}"${escapeMatcherValue(matcher.value)}"`)
    .join(',')}}`;
}

function discoveryRefId(prefix: string, left: number, right: number): string {
  return `${prefix}_${left}_${right}`;
}

function calculateConfidence(bestRequest: ScoredCandidate, durationMetric?: string, statusLabel?: string): number {
  const base = bestRequest.seriesCount > 0 ? 55 : 20;
  const durationBonus = durationMetric ? 25 : 0;
  const statusBonus = statusLabel ? 20 : 0;

  return Math.min(100, base + durationBonus + statusBonus);
}

function inferLatencyUnit(metric: string): LatencyUnit {
  if (metric.includes('milliseconds')) {
    return 'milliseconds';
  }

  if (metric.includes('seconds') || metric.includes('spanmetrics_latency')) {
    return 'seconds';
  }

  return 'unknown';
}

function getErrorMatcher(label: string): string {
  if (label.includes('grpc')) {
    return 'UNKNOWN|DEADLINE_EXCEEDED|NOT_FOUND|ALREADY_EXISTS|PERMISSION_DENIED|RESOURCE_EXHAUSTED|FAILED_PRECONDITION|ABORTED|OUT_OF_RANGE|UNIMPLEMENTED|INTERNAL|UNAVAILABLE|DATA_LOSS|2|4|5|6|7|8|9|10|11|12|13|14|15';
  }

  if (label === 'status_code' || label.includes('status') || label.includes('code')) {
    return 'STATUS_CODE_ERROR|ERROR|Error|error|5..|[45][0-9][0-9]|failed|FAILED|failure|FAILURE';
  }

  return '.*error.*|.*failed.*|5..|[45][0-9][0-9]';
}

function extractRefNumber(frames: DataFrame[], refId: string): number {
  const frame = frames.find((candidate) => candidate.refId === refId) ?? frames[0];

  if (!frame) {
    return 0;
  }

  const numberField = frame.fields.find((field) => field.type === FieldType.number);

  if (!numberField) {
    return 0;
  }

  return getLastNumber(numberField) ?? 0;
}

function getLastNumber(field: Field): number | undefined {
  const values = fieldValuesToArray(field.values);

  for (let index = values.length - 1; index >= 0; index--) {
    const value = Number(values[index]);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function fieldValuesToArray(values: unknown): unknown[] {
  if (Array.isArray(values)) {
    return values;
  }

  const maybeVector = values as { length?: number; toArray?: () => unknown[] } | undefined;

  if (maybeVector && typeof maybeVector.toArray === 'function') {
    return maybeVector.toArray();
  }

  if (maybeVector && typeof maybeVector.length === 'number') {
    const indexedValues = values as Record<number, unknown>;

    return Array.from({ length: maybeVector.length }, (_, index) => indexedValues[index]);
  }

  return [];
}

function escapeMatcherValue(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

export function clearDiscoveryCache(): void {
  discoveryCache.clear();
}
