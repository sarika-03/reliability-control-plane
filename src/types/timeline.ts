import { IncidentSeverity } from './incidents';

export type ReliabilityEventSource = 'prometheus' | 'loki' | 'tempo' | 'slo' | 'topology';
export type ReliabilityEventStage = 'detected' | 'correlated' | 'propagating' | 'escalating' | 'contained';

export interface ReliabilityEvent {
  id: string;
  timestamp: string;
  source: ReliabilityEventSource;
  stage: ReliabilityEventStage;
  severity: IncidentSeverity;
  title: string;
  description: string;
  serviceName?: string;
}

export interface IncidentTimeline {
  incidentId: string;
  startedAt: string;
  updatedAt: string;
  escalationStage: ReliabilityEventStage;
  events: ReliabilityEvent[];
}
