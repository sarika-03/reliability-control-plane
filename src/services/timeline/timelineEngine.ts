import { IncidentSignal, IncidentTimeline, ReliabilityEvent, ReliabilityEventStage } from '../../types';

export function buildIncidentTimeline(signal: IncidentSignal): IncidentTimeline {
  const events: ReliabilityEvent[] = [
    buildDetectionEvent(signal),
    ...buildLokiEvents(signal),
    ...buildTempoEvents(signal),
    ...buildSLOEvents(signal),
    ...buildTopologyEvents(signal),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    incidentId: signal.id,
    startedAt: events[0]?.timestamp ?? signal.firstSeen,
    updatedAt: events[events.length - 1]?.timestamp ?? signal.lastSeen,
    escalationStage: getEscalationStage(signal),
    events,
  };
}

function buildDetectionEvent(signal: IncidentSignal): ReliabilityEvent {
  return {
    id: `${signal.id}:prometheus:detected`,
    timestamp: signal.firstSeen,
    source: 'prometheus',
    stage: 'detected',
    severity: signal.severity,
    title: 'Reliability signal detected',
    description: `Prometheus service metrics crossed correlation thresholds for ${signal.affectedServices.join(', ')}.`,
    serviceName: signal.affectedServices[0],
  };
}

function buildLokiEvents(signal: IncidentSignal): ReliabilityEvent[] {
  if (!signal.dominantError) {
    return [];
  }

  return [
    {
      id: `${signal.id}:loki:dominant-error`,
      timestamp: signal.dominantError.firstSeen,
      source: 'loki',
      stage: 'correlated',
      severity: signal.dominantError.severity,
      title: 'Dominant error pattern emerged',
      description: `${signal.dominantError.occurrenceCount} matching logs: ${signal.dominantError.signature}`,
      serviceName: signal.dominantError.serviceName,
    },
  ];
}

function buildTempoEvents(signal: IncidentSignal): ReliabilityEvent[] {
  if (!signal.rootCause || signal.relatedTraces.length === 0) {
    return [];
  }

  const failingSpan = signal.rootCause.failingSpans[0];
  const slowSpan = signal.rootCause.slowSpans[0];

  return [
    {
      id: `${signal.id}:tempo:root-cause`,
      timestamp: signal.lastSeen,
      source: 'tempo',
      stage: 'correlated',
      severity: signal.rootCause.blastRadius.impactSeverity,
      title: 'Trace evidence correlated',
      description:
        failingSpan || slowSpan
          ? `${failingSpan?.operationName ?? slowSpan?.operationName} on ${failingSpan?.serviceName ?? slowSpan?.serviceName} is the leading span signal.`
          : `${signal.relatedTraces.length} traces support this incident signal.`,
      serviceName: failingSpan?.serviceName ?? slowSpan?.serviceName ?? signal.rootCause.suspectedService,
    },
  ];
}

function buildSLOEvents(signal: IncidentSignal): ReliabilityEvent[] {
  if (!signal.sloImpact) {
    return [];
  }

  return [
    {
      id: `${signal.id}:slo:burn`,
      timestamp: signal.lastSeen,
      source: 'slo',
      stage: signal.sloImpact.highRisk ? 'escalating' : 'contained',
      severity: signal.sloImpact.highRisk ? 'critical' : 'warning',
      title: 'SLO impact estimated',
      description: signal.sloImpact.summary,
      serviceName: signal.sloImpact.serviceName,
    },
  ];
}

function buildTopologyEvents(signal: IncidentSignal): ReliabilityEvent[] {
  if (!signal.propagation || signal.propagation.blastRadius <= 1) {
    return [];
  }

  return [
    {
      id: `${signal.id}:topology:propagation`,
      timestamp: signal.lastSeen,
      source: 'topology',
      stage: 'propagating',
      severity: signal.severity,
      title: 'Dependency propagation detected',
      description: `Propagation path: ${signal.propagation.affectedDependencyChain.join(' -> ')}`,
      serviceName: signal.propagation.originService,
    },
  ];
}

function getEscalationStage(signal: IncidentSignal): ReliabilityEventStage {
  if (signal.sloImpact?.highRisk || signal.severity === 'critical') {
    return 'escalating';
  }

  if ((signal.propagation?.blastRadius ?? 1) > 1) {
    return 'propagating';
  }

  if (signal.rootCause || signal.dominantError) {
    return 'correlated';
  }

  return 'detected';
}
