import { IncidentSeverity } from './incidents';

export type RecommendationCategory = 'remediation' | 'scaling' | 'dependency' | 'slo' | 'follow-up';
export type RecommendationPriority = 'immediate' | 'soon' | 'later';

export interface OperationalRisk {
  score: number;
  severity: IncidentSeverity;
  highRisk: boolean;
  factors: string[];
  summary: string;
}

export interface IncidentSummary {
  title: string;
  executiveSummary: string;
  dominantFailureCause: string;
  blastRadiusSummary: string;
  operationalSeverity: IncidentSeverity;
  operationalRisk: OperationalRisk;
  suspectedOwner?: string;
}

export interface OperationalRecommendation {
  id: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description: string;
  rationale: string;
  relatedService?: string;
}
