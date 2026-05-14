import { DataFrame, Field, FieldType } from '@grafana/data';
import { PERFORMANCE_BUDGETS } from '../../constants.performance';
import { SpanSummary, TraceSummary } from '../../types';
import { normalizeHexTraceId } from '../../utils/traceIds';

const SLOW_SPAN_THRESHOLD_MS = 500;

export function parseTempoTraceFrames(frames: DataFrame[], traceId: string): TraceSummary {
  const spans: SpanSummary[] = [];
  const canonicalTraceId = normalizeHexTraceId(traceId) ?? traceId.replace(/-/g, '').toLowerCase();

  for (const frame of frames) {
    if (spans.length >= PERFORMANCE_BUDGETS.maxSpansPerTrace) {
      break;
    }

    spans.push(...parseSpanFrame(frame, canonicalTraceId, PERFORMANCE_BUDGETS.maxSpansPerTrace - spans.length));
  }

  const rootSpan = spans.find((span) => !span.parentSpanId?.trim()) ?? spans[0];
  const durationMs = rootSpan?.durationMs ?? getMaxDuration(spans);
  const failingSpans = spans.filter((span) => span.isError).slice(0, PERFORMANCE_BUDGETS.maxFailingSpansPerTrace);
  const slowSpans = spans
    .filter((span) => (span.durationMs ?? 0) >= SLOW_SPAN_THRESHOLD_MS)
    .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
    .slice(0, PERFORMANCE_BUDGETS.maxSlowSpansPerTrace);

  return {
    traceId: canonicalTraceId,
    rootServiceName: rootSpan?.serviceName,
    rootOperationName: rootSpan?.operationName,
    durationMs,
    spanCount: spans.length,
    errorSpanCount: failingSpans.length,
    slowSpans,
    failingSpans,
    spans,
  };
}

function parseSpanFrame(frame: DataFrame, traceId: string, remainingBudget: number): SpanSummary[] {
  const length = Math.max(frame.length, ...frame.fields.map((field) => field.values.length));

  return Array.from({ length: Math.min(length, remainingBudget) }).flatMap((_, index) => {
    const attributes = collectAttributes(frame, index);

    const spanId =
      normalizeSpanKey(getStringField(frame, index, ['spanID', 'spanId', 'span_id', 'id'])) ?? `${traceId}-${index}`;
    const serviceName =
      getStringField(frame, index, ['serviceName', 'service.name', 'resource.service.name', 'service']) ??
      attributes['resource.attributes["service.name"]'] ??
      attributes['resource.attributes.service.name'] ??
      attributes['service.name'] ??
      getLabelValue(frame, 'service.name') ??
      getLabelValue(frame, 'service') ??
      'unknown-service';
    const operationName =
      getStringField(frame, index, ['operationName', 'operation', 'name', 'spanName']) ??
      attributes['http.route'] ??
      attributes['http.method'] ??
      frame.name ??
      'unknown-operation';
    const status = getStringField(frame, index, ['status', 'statusCode', 'status.code', 'error']);
    const durationMs = normalizeDurationMs(getNumberField(frame, index, ['duration', 'durationMs', 'duration_ms']));

    return [
      {
        traceId,
        spanId,
        parentSpanId: normalizeSpanKey(getStringField(frame, index, ['parentSpanID', 'parentSpanId', 'parent_span_id'])),
        serviceName,
        operationName,
        durationMs,
        startTime: getTimeField(frame, index),
        status,
        isError: isErrorStatus(status, frame, index),
        attributes,
      },
    ];
  });
}

function getStringField(frame: DataFrame, index: number, names: string[]): string | undefined {
  const field = findField(frame.fields, names);
  const value = field?.values[index];
  return value === undefined || value === null || String(value).trim() === '' ? undefined : String(value);
}

function getNumberField(frame: DataFrame, index: number, names: string[]): number | null {
  const field = findField(frame.fields, names);
  const value = Number(field?.values[index]);
  return Number.isFinite(value) ? value : null;
}

function getTimeField(frame: DataFrame, index: number): string | undefined {
  const field = frame.fields.find((candidate) => candidate.type === FieldType.time);
  const value = field?.values[index];

  if (value === undefined || value === null) {
    return undefined;
  }

  const timestamp = typeof value === 'number' ? value : Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function findField(fields: Field[], names: string[]): Field | undefined {
  const normalizedNames = names.map((name) => name.toLowerCase());
  return fields.find((field) => normalizedNames.includes(field.name.toLowerCase()));
}

function getLabelValue(frame: DataFrame, labelName: string): string | undefined {
  return frame.fields.find((field) => field.labels?.[labelName])?.labels?.[labelName];
}

function normalizeDurationMs(value: number | null): number | null {
  if (value === null) {
    return null;
  }

  if (value > 1_000_000) {
    return value / 1_000_000;
  }

  if (value > 10_000) {
    return value / 1000;
  }

  return value;
}

function isErrorStatus(status: string | undefined, frame: DataFrame, index: number): boolean {
  const statusValue = status?.toLowerCase() ?? '';
  const errorFieldValue = getStringField(frame, index, ['error', 'otel.status_code', 'statusCode']);

  return (
    statusValue.includes('error') ||
    statusValue.includes('fail') ||
    errorFieldValue?.toLowerCase() === 'true' ||
    errorFieldValue?.toLowerCase() === 'error'
  );
}

function collectAttributes(frame: DataFrame, index: number): Record<string, string> {
  return frame.fields.reduce<Record<string, string>>((acc, field) => {
    const value = field.values[index];

    if (value !== undefined && value !== null && field.type !== FieldType.time) {
      acc[field.name] = String(value);
    }

    for (const [label, labelValue] of Object.entries(field.labels ?? {})) {
      acc[label] = String(labelValue);
    }

    return acc;
  }, {});
}

function getMaxDuration(spans: SpanSummary[]): number | null {
  const durations = spans.map((span) => span.durationMs).filter((duration): duration is number => duration !== null);
  return durations.length > 0 ? Math.max(...durations) : null;
}

function normalizeSpanKey(value: string | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = String(value).trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}
