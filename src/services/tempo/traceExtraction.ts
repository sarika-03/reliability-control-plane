import { LogEntry, TraceReference } from '../../types';
import { normalizeHexTraceId } from '../../utils/traceIds';

const TRACE_ID_FIELDS = [
  'traceid',
  'trace_id',
  'trace.id',
  'traceID',
  'otelTraceID',
  'otel.trace_id',
  'dd.trace_id',
  'dd.trace.id',
];
const SPAN_ID_FIELDS = ['spanid', 'span_id', 'span.id', 'spanID', 'otelSpanID', 'dd.span_id'];
const TRACE_ID_PATTERN = /\b[0-9a-f]{32}\b/gi;
const SPAN_ID_PATTERN = /\b[0-9a-f]{16}\b/gi;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const TRACEPARENT_PATTERN = /00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})\b/i;

export function extractTraceReferencesFromLog(message: string, labels: Record<string, string> = {}): TraceReference[] {
  const references = new Map<string, TraceReference>();
  const structuredFields = parseJsonFields(message);
  const fields = { ...labels, ...structuredFields };

  for (const [key, raw] of Object.entries(fields)) {
    if (!/trace|span/i.test(key)) {
      continue;
    }

    const normalized = normalizeHexTraceId(raw);
    if (normalized) {
      references.set(normalized, { traceId: normalized });
    }
  }

  const traceIdFromFields = findFieldValue(fields, TRACE_ID_FIELDS);
  const spanIdFromFields = findFieldValue(fields, SPAN_ID_FIELDS);
  const normalizedFieldTrace = normalizeHexTraceId(traceIdFromFields);

  if (normalizedFieldTrace) {
    references.set(normalizedFieldTrace, {
      traceId: normalizedFieldTrace,
      ...(spanIdFromFields ? { spanId: spanIdFromFields.toLowerCase() } : {}),
    });
  }

  const tp = message.match(TRACEPARENT_PATTERN);
  if (tp?.[1]) {
    const tid = normalizeHexTraceId(tp[1]);
    if (tid) {
      references.set(tid, { traceId: tid, ...(tp[2] ? { spanId: tp[2].toLowerCase() } : {}) });
    }
  }

  for (const candidate of message.match(UUID_PATTERN) ?? []) {
    const tid = normalizeHexTraceId(candidate);
    if (tid) {
      references.set(tid, { traceId: tid });
    }
  }

  for (const candidate of message.match(TRACE_ID_PATTERN) ?? []) {
    const tid = normalizeHexTraceId(candidate);
    if (tid) {
      references.set(tid, { traceId: tid });
    }
  }

  const spanFromMessage = message.match(SPAN_ID_PATTERN)?.[0]?.toLowerCase();
  if (!normalizedFieldTrace && spanFromMessage) {
    const thirtyTwo = message.match(TRACE_ID_PATTERN)?.find((hex) => hex.toLowerCase() !== spanFromMessage);
    const tid = thirtyTwo ? normalizeHexTraceId(thirtyTwo) : undefined;
    if (tid) {
      references.set(tid, { traceId: tid, spanId: spanFromMessage });
    }
  }

  return Array.from(references.values());
}

export function collectTraceReferences(logs: LogEntry[]): TraceReference[] {
  const references = new Map<string, TraceReference>();

  for (const log of logs) {
    for (const reference of log.traceReferences) {
      const tid = normalizeHexTraceId(reference.traceId) ?? reference.traceId.replace(/-/g, '').toLowerCase();
      references.set(tid, { ...reference, traceId: tid, ...(reference.spanId ? { spanId: reference.spanId.toLowerCase() } : {}) });
    }
  }

  return Array.from(references.values());
}

function findFieldValue(fields: Record<string, string>, candidates: string[]): string | undefined {
  const normalizedEntries = Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value] as const);

  for (const fieldName of candidates.map((candidate) => candidate.toLowerCase())) {
    const match = normalizedEntries.find(([key]) => key === fieldName);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function parseJsonFields(message: string): Record<string, string> {
  try {
    const parsed = JSON.parse(message);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return flattenObject(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

function flattenObject(value: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, rawValue]) => {
    const fieldName = prefix ? `${prefix}.${key}` : key;

    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      Object.assign(acc, flattenObject(rawValue as Record<string, unknown>, fieldName));
      return acc;
    }

    if (rawValue !== undefined && rawValue !== null) {
      acc[fieldName] = String(rawValue);
    }

    return acc;
  }, {});
}
