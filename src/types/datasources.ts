export type TelemetryDatasourceType = 'prometheus' | 'loki' | 'tempo';

export interface DatasourceInfo {
  uid: string;
  name: string;
  type: string;
  isDefault: boolean;
}

export interface DatasourceInventory {
  prometheus?: DatasourceInfo;
  loki?: DatasourceInfo;
  tempo?: DatasourceInfo;
  all: DatasourceInfo[];
}

export type DatasourceHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'not-configured' | 'unknown';

export interface DatasourceHealth {
  name: string;
  type: TelemetryDatasourceType;
  uid?: string;
  status: DatasourceHealthStatus;
  lastSuccessfulQuery?: string;
  error?: string;
  message?: string;
}

export interface TelemetryHealth {
  datasources: DatasourceHealth[];
  generatedAt: string;
  hasPartialData: boolean;
  stale: boolean;
  warnings: string[];
}

export type ServiceHealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface MetricSnapshot {
  serviceName: string;
  requestRatePerSecond: number | null;
  errorRatePercent: number | null;
  latencyP95Seconds: number | null;
  capturedAt: string;
}

export interface ServiceHealth {
  serviceName: string;
  status: ServiceHealthStatus;
  metrics: MetricSnapshot;
  datasourceUid: string;
}

export interface MetricSeriesPoint {
  serviceName: string;
  value: number;
}
