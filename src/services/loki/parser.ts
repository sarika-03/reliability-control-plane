import { DataFrame, Field, FieldType } from '@grafana/data';
import { PERFORMANCE_BUDGETS } from '../../constants.performance';
import { LogEntry } from '../../types';
import { extractTraceReferencesFromLog } from '../tempo';

const MESSAGE_FIELD_NAMES = ['line', 'message', 'body', 'content', 'log'];

export function parseLokiLogFrames(frames: DataFrame[]): LogEntry[] {
  const logs: LogEntry[] = [];

  for (const frame of frames) {
    if (logs.length >= PERFORMANCE_BUDGETS.maxLogLinesToParse) {
      break;
    }

    logs.push(...parseLogFrame(frame, PERFORMANCE_BUDGETS.maxLogLinesToParse - logs.length));
  }

  return logs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function parseLogFrame(frame: DataFrame, remainingBudget: number): LogEntry[] {
  const timeField = frame.fields.find((field) => field.type === FieldType.time);
  const messageField =
    findFieldByName(frame.fields, MESSAGE_FIELD_NAMES) ?? frame.fields.find((field) => field.type === FieldType.string);

  if (!messageField) {
    return [];
  }

  return messageField.values.slice(0, remainingBudget).flatMap((message, index) => {
    const normalizedMessage = String(message ?? '').trim();

    if (!normalizedMessage) {
      return [];
    }

    const labels = collectLabels(frame, messageField, index);

    return [
      {
        timestamp: getTimestamp(timeField, index),
        message: normalizedMessage,
        serviceName: getServiceName(labels),
        labels,
        traceReferences: extractTraceReferencesFromLog(normalizedMessage, labels),
      },
    ];
  });
}

function findFieldByName(fields: Field[], names: string[]): Field | undefined {
  return fields.find((field) => names.includes(field.name.toLowerCase()));
}

function collectLabels(frame: DataFrame, messageField: Field, index: number): Record<string, string> {
  const labels: Record<string, string> = {
    ...stringifyLabels(frame.fields.flatMap((field) => Object.entries(field.labels ?? {}))),
    ...stringifyLabels(Object.entries(messageField.labels ?? {})),
  };

  for (const field of frame.fields) {
    if (field.type === FieldType.string && !MESSAGE_FIELD_NAMES.includes(field.name.toLowerCase())) {
      const value = field.values[index];

      if (value !== undefined && value !== null && String(value).trim()) {
        labels[field.name] = String(value);
      }
    }
  }

  return labels;
}

function stringifyLabels(entries: Array<[string, unknown]>): Record<string, string> {
  return entries.reduce<Record<string, string>>((acc, [key, value]) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      acc[key] = String(value);
    }

    return acc;
  }, {});
}

function getTimestamp(timeField: Field | undefined, index: number): string {
  const rawValue = timeField?.values[index];

  if (rawValue === undefined || rawValue === null) {
    return new Date().toISOString();
  }

  const value = typeof rawValue === 'number' ? rawValue : Date.parse(String(rawValue));
  return Number.isFinite(value) ? new Date(value).toISOString() : new Date().toISOString();
}

function getServiceName(labels: Record<string, string>): string {
  return (
    labels.service ??
    labels.service_name ??
    labels.otelServiceName ??
    labels.app ??
    labels.application ??
    labels.k8s_app ??
    labels.job ??
    labels.container ??
    labels.namespace ??
    'unknown-service'
  );
}
