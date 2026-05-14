import { IncidentSeverity } from './incidents';
import { SpanSummary, TraceSummary } from './traces';

export interface DependencyImpact {
  serviceName: string;
  role: 'suspected' | 'upstream' | 'downstream';
  operationName?: string;
  impactSeverity: IncidentSeverity;
}

export interface BlastRadius {
  affectedServices: string[];
  upstreamCallers: string[];
  downstreamDependencies: string[];
  impactSeverity: IncidentSeverity;
  dependencyImpacts: DependencyImpact[];
}

export interface RootCauseAnalysis {
  probableRootCause: string;
  confidence: number;
  suspectedService?: string;
  suspectedDependency?: string;
  dominantFailingOperation?: string;
  supportingTraces: TraceSummary[];
  slowSpans: SpanSummary[];
  failingSpans: SpanSummary[];
  blastRadius: BlastRadius;
}
