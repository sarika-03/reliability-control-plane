import { DataSourceInstanceSettings } from '@grafana/data';
import { getDataSourceSrv } from '@grafana/runtime';
import { DatasourceInfo, DatasourceInventory, ReliabilityControlPlaneSettings } from '../../types';

const DATASOURCE_TYPES = {
  prometheus: 'prometheus',
  loki: 'loki',
  tempo: 'tempo',
} as const;

const TEMPO_PLUGIN_TYPES = new Set(['tempo', 'grafana-tempo-datasource']);

export function discoverTelemetryDatasources(settings: ReliabilityControlPlaneSettings = {}): DatasourceInventory {
  const dataSourceSrv = getDataSourceSrv();
  const all = dataSourceSrv.getList({ all: true }).map(toDatasourceInfo);

  return {
    prometheus: findPreferredDatasource(all, DATASOURCE_TYPES.prometheus, settings.prometheusDatasourceUid),
    loki: findPreferredDatasource(all, DATASOURCE_TYPES.loki, settings.lokiDatasourceUid),
    tempo: findPreferredDatasource(all, DATASOURCE_TYPES.tempo, settings.tempoDatasourceUid),
    all,
  };
}

export function getDatasourceSettings(info: DatasourceInfo): DataSourceInstanceSettings | undefined {
  return getDataSourceSrv().getInstanceSettings({ uid: info.uid, type: info.type });
}

function toDatasourceInfo(settings: DataSourceInstanceSettings): DatasourceInfo {
  return {
    uid: settings.uid,
    name: settings.name,
    type: settings.type,
    isDefault: Boolean(settings.isDefault),
  };
}

function findPreferredDatasource(
  datasources: DatasourceInfo[],
  type: string,
  configuredUid?: string
): DatasourceInfo | undefined {
  const matches = datasources.filter((datasource) =>
    type === DATASOURCE_TYPES.tempo ? TEMPO_PLUGIN_TYPES.has(datasource.type) : datasource.type === type
  );
  const configured = configuredUid ? matches.find((datasource) => datasource.uid === configuredUid) : undefined;

  if (configured) {
    return configured;
  }

  return matches.find((datasource) => datasource.isDefault) ?? matches[0];
}
