import { IncidentSeverity, type IncidentSignal } from '../types';

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

export function compareIncidentSignals(a: IncidentSignal, b: IncidentSignal): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (bySeverity !== 0) {
    return bySeverity;
  }
  const byConfidence = b.confidence - a.confidence;
  if (byConfidence !== 0) {
    return byConfidence;
  }
  return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
}

export function sortIncidentSignals(signals: IncidentSignal[]): IncidentSignal[] {
  if (signals.length <= 1) {
    return signals;
  }
  return [...signals].sort(compareIncidentSignals);
}
