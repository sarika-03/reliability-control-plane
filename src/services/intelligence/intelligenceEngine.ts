import {
  IncidentSeverity,
  IncidentSignal,
  IncidentSummary,
  OperationalRecommendation,
  OperationalRisk,
} from '../../types';

export interface IncidentIntelligence {
  incidentSummary: IncidentSummary;
  operationalRisk: OperationalRisk;
  recommendations: OperationalRecommendation[];
}

export function analyzeIncidentIntelligence(signal: IncidentSignal): IncidentIntelligence {
  const operationalRisk = calculateOperationalRisk(signal);
  const incidentSummary = buildIncidentSummary(signal, operationalRisk);

  return {
    incidentSummary,
    operationalRisk,
    recommendations: buildRecommendations(signal, operationalRisk),
  };
}

function calculateOperationalRisk(signal: IncidentSignal): OperationalRisk {
  const factors: string[] = [];
  let score = severityScore(signal.severity);

  if (signal.confidence >= 80) {
    score += 10;
    factors.push('high correlation confidence');
  }

  if ((signal.errorRatePercent ?? 0) >= 5) {
    score += 20;
    factors.push(`${signal.errorRatePercent?.toFixed(2)}% error rate`);
  } else if ((signal.errorRatePercent ?? 0) >= 1) {
    score += 10;
    factors.push(`${signal.errorRatePercent?.toFixed(2)}% error rate`);
  }

  if ((signal.latencyP95Seconds ?? 0) >= 1) {
    score += 15;
    factors.push(`${signal.latencyP95Seconds?.toFixed(3)}s p95 latency`);
  }

  if (signal.dominantError && signal.dominantError.occurrenceCount >= 20) {
    score += 15;
    factors.push(`${signal.dominantError.occurrenceCount} matching error logs`);
  }

  if (signal.sloImpact?.highRisk) {
    score += 20;
    factors.push('high SLO burn risk');
  }

  if ((signal.sloImpact?.estimatedBudgetConsumedPercent ?? 0) >= 50) {
    score += 10;
    factors.push(`${signal.sloImpact?.estimatedBudgetConsumedPercent}% estimated error budget consumed`);
  }

  if ((signal.rootCause?.failingSpans.length ?? 0) > 0) {
    score += 10;
    factors.push(`${signal.rootCause?.failingSpans.length} failing spans`);
  }

  if ((signal.propagation?.blastRadius ?? 1) > 1) {
    score += Math.min(20, (signal.propagation?.blastRadius ?? 1) * 5);
    factors.push(`${signal.propagation?.blastRadius} services in propagation path`);
  }

  const normalizedScore = Math.min(100, Math.max(0, Math.round(score)));
  const severity = normalizedScore >= 75 ? 'critical' : normalizedScore >= 45 ? 'warning' : signal.severity;

  return {
    score: normalizedScore,
    severity,
    highRisk: normalizedScore >= 70,
    factors,
    summary: buildRiskSummary(normalizedScore, factors),
  };
}

function buildIncidentSummary(signal: IncidentSignal, operationalRisk: OperationalRisk): IncidentSummary {
  const suspectedService = signal.rootCause?.suspectedService ?? signal.dominantError?.serviceName ?? signal.affectedServices[0];
  const dominantFailureCause =
    signal.rootCause?.probableRootCause ??
    signal.dominantError?.signature ??
    (signal.sloImpact?.highRisk ? 'SLO burn-rate risk detected' : 'Telemetry anomaly requires investigation');
  const blastRadiusSummary = buildBlastRadiusSummary(signal);

  return {
    title: `${suspectedService}: ${operationalRisk.severity} operational risk`,
    executiveSummary: `${signal.summary}. ${blastRadiusSummary}`,
    dominantFailureCause,
    blastRadiusSummary,
    operationalSeverity: operationalRisk.severity,
    operationalRisk,
    suspectedOwner: suspectedService,
  };
}

function buildRecommendations(signal: IncidentSignal, risk: OperationalRisk): OperationalRecommendation[] {
  const suspectedService = signal.rootCause?.suspectedService ?? signal.dominantError?.serviceName ?? signal.affectedServices[0];
  const recommendations: OperationalRecommendation[] = [];

  if (signal.rootCause || signal.dominantError) {
    recommendations.push({
      id: `${signal.id}:remediation`,
      category: 'remediation',
      priority: risk.highRisk ? 'immediate' : 'soon',
      title: `Investigate ${suspectedService} failure path`,
      description: signal.rootCause?.dominantFailingOperation
        ? `Inspect recent changes and runtime errors around ${signal.rootCause.dominantFailingOperation}.`
        : 'Inspect the dominant Loki error signature and recent deploy or configuration changes.',
      rationale: 'Dominant errors and failing spans are the strongest available incident evidence.',
      relatedService: suspectedService,
    });
  }

  if ((signal.latencyP95Seconds ?? 0) >= 0.5 || (signal.rootCause?.slowSpans.length ?? 0) > 0) {
    recommendations.push({
      id: `${signal.id}:scaling`,
      category: 'scaling',
      priority: risk.highRisk ? 'immediate' : 'soon',
      title: `Check capacity for ${suspectedService}`,
      description: 'Review saturation, queue depth, connection pools, and autoscaling limits before adding capacity.',
      rationale: 'Latency spikes can be caused by saturation or backpressure even when error volume is still moderate.',
      relatedService: suspectedService,
    });
  }

  if (signal.propagation && signal.propagation.downstreamRiskServices.length > 0) {
    recommendations.push({
      id: `${signal.id}:dependency`,
      category: 'dependency',
      priority: 'soon',
      title: 'Protect downstream dependencies',
      description: `Watch ${signal.propagation.downstreamRiskServices.join(', ')} for cascading errors and consider rate limits or circuit breakers.`,
      rationale: 'Topology propagation indicates services at risk of receiving degraded traffic or retries.',
      relatedService: signal.propagation.originService,
    });
  }

  if (signal.sloImpact) {
    recommendations.push({
      id: `${signal.id}:slo`,
      category: 'slo',
      priority: signal.sloImpact.highRisk ? 'immediate' : 'soon',
      title: `Preserve ${signal.sloImpact.serviceName} error budget`,
      description: signal.sloImpact.highRisk
        ? 'Reduce user-facing impact immediately and consider paging the owning team.'
        : 'Track burn rate and confirm alert thresholds match the current degradation.',
      rationale: signal.sloImpact.summary,
      relatedService: signal.sloImpact.serviceName,
    });
  }

  recommendations.push({
    id: `${signal.id}:follow-up`,
    category: 'follow-up',
    priority: risk.highRisk ? 'soon' : 'later',
    title: 'Capture incident follow-up',
    description: 'Record timeline checkpoints, owner decisions, remediation outcome, and missing telemetry gaps.',
    rationale: 'Structured follow-up keeps operational learning tied to the same correlated incident signal.',
    relatedService: suspectedService,
  });

  return recommendations;
}

function buildBlastRadiusSummary(signal: IncidentSignal): string {
  if (signal.propagation && signal.propagation.blastRadius > 1) {
    return `${signal.propagation.blastRadius} services may be affected through ${signal.propagation.affectedDependencyChain.join(' -> ')}.`;
  }

  if (signal.rootCause) {
    const affected = signal.rootCause.blastRadius.affectedServices;
    return affected.length > 1 ? `${affected.length} services are represented in related traces.` : 'Impact appears localized to one service.';
  }

  return signal.affectedServices.length > 1
    ? `${signal.affectedServices.length} services are affected.`
    : 'Impact appears localized to one service.';
}

function buildRiskSummary(score: number, factors: string[]): string {
  if (factors.length === 0) {
    return `Operational risk score is ${score}; no strong escalation factors are present yet.`;
  }

  return `Operational risk score is ${score}, driven by ${factors.slice(0, 3).join(', ')}.`;
}

function severityScore(severity: IncidentSeverity): number {
  switch (severity) {
    case 'critical':
      return 55;
    case 'warning':
      return 35;
    default:
      return 15;
  }
}
