import { getDataSourceSrv } from '@grafana/runtime';
import { ComboboxOption } from '@grafana/ui';
import {
  DatasourceInfo,
  DatasourceSelectionValidation,
  ReliabilityControlPlaneSettings,
  TelemetryDatasourceType,
} from '../../types';

export interface TelemetryDatasourceOptions {
  loki: ComboboxOption[];
  prometheus: ComboboxOption[];
  tempo: ComboboxOption[];
}

const TYPE_LABELS: Record<TelemetryDatasourceType, string> = {
  prometheus: 'Prometheus',
  loki: 'Loki',
  tempo: 'Tempo',
};

export function getTelemetryDatasourceOptions(): TelemetryDatasourceOptions {
  const dataSourceSrv = getDataSourceSrv();

  if (!dataSourceSrv?.getList) {
    return {
      prometheus: [],
      loki: [],
      tempo: [],
    };
  }

  const datasources = dataSourceSrv.getList({ all: true }).map((settings): DatasourceInfo => {
    return {
      uid: settings.uid,
      name: settings.name,
      type: settings.type,
      isDefault: Boolean(settings.isDefault),
    };
  });

  return {
    prometheus: toOptions(datasources, 'prometheus'),
    loki: toOptions(datasources, 'loki'),
    tempo: toOptions(datasources, 'tempo'),
  };
}

export function validateTelemetryDatasourceSettings(
  settings: ReliabilityControlPlaneSettings
): DatasourceSelectionValidation {
  const datasourceOptions = getTelemetryDatasourceOptions();
  const errors = [
    validateSelection('prometheus', settings.prometheusDatasourceUid, datasourceOptions.prometheus),
    validateSelection('loki', settings.lokiDatasourceUid, datasourceOptions.loki),
    validateSelection('tempo', settings.tempoDatasourceUid, datasourceOptions.tempo),
  ].filter((message): message is string => Boolean(message));
  const warnings = [
    datasourceOptions.prometheus.length === 0 ? 'No Prometheus datasource is available for service health and SLOs.' : undefined,
    datasourceOptions.loki.length === 0 ? 'No Loki datasource is available for log correlation.' : undefined,
    datasourceOptions.tempo.length === 0 ? 'No Tempo datasource is available for trace correlation.' : undefined,
  ].filter((message): message is string => Boolean(message));

  return {
    errors,
    warnings,
    valid: errors.length === 0,
  };
}

function matchesDatasourceType(datasource: DatasourceInfo, type: TelemetryDatasourceType): boolean {
  if (type === 'tempo') {
    return datasource.type === 'tempo' || datasource.type === 'grafana-tempo-datasource';
  }

  return datasource.type === type;
}

function toOptions(datasources: DatasourceInfo[], type: TelemetryDatasourceType): ComboboxOption[] {
  return datasources
    .filter((datasource) => matchesDatasourceType(datasource, type))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
    .map((datasource) => ({
      label: datasource.isDefault ? `${datasource.name} (default)` : datasource.name,
      value: datasource.uid,
      description: datasource.uid,
    }));
}

function validateSelection(
  type: TelemetryDatasourceType,
  uid: string | undefined,
  options: ComboboxOption[]
): string | undefined {
  if (!uid) {
    return undefined;
  }

  return options.some((option) => option.value === uid)
    ? undefined
    : `${TYPE_LABELS[type]} datasource UID "${uid}" was not found in Grafana.`;
}
