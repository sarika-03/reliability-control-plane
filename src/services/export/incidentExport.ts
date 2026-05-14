import { IncidentSignal } from '../../types';

export interface IncidentSnapshotExport {
  exportedAt: string;
  incident: IncidentSignal;
  timeline: IncidentSignal['timeline'];
  rootCause: IncidentSignal['rootCause'];
  recommendations: IncidentSignal['recommendations'];
}

export function createIncidentSnapshot(signal: IncidentSignal): IncidentSnapshotExport {
  return {
    exportedAt: new Date().toISOString(),
    incident: signal,
    timeline: signal.timeline,
    rootCause: signal.rootCause,
    recommendations: signal.recommendations,
  };
}

export function downloadIncidentSnapshot(signal: IncidentSignal): void {
  const snapshot = createIncidentSnapshot(signal);
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${sanitizeFilename(signal.id)}-snapshot.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function sanitizeFilename(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}
