import { DatasourceHealth } from './datasources';

export interface TelemetryReadiness {
  generatedAt: string;
  datasources: DatasourceHealth[];
  ready: boolean;
  missingSignals: string[];
}
