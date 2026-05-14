import {
  BurnRate,
  ErrorBudget,
  IncidentSeverity,
  IncidentSignal,
  ReliabilityOverview,
  ReliabilityScore,
  ReliabilityTrend,
  ServiceHealth,
  ServiceSLO,
  SLOImpact,
} from '../../types';

const DEFAULT_AVAILABILITY_TARGET_PERCENT = 99.9;
const DEFAULT_LATENCY_TARGET_MS = 500;
const FAST_BURN_THRESHOLD = 14;
const SLOW_BURN_THRESHOLD = 2;

export function calculateReliabilityOverview(
  services: ServiceHealth[],
  incidents: IncidentSignal[] = []
): ReliabilityOverview {
  const generatedAt = new Date().toISOString();
  const scores = services
    .map((service) => calculateReliabilityScore(service, getIncidentFrequency(service.serviceName, incidents)))
    .sort((a, b) => a.score - b.score);
  const degradedServices = scores.filter((score) => score.degradationSeverity !== 'info' || score.score < 95);
  const highRiskServices = scores.filter((score) => score.errorBudget.remainingPercent < 50 || score.burnRate.isFastBurn);

  return {
    generatedAt,
    scores,
    degradedServices,
    highRiskServices,
    averageReliabilityScore: average(scores.map((score) => score.score)),
    averageBudgetRemainingPercent: average(scores.map((score) => score.errorBudget.remainingPercent)),
  };
}

export function calculateReliabilityScore(service: ServiceHealth, incidentFrequency = 0): ReliabilityScore {
  const slo = calculateServiceSLO(service);
  const errorBudget = calculateErrorBudget(slo);
  const burnRate = calculateBurnRate(errorBudget);
  const degradationSeverity = getDegradationSeverity(service, burnRate);
  const sloCompliancePercent = calculateSLOCompliance(slo);
  const trend = calculateReliabilityTrend(service, burnRate, incidentFrequency);
  const score = clamp(
    sloCompliancePercent * 0.45 +
      errorBudget.remainingPercent * 0.25 +
      getBurnRateScore(burnRate) * 0.2 +
      getIncidentScore(incidentFrequency) * 0.1,
    0,
    100
  );

  return {
    serviceName: service.serviceName,
    score: Math.round(score),
    incidentFrequency,
    degradationSeverity,
    sloCompliancePercent: Math.round(sloCompliancePercent),
    trend,
    slo,
    errorBudget,
    burnRate,
    capturedAt: service.metrics.capturedAt,
  };
}

export function calculateSLOImpact(signal: IncidentSignal, score?: ReliabilityScore): SLOImpact | undefined {
  const serviceName = signal.affectedServices[0];

  if (!serviceName) {
    return undefined;
  }

  const burnRate = score?.burnRate.value ?? estimateBurnRateFromSignal(signal);
  const estimatedBudgetConsumedPercent =
    score?.errorBudget.consumedPercent ?? clamp((burnRate ?? 0) * 10 + severityBudgetPenalty(signal.severity), 0, 100);
  const highRisk = signal.severity === 'critical' || estimatedBudgetConsumedPercent >= 50 || (burnRate ?? 0) >= SLOW_BURN_THRESHOLD;

  return {
    serviceName,
    estimatedBudgetConsumedPercent: Math.round(estimatedBudgetConsumedPercent),
    burnRate,
    highRisk,
    summary: highRisk
      ? `${serviceName} is consuming error budget quickly during this incident.`
      : `${serviceName} has limited estimated SLO impact at the current signal level.`,
  };
}

function calculateServiceSLO(service: ServiceHealth): ServiceSLO {
  const observedErrorPercent = service.metrics.errorRatePercent;
  const availabilityPercent = observedErrorPercent === null ? null : clamp(100 - observedErrorPercent, 0, 100);
  const latencyMs = service.metrics.latencyP95Seconds === null ? null : service.metrics.latencyP95Seconds * 1000;
  const latencyCompliancePercent = latencyMs === null ? 100 : clamp((DEFAULT_LATENCY_TARGET_MS / Math.max(latencyMs, 1)) * 100, 0, 100);

  return {
    serviceName: service.serviceName,
    availabilityTargetPercent: DEFAULT_AVAILABILITY_TARGET_PERCENT,
    latencyTargetMs: DEFAULT_LATENCY_TARGET_MS,
    latencyCompliancePercent,
    availabilityPercent,
    isAvailabilityCompliant: availabilityPercent === null ? false : availabilityPercent >= DEFAULT_AVAILABILITY_TARGET_PERCENT,
    isLatencyCompliant: latencyMs === null ? false : latencyMs <= DEFAULT_LATENCY_TARGET_MS,
  };
}

function calculateErrorBudget(slo: ServiceSLO): ErrorBudget {
  const allowedErrorPercent = 100 - slo.availabilityTargetPercent;
  const observedErrorPercent = slo.availabilityPercent === null ? null : 100 - slo.availabilityPercent;
  const consumedPercent =
    observedErrorPercent === null ? 0 : clamp((observedErrorPercent / Math.max(allowedErrorPercent, 0.001)) * 100, 0, 100);

  return {
    serviceName: slo.serviceName,
    targetPercent: slo.availabilityTargetPercent,
    remainingPercent: Math.round(100 - consumedPercent),
    consumedPercent: Math.round(consumedPercent),
    allowedErrorPercent,
    observedErrorPercent,
  };
}

function calculateBurnRate(errorBudget: ErrorBudget): BurnRate {
  const value =
    errorBudget.observedErrorPercent === null
      ? null
      : errorBudget.observedErrorPercent / Math.max(errorBudget.allowedErrorPercent, 0.001);

  return {
    serviceName: errorBudget.serviceName,
    window: '5m',
    value,
    isFastBurn: (value ?? 0) >= FAST_BURN_THRESHOLD,
    isSlowBurn: (value ?? 0) >= SLOW_BURN_THRESHOLD && (value ?? 0) < FAST_BURN_THRESHOLD,
  };
}

function calculateSLOCompliance(slo: ServiceSLO): number {
  const availabilityCompliance =
    slo.availabilityPercent === null
      ? 0
      : clamp((slo.availabilityPercent / slo.availabilityTargetPercent) * 100, 0, 100);

  return availabilityCompliance * 0.7 + slo.latencyCompliancePercent * 0.3;
}

function calculateReliabilityTrend(
  service: ServiceHealth,
  burnRate: BurnRate,
  incidentFrequency: number
): ReliabilityTrend {
  if (service.status === 'critical' || burnRate.isFastBurn) {
    return {
      serviceName: service.serviceName,
      direction: 'critical',
      summary: 'Fast burn or critical service health detected.',
    };
  }

  if (service.status === 'warning' || burnRate.isSlowBurn || incidentFrequency > 0) {
    return {
      serviceName: service.serviceName,
      direction: 'degrading',
      summary: 'Reliability is degrading based on current SLO pressure.',
    };
  }

  if (service.status === 'unknown') {
    return {
      serviceName: service.serviceName,
      direction: 'unknown',
      summary: 'Insufficient telemetry to determine trend.',
    };
  }

  return {
    serviceName: service.serviceName,
    direction: 'stable',
    summary: 'Current metrics are within SLO expectations.',
  };
}

function getIncidentFrequency(serviceName: string, incidents: IncidentSignal[]): number {
  return incidents.filter((incident) => incident.affectedServices.includes(serviceName)).length;
}

function getDegradationSeverity(service: ServiceHealth, burnRate: BurnRate): IncidentSeverity {
  if (service.status === 'critical' || burnRate.isFastBurn) {
    return 'critical';
  }

  if (service.status === 'warning' || burnRate.isSlowBurn) {
    return 'warning';
  }

  return 'info';
}

function getBurnRateScore(burnRate: BurnRate): number {
  if (burnRate.value === null) {
    return 50;
  }

  return clamp(100 - burnRate.value * 10, 0, 100);
}

function getIncidentScore(incidentFrequency: number): number {
  return clamp(100 - incidentFrequency * 20, 0, 100);
}

function estimateBurnRateFromSignal(signal: IncidentSignal): number | null {
  if (signal.errorRatePercent === null || signal.errorRatePercent === undefined) {
    return null;
  }

  const allowedErrorPercent = 100 - DEFAULT_AVAILABILITY_TARGET_PERCENT;
  return signal.errorRatePercent / Math.max(allowedErrorPercent, 0.001);
}

function severityBudgetPenalty(severity: IncidentSeverity): number {
  switch (severity) {
    case 'critical':
      return 40;
    case 'warning':
      return 20;
    default:
      return 5;
  }
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
