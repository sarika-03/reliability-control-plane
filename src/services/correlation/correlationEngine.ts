import { CorrelationResult, ErrorPattern, IncidentSeverity, IncidentSignal, ServiceHealth, TraceSummary } from '../../types';
import { normalizeHexTraceId } from '../../utils/traceIds';
import { analyzeIncidentIntelligence } from '../intelligence';
import { analyzeRootCause } from '../rootCause';
import { calculateReliabilityScore, calculateSLOImpact } from '../slo';
import { buildIncidentTimeline } from '../timeline';
import { buildTopologyAnalysis, enrichSignalsWithTopology } from '../topology';

export function correlateIncidentSignals(
  serviceHealth: ServiceHealth[],
  errorPatterns: ErrorPattern[],
  traces: TraceSummary[] = [],
  warnings: string[] = []
): CorrelationResult {
  const generatedAt = new Date().toISOString();
  const baseSignals = buildIncidentSignals(serviceHealth, errorPatterns, traces);
  const topologySignals =
    traces.length > 0
      ? enrichSignalsWithTopology(baseSignals, buildTopologyAnalysis(traces, serviceHealth, baseSignals))
      : baseSignals;
  const signals = topologySignals.map(enrichSignalWithOperationalIntelligence);
  const affectedServices = Array.from(new Set(signals.flatMap((signal) => signal.affectedServices))).sort();
  const telemetryCompleteness = calculateTelemetryCompleteness(serviceHealth, errorPatterns, traces, warnings);
  const confidence =
    signals.length === 0 ? 0 : Math.round(signals.reduce((total, signal) => total + signal.confidence, 0) / signals.length);

  return {
    generatedAt,
    signals,
    errorPatterns,
    affectedServices,
    confidence: Math.round(confidence * (telemetryCompleteness / 100)),
    traces,
    telemetryCompleteness,
    warnings,
  };
}

function enrichSignalWithOperationalIntelligence(signal: IncidentSignal): IncidentSignal {
  const timeline = buildIncidentTimeline(signal);
  const { incidentSummary, operationalRisk, recommendations } = analyzeIncidentIntelligence(signal);

  return {
    ...signal,
    incidentSummary,
    operationalRisk,
    recommendations,
    timeline,
  };
}

function calculateTelemetryCompleteness(
  serviceHealth: ServiceHealth[],
  errorPatterns: ErrorPattern[],
  traces: TraceSummary[],
  warnings: string[]
): number {
  let completeness = 100;

  if (serviceHealth.length === 0) {
    completeness -= 30;
  }

  if (errorPatterns.length === 0) {
    completeness -= 25;
  }

  if (traces.length === 0) {
    completeness -= 15;
  }

  completeness -= Math.min(30, warnings.length * 10);

  return Math.max(20, completeness);
}

function buildIncidentSignals(
  serviceHealth: ServiceHealth[],
  errorPatterns: ErrorPattern[],
  traces: TraceSummary[]
): IncidentSignal[] {
  const healthByService = new Map(serviceHealth.map((service) => [service.serviceName, service]));
  const reliabilityScoreByService = new Map(
    serviceHealth.map((service) => [service.serviceName, calculateReliabilityScore(service)])
  );
  const services = new Set([
    ...serviceHealth.map((service) => service.serviceName),
    ...errorPatterns.map((pattern) => pattern.serviceName),
  ]);

  return Array.from(services)
    .map((serviceName): IncidentSignal | undefined => {
      const health = healthByService.get(serviceName);
      const patterns = errorPatterns.filter((pattern) => pattern.serviceName === serviceName);
      const dominantError = patterns[0];
      const relatedTraces = getRelatedTraces(dominantError, traces);
      const rootCause = analyzeRootCause(serviceName, health, dominantError, relatedTraces);
      const confidence = calculateConfidence(health, dominantError, rootCause?.confidence);

      if (!dominantError && (!health || health.status === 'healthy' || health.status === 'unknown')) {
        return undefined;
      }

      const severity = getSignalSeverity(health, dominantError);
      const firstSeen = dominantError?.firstSeen ?? health?.metrics.capturedAt ?? new Date().toISOString();
      const lastSeen = dominantError?.lastSeen ?? health?.metrics.capturedAt ?? firstSeen;
      const signal = {
        id: `incident:${serviceName}:${dominantError?.id ?? health?.metrics.capturedAt ?? 'metrics'}`,
        title: buildTitle(serviceName, dominantError),
        severity,
        affectedServices: [serviceName],
        confidence,
        firstSeen,
        lastSeen,
        ...(dominantError ? { dominantError } : {}),
        errorRatePercent: health?.metrics.errorRatePercent,
        latencyP95Seconds: health?.metrics.latencyP95Seconds,
        relatedTraces,
        ...(rootCause ? { rootCause } : {}),
        summary: buildSummary(health, dominantError),
      };
      const sloImpact = calculateSLOImpact(signal, reliabilityScoreByService.get(serviceName));

      return {
        ...signal,
        ...(sloImpact ? { sloImpact } : {}),
      };
    })
    .filter((signal): signal is IncidentSignal => Boolean(signal))
    .sort((a, b) => {
      const severityDelta = severityRank(b.severity) - severityRank(a.severity);
      return severityDelta !== 0 ? severityDelta : b.confidence - a.confidence;
    });
}

function calculateConfidence(
  health: ServiceHealth | undefined,
  dominantError: ErrorPattern | undefined,
  rootCauseConfidence = 0
): number {
  let confidence = 0;

  if (dominantError) {
    confidence += Math.min(45, 20 + dominantError.occurrenceCount * 5);
  }

  if ((health?.metrics.errorRatePercent ?? 0) >= 0.5) {
    confidence += 30;
  }

  if ((health?.metrics.latencyP95Seconds ?? 0) >= 0.3) {
    confidence += 20;
  }

  if (dominantError && health && health.status !== 'healthy' && health.status !== 'unknown') {
    confidence += 15;
  }

  return Math.min(100, Math.max(confidence, rootCauseConfidence));
}

function getSignalSeverity(health: ServiceHealth | undefined, dominantError: ErrorPattern | undefined): IncidentSeverity {
  if (dominantError?.severity === 'critical' || health?.status === 'critical') {
    return 'critical';
  }

  if (dominantError?.severity === 'warning' || health?.status === 'warning') {
    return 'warning';
  }

  return 'info';
}

function buildTitle(serviceName: string, dominantError: ErrorPattern | undefined): string {
  return dominantError ? `${serviceName}: dominant error pattern detected` : `${serviceName}: telemetry anomaly detected`;
}

function buildSummary(health: ServiceHealth | undefined, dominantError: ErrorPattern | undefined): string {
  const parts = [];

  if (dominantError) {
    parts.push(`${dominantError.occurrenceCount} matching Loki error logs`);
  }

  if (health?.metrics.errorRatePercent !== null && health?.metrics.errorRatePercent !== undefined) {
    parts.push(`${health.metrics.errorRatePercent.toFixed(2)}% error rate`);
  }

  if (health?.metrics.latencyP95Seconds !== null && health?.metrics.latencyP95Seconds !== undefined) {
    parts.push(`${health.metrics.latencyP95Seconds.toFixed(3)}s p95 latency`);
  }

  return parts.length > 0 ? parts.join(' with ') : 'Reliability signal needs more telemetry context.';
}

function severityRank(severity: IncidentSeverity): number {
  switch (severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    default:
      return 1;
  }
}

function getRelatedTraces(dominantError: ErrorPattern | undefined, traces: TraceSummary[]): TraceSummary[] {
  const traceIds = new Set(
    (dominantError?.traceReferences ?? []).map((reference) => normalizeHexTraceId(reference.traceId) ?? reference.traceId.replace(/-/g, '').toLowerCase())
  );
  return traces.filter((trace) => traceIds.has(trace.traceId));
}
