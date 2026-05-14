import { RootCauseAnalysis } from './rootCause';
import { SLOImpact } from './slo';
import { TraceReference, TraceSummary } from './traces';
import { IncidentSummary, OperationalRecommendation, OperationalRisk } from './intelligence';
import { IncidentTimeline } from './timeline';

export type IncidentSeverity = 'critical' | 'warning' | 'info';

export interface LogEntry {
  timestamp: string;
  message: string;
  serviceName: string;
  labels: Record<string, string>;
  traceReferences: TraceReference[];
}

export interface ErrorPattern {
  id: string;
  serviceName: string;
  signature: string;
  exampleMessage: string;
  occurrenceCount: number;
  firstSeen: string;
  lastSeen: string;
  severity: IncidentSeverity;
  traceReferences: TraceReference[];
}

/**
 * Metadata about how an incident propagates through service dependencies
 */
export interface IncidentPropagation {
  /** Service where the incident originated */
  originService: string;

  /** Ordered chain of affected services from origin to leaf */
  affectedDependencyChain: string[];

  /** Total number of services affected by propagation */
  blastRadius: number;

  /** Services most at risk of cascading failure */
  downstreamRiskServices: string[];

  /** Confidence in propagation analysis (0-100) */
  confidence: number;
}

export interface IncidentSignal {
  id: string;
  title: string;
  severity: IncidentSeverity;
  affectedServices: string[];
  confidence: number;
  firstSeen: string;
  lastSeen: string;
  dominantError?: ErrorPattern;
  errorRatePercent?: number | null;
  latencyP95Seconds?: number | null;
  relatedTraces: TraceSummary[];
  rootCause?: RootCauseAnalysis;
  sloImpact?: SLOImpact;
  incidentSummary?: IncidentSummary;
  operationalRisk?: OperationalRisk;
  recommendations?: OperationalRecommendation[];
  timeline?: IncidentTimeline;
  summary: string;

  /** Metadata about how the incident propagates through dependencies */
  propagation?: IncidentPropagation;
}

export interface CorrelationResult {
  generatedAt: string;
  signals: IncidentSignal[];
  errorPatterns: ErrorPattern[];
  affectedServices: string[];
  confidence: number;
  traces: TraceSummary[];
  telemetryCompleteness: number;
  warnings: string[];
}
