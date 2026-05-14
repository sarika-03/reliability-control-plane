import { IncidentSignal, ReliabilityTrendInsight } from '../../types';

export function analyzeReliabilityTrends(signals: IncidentSignal[]): ReliabilityTrendInsight[] {
  const insights = [
    ...findRecurringIncidentPatterns(signals),
    ...rankUnstableServices(signals),
    ...findDependencyFailures(signals),
    ...findDegradationTrends(signals),
  ];

  return insights.sort((a, b) => b.score - a.score).slice(0, 8);
}

function findRecurringIncidentPatterns(signals: IncidentSignal[]): ReliabilityTrendInsight[] {
  return signals
    .filter((signal) => (signal.dominantError?.occurrenceCount ?? 0) >= 10)
    .map((signal) => ({
      id: `${signal.id}:recurring`,
      kind: 'recurring-incident' as const,
      title: 'Recurring error signature',
      summary: `${signal.dominantError?.occurrenceCount} matching logs for ${signal.dominantError?.signature}.`,
      serviceName: signal.dominantError?.serviceName,
      severity: signal.severity,
      score: Math.min(100, signal.confidence + (signal.dominantError?.occurrenceCount ?? 0)),
    }));
}

function rankUnstableServices(signals: IncidentSignal[]): ReliabilityTrendInsight[] {
  return signals
    .filter((signal) => signal.severity !== 'info' || (signal.operationalRisk?.score ?? 0) >= 45)
    .map((signal) => ({
      id: `${signal.id}:unstable`,
      kind: 'unstable-service' as const,
      title: 'Unstable service candidate',
      summary: signal.operationalRisk?.summary ?? signal.summary,
      serviceName: signal.affectedServices[0],
      severity: signal.operationalRisk?.severity ?? signal.severity,
      score: signal.operationalRisk?.score ?? signal.confidence,
    }));
}

function findDependencyFailures(signals: IncidentSignal[]): ReliabilityTrendInsight[] {
  return signals
    .filter((signal) => (signal.propagation?.downstreamRiskServices.length ?? 0) > 0)
    .map((signal) => ({
      id: `${signal.id}:dependency`,
      kind: 'dependency-failure' as const,
      title: 'Recurring dependency risk',
      summary: `Downstream risk services: ${signal.propagation?.downstreamRiskServices.join(', ')}.`,
      serviceName: signal.propagation?.originService,
      severity: signal.severity,
      score: Math.min(100, 50 + (signal.propagation?.blastRadius ?? 1) * 10),
    }));
}

function findDegradationTrends(signals: IncidentSignal[]): ReliabilityTrendInsight[] {
  return signals
    .filter((signal) => signal.sloImpact?.highRisk || (signal.latencyP95Seconds ?? 0) >= 0.5)
    .map((signal) => ({
      id: `${signal.id}:degradation`,
      kind: 'degradation' as const,
      title: 'Reliability degradation trend',
      summary: signal.sloImpact?.summary ?? `${signal.latencyP95Seconds?.toFixed(3)}s p95 latency observed.`,
      serviceName: signal.sloImpact?.serviceName ?? signal.affectedServices[0],
      severity: signal.sloImpact?.highRisk ? 'critical' : 'warning',
      score: Math.min(100, (signal.sloImpact?.estimatedBudgetConsumedPercent ?? 25) + signal.confidence / 2),
    }));
}
