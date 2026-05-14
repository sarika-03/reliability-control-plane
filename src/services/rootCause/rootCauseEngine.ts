import {
  BlastRadius,
  DependencyImpact,
  ErrorPattern,
  IncidentSeverity,
  RootCauseAnalysis,
  ServiceHealth,
  SpanSummary,
  TraceSummary,
} from '../../types';

export function analyzeRootCause(
  serviceName: string,
  serviceHealth: ServiceHealth | undefined,
  dominantError: ErrorPattern | undefined,
  relatedTraces: TraceSummary[]
): RootCauseAnalysis | undefined {
  const failingSpans = relatedTraces.flatMap((trace) => trace.failingSpans);
  const slowSpans = relatedTraces.flatMap((trace) => trace.slowSpans);
  const dominantSpan = failingSpans[0] ?? slowSpans[0];

  if (!dominantError && !dominantSpan && (!serviceHealth || serviceHealth.status === 'healthy')) {
    return undefined;
  }

  const suspectedService = dominantSpan?.serviceName ?? dominantError?.serviceName ?? serviceName;
  const suspectedDependency = dominantSpan && dominantSpan.serviceName !== serviceName ? dominantSpan.serviceName : undefined;
  const confidence = calculateRootCauseConfidence(serviceHealth, dominantError, failingSpans, slowSpans);

  return {
    probableRootCause: buildRootCauseText(serviceName, dominantError, dominantSpan),
    confidence,
    suspectedService,
    suspectedDependency,
    dominantFailingOperation: dominantSpan?.operationName,
    supportingTraces: relatedTraces,
    slowSpans,
    failingSpans,
    blastRadius: estimateBlastRadius(serviceName, suspectedService, relatedTraces, serviceHealth, dominantError),
  };
}

function calculateRootCauseConfidence(
  serviceHealth: ServiceHealth | undefined,
  dominantError: ErrorPattern | undefined,
  failingSpans: SpanSummary[],
  slowSpans: SpanSummary[]
): number {
  let confidence = 0;

  if (dominantError) {
    confidence += Math.min(35, 15 + dominantError.occurrenceCount * 2);
  }

  if (failingSpans.length > 0) {
    confidence += Math.min(35, 20 + failingSpans.length * 5);
  }

  if (slowSpans.length > 0) {
    confidence += Math.min(20, 10 + slowSpans.length * 2);
  }

  if ((serviceHealth?.metrics.errorRatePercent ?? 0) >= 1 || (serviceHealth?.metrics.latencyP95Seconds ?? 0) >= 0.5) {
    confidence += 15;
  }

  return Math.min(100, confidence);
}

function buildRootCauseText(
  serviceName: string,
  dominantError: ErrorPattern | undefined,
  dominantSpan: SpanSummary | undefined
): string {
  if (dominantSpan?.isError) {
    return `${dominantSpan.serviceName}.${dominantSpan.operationName} is the dominant failing span linked to ${serviceName}.`;
  }

  if (dominantSpan) {
    return `${dominantSpan.serviceName}.${dominantSpan.operationName} is the slowest related span linked to ${serviceName}.`;
  }

  if (dominantError) {
    return `${dominantError.serviceName} has a dominant Loki error signature: ${dominantError.signature}`;
  }

  return `${serviceName} has metric anomalies without enough trace or log evidence for a stronger root cause.`;
}

function estimateBlastRadius(
  serviceName: string,
  suspectedService: string,
  traces: TraceSummary[],
  serviceHealth: ServiceHealth | undefined,
  dominantError: ErrorPattern | undefined
): BlastRadius {
  const downstreamDependencies = new Set<string>();
  const upstreamCallers = new Set<string>();
  const affectedServices = new Set<string>([serviceName, suspectedService]);

  for (const trace of traces) {
    const spansById = new Map(trace.spans.map((span) => [span.spanId, span]));

    for (const span of trace.spans) {
      affectedServices.add(span.serviceName);

      if (!span.parentSpanId) {
        continue;
      }

      const parent = spansById.get(span.parentSpanId);

      if (!parent || parent.serviceName === span.serviceName) {
        continue;
      }

      if (parent.serviceName === suspectedService) {
        downstreamDependencies.add(span.serviceName);
      }

      if (span.serviceName === suspectedService) {
        upstreamCallers.add(parent.serviceName);
      }
    }
  }

  const impactSeverity = getImpactSeverity(serviceHealth, dominantError, traces);

  return {
    affectedServices: Array.from(affectedServices).sort(),
    upstreamCallers: Array.from(upstreamCallers).sort(),
    downstreamDependencies: Array.from(downstreamDependencies).sort(),
    impactSeverity,
    dependencyImpacts: buildDependencyImpacts(suspectedService, upstreamCallers, downstreamDependencies, impactSeverity),
  };
}

function buildDependencyImpacts(
  suspectedService: string,
  upstreamCallers: Set<string>,
  downstreamDependencies: Set<string>,
  impactSeverity: IncidentSeverity
): DependencyImpact[] {
  return [
    { serviceName: suspectedService, role: 'suspected', impactSeverity },
    ...Array.from(upstreamCallers).map((serviceName) => ({ serviceName, role: 'upstream' as const, impactSeverity })),
    ...Array.from(downstreamDependencies).map((serviceName) => ({
      serviceName,
      role: 'downstream' as const,
      impactSeverity,
    })),
  ];
}

function getImpactSeverity(
  serviceHealth: ServiceHealth | undefined,
  dominantError: ErrorPattern | undefined,
  traces: TraceSummary[]
): IncidentSeverity {
  if (
    serviceHealth?.status === 'critical' ||
    dominantError?.severity === 'critical' ||
    traces.some((trace) => trace.errorSpanCount > 0)
  ) {
    return 'critical';
  }

  if (serviceHealth?.status === 'warning' || dominantError?.severity === 'warning' || traces.some((trace) => trace.slowSpans.length > 0)) {
    return 'warning';
  }

  return 'info';
}
