import { IncidentSeverity } from './incidents';

export type ReliabilityTrendDirection = 'improving' | 'stable' | 'degrading' | 'critical' | 'unknown';
export type BurnRateWindow = '5m' | '1h' | '6h';

export interface ServiceSLO {
  serviceName: string;
  availabilityTargetPercent: number;
  latencyTargetMs: number;
  latencyCompliancePercent: number;
  availabilityPercent: number | null;
  isAvailabilityCompliant: boolean;
  isLatencyCompliant: boolean;
}

export interface ErrorBudget {
  serviceName: string;
  targetPercent: number;
  remainingPercent: number;
  consumedPercent: number;
  allowedErrorPercent: number;
  observedErrorPercent: number | null;
}

export interface BurnRate {
  serviceName: string;
  window: BurnRateWindow;
  value: number | null;
  isFastBurn: boolean;
  isSlowBurn: boolean;
}

export interface ReliabilityTrend {
  serviceName: string;
  direction: ReliabilityTrendDirection;
  summary: string;
}

export interface ReliabilityScore {
  serviceName: string;
  score: number;
  incidentFrequency: number;
  degradationSeverity: IncidentSeverity;
  sloCompliancePercent: number;
  trend: ReliabilityTrend;
  slo: ServiceSLO;
  errorBudget: ErrorBudget;
  burnRate: BurnRate;
  capturedAt: string;
}

export interface SLOImpact {
  serviceName: string;
  estimatedBudgetConsumedPercent: number;
  burnRate: number | null;
  highRisk: boolean;
  summary: string;
}

export interface ReliabilityOverview {
  generatedAt: string;
  scores: ReliabilityScore[];
  degradedServices: ReliabilityScore[];
  highRiskServices: ReliabilityScore[];
  averageReliabilityScore: number;
  averageBudgetRemainingPercent: number;
}
