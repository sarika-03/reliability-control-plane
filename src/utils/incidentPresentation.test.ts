import type { IncidentSignal } from '../types';
import { compareIncidentSignals, sortIncidentSignals } from './incidentPresentation';

function signal(partial: Partial<IncidentSignal> & Pick<IncidentSignal, 'id'>): IncidentSignal {
  return {
    id: partial.id,
    title: partial.title ?? 't',
    severity: partial.severity ?? 'info',
    affectedServices: partial.affectedServices ?? [],
    confidence: partial.confidence ?? 50,
    firstSeen: partial.firstSeen ?? '2026-01-01T00:00:00Z',
    lastSeen: partial.lastSeen ?? '2026-01-01T01:00:00Z',
    relatedTraces: partial.relatedTraces ?? [],
    summary: partial.summary ?? 's',
  };
}

describe('incidentPresentation', () => {
  it('orders by severity then confidence then recency', () => {
    const a = signal({ id: '1', severity: 'warning', confidence: 80, lastSeen: '2026-01-01T00:00:00Z' });
    const b = signal({ id: '2', severity: 'critical', confidence: 10, lastSeen: '2026-01-02T00:00:00Z' });
    const c = signal({ id: '3', severity: 'warning', confidence: 90, lastSeen: '2026-01-01T00:00:00Z' });
    expect(compareIncidentSignals(b, a)).toBeLessThan(0);
    expect(compareIncidentSignals(c, a)).toBeLessThan(0);
  });

  it('sortIncidentSignals returns a new array when sorting', () => {
    const input = [signal({ id: 'i', severity: 'info' }), signal({ id: 'c', severity: 'critical' })];
    const sorted = sortIncidentSignals(input);
    expect(sorted.map((s) => s.id)).toEqual(['c', 'i']);
    expect(sorted).not.toBe(input);
  });

  it('returns same reference for 0–1 items', () => {
    const one = [signal({ id: 'only', severity: 'warning' })];
    expect(sortIncidentSignals(one)).toBe(one);
    expect(sortIncidentSignals([])).toEqual([]);
  });
});
