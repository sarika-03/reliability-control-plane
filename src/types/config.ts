export interface ReliabilityControlPlaneSettings {
  prometheusDatasourceUid?: string;
  lokiDatasourceUid?: string;
  tempoDatasourceUid?: string;
}

export interface DatasourceSelectionValidation {
  errors: string[];
  warnings: string[];
  valid: boolean;
}
