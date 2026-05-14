import { IncidentSeverity } from './incidents';

export type ReliabilityTrendInsightKind = 'recurring-incident' | 'unstable-service' | 'dependency-failure' | 'degradation';

export interface ReliabilityTrendInsight {
  id: string;
  kind: ReliabilityTrendInsightKind;
  title: string;
  summary: string;
  serviceName?: string;
  severity: IncidentSeverity;
  score: number;
}
