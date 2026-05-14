import { PERFORMANCE_BUDGETS } from '../../constants.performance';
import { ErrorPattern, IncidentSeverity, LogEntry, TraceReference } from '../../types';
import { normalizeHexTraceId } from '../../utils/traceIds';

export function groupErrorPatterns(logs: LogEntry[]): ErrorPattern[] {
  const grouped = new Map<string, ErrorPattern>();

  for (const log of logs) {
    const signature = normalizeMessage(log.message);
    const id = `${log.serviceName}:${signature}`;
    const existing = grouped.get(id);

    if (!existing) {
      grouped.set(id, {
        id,
        serviceName: log.serviceName,
        signature,
        exampleMessage: log.message,
        occurrenceCount: 1,
        firstSeen: log.timestamp,
        lastSeen: log.timestamp,
        severity: estimateSeverity(1, signature),
        traceReferences: log.traceReferences,
      });
      continue;
    }

    existing.occurrenceCount += 1;
    existing.firstSeen = minTimestamp(existing.firstSeen, log.timestamp);
    existing.lastSeen = maxTimestamp(existing.lastSeen, log.timestamp);
    existing.severity = estimateSeverity(existing.occurrenceCount, signature);
    existing.traceReferences = mergeTraceReferences(existing.traceReferences, log.traceReferences);
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      if (b.occurrenceCount !== a.occurrenceCount) {
        return b.occurrenceCount - a.occurrenceCount;
      }

      return b.lastSeen.localeCompare(a.lastSeen);
    })
    .slice(0, PERFORMANCE_BUDGETS.maxErrorPatterns);
}

export function normalizeMessage(message: string): string {
  return message
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\b\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?\b/gi, '<timestamp>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<number>')
    .replace(/"[^"]*"/g, '"<value>"')
    .replace(/'[^']*'/g, "'<value>'")
    .replace(/\s+/g, ' ')
    .trim();
}

function estimateSeverity(occurrenceCount: number, signature: string): IncidentSeverity {
  if (occurrenceCount >= 5 || /\b(fatal|panic|out of memory|oom|crash)\b/i.test(signature)) {
    return 'critical';
  }

  if (occurrenceCount >= 2 || /\b(error|exception|timeout|failed|failure)\b/i.test(signature)) {
    return 'warning';
  }

  return 'info';
}

function minTimestamp(left: string, right: string): string {
  return left.localeCompare(right) <= 0 ? left : right;
}

function maxTimestamp(left: string, right: string): string {
  return left.localeCompare(right) >= 0 ? left : right;
}

function mergeTraceReferences(
  existing: ErrorPattern['traceReferences'],
  incoming: ErrorPattern['traceReferences']
): ErrorPattern['traceReferences'] {
  const merged = new Map(
    existing.map((reference) => {
      const tid = traceReferenceKey(reference);
      return [tid, { ...reference, traceId: tid }] as const;
    })
  );

  for (const reference of incoming) {
    const tid = traceReferenceKey(reference);
    merged.set(tid, { ...reference, traceId: tid });
  }

  return Array.from(merged.values()).slice(0, PERFORMANCE_BUDGETS.maxTraceReferencesPerPattern);
}

function traceReferenceKey(reference: TraceReference): string {
  return normalizeHexTraceId(reference.traceId) ?? reference.traceId.replace(/-/g, '').toLowerCase();
}
