import React, { FormEvent, useMemo, useState } from 'react';
import { lastValueFrom } from 'rxjs';
import { css } from '@emotion/css';
import { AppPluginMeta, GrafanaTheme2, PluginConfigPageProps, PluginMeta } from '@grafana/data';
import { getBackendSrv } from '@grafana/runtime';
import { Alert, Badge, Button, Combobox, ComboboxOption, Field, FieldSet, Spinner, useStyles2 } from '@grafana/ui';
import { getTelemetryDatasourceOptions, testTelemetryReadiness, validateTelemetryDatasourceSettings } from '../../services/config';
import { DatasourceHealthStatus, ReliabilityControlPlaneSettings, TelemetryReadiness } from '../../types';
import { testIds } from '../testIds';

type State = ReliabilityControlPlaneSettings;

export interface AppConfigProps extends PluginConfigPageProps<AppPluginMeta<ReliabilityControlPlaneSettings>> {}

const AUTO_OPTION: ComboboxOption = {
  label: 'Auto-discover datasource',
  value: '',
  description: 'Use the default datasource of this type, or the first matching datasource Grafana returns.',
};

const AppConfig = ({ plugin }: AppConfigProps) => {
  const styles = useStyles2(getStyles);
  const { enabled, pinned, jsonData } = plugin.meta;
  const [state, setState] = useState<State>({
    prometheusDatasourceUid: jsonData?.prometheusDatasourceUid ?? '',
    lokiDatasourceUid: jsonData?.lokiDatasourceUid ?? '',
    tempoDatasourceUid: jsonData?.tempoDatasourceUid ?? '',
  });
  const [readiness, setReadiness] = useState<TelemetryReadiness>();
  const [readinessError, setReadinessError] = useState<string>();
  const [testingReadiness, setTestingReadiness] = useState(false);
  const datasourceOptions = useMemo(() => getTelemetryDatasourceOptions(), []);
  const validation = useMemo(() => validateTelemetryDatasourceSettings(state), [state]);

  const onChange = (field: keyof State) => (option: ComboboxOption) => {
    setState((current) => ({
      ...current,
      [field]: option.value || undefined,
    }));
  };

  const onTestReadiness = async () => {
    setTestingReadiness(true);
    setReadiness(undefined);
    setReadinessError(undefined);

    try {
      setReadiness(await testTelemetryReadiness(state));
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : 'Datasource readiness check failed.');
    } finally {
      setTestingReadiness(false);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validation.valid) {
      return;
    }

    updatePluginAndReload(plugin.meta.id, {
      enabled,
      pinned,
      jsonData: {
        prometheusDatasourceUid: state.prometheusDatasourceUid,
        lokiDatasourceUid: state.lokiDatasourceUid,
        tempoDatasourceUid: state.tempoDatasourceUid,
      },
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <FieldSet label="Telemetry datasource settings">
        <p className={styles.description}>
          Select the Grafana datasources Reliability Control Plane should use for live metrics, logs, and traces. Leaving
          a field on auto-discovery keeps the plugin portable across environments.
        </p>

        {validation.errors.length > 0 && (
          <Alert title="Datasource selection is invalid" severity="error" className={styles.marginTop}>
            {validation.errors.join(' ')}
          </Alert>
        )}

        {validation.warnings.length > 0 && (
          <Alert title="Datasource coverage warning" severity="warning" className={styles.marginTop}>
            {validation.warnings.join(' ')}
          </Alert>
        )}

        <Field label="Prometheus datasource" description="Used for request rate, error rate, latency, SLOs, and burn rate." className={styles.marginTop}>
          <Combobox
            id="config-prometheus-datasource"
            options={[AUTO_OPTION, ...datasourceOptions.prometheus]}
            value={state.prometheusDatasourceUid ?? ''}
            onChange={onChange('prometheusDatasourceUid')}
            width={60}
          />
        </Field>

        <Field label="Loki datasource" description="Used for dominant error patterns and incident log drilldowns." className={styles.marginTop}>
          <Combobox
            id="config-loki-datasource"
            options={[AUTO_OPTION, ...datasourceOptions.loki]}
            value={state.lokiDatasourceUid ?? ''}
            onChange={onChange('lokiDatasourceUid')}
            width={60}
          />
        </Field>

        <Field label="Tempo datasource" description="Used for trace correlation, span analysis, and topology inference." className={styles.marginTop}>
          <Combobox
            id="config-tempo-datasource"
            options={[AUTO_OPTION, ...datasourceOptions.tempo]}
            value={state.tempoDatasourceUid ?? ''}
            onChange={onChange('tempoDatasourceUid')}
            width={60}
          />
        </Field>

        <div className={styles.actions}>
          <Button type="submit" data-testid={testIds.appConfig.submit} disabled={!validation.valid}>
            Save datasource settings
          </Button>
          <Button type="button" icon="check" onClick={onTestReadiness} disabled={!validation.valid || testingReadiness} variant="secondary">
            Test readiness
          </Button>
        </div>

        {testingReadiness && (
          <div className={styles.testingState}>
            <Spinner />
            <span>Testing datasource connectivity and ingestion readiness...</span>
          </div>
        )}

        {readinessError && (
          <Alert title="Readiness check failed" severity="error" className={styles.marginTop}>
            {readinessError}
          </Alert>
        )}

        {readiness && (
          <section className={styles.readinessPanel}>
            <div className={styles.readinessHeader}>
              <strong>Observability readiness</strong>
              <Badge color={readiness.ready ? 'green' : 'orange'} text={readiness.ready ? 'ready' : 'degraded'} />
            </div>
            <div className={styles.badgeRow}>
              {readiness.datasources.map((datasource) => (
                <Badge
                  key={`${datasource.type}:${datasource.uid ?? datasource.name}`}
                  color={getStatusColor(datasource.status)}
                  text={`${datasource.name}: ${datasource.status}`}
                />
              ))}
            </div>
            {readiness.missingSignals.length > 0 && (
              <Alert title="Missing or degraded telemetry" severity="warning">
                {readiness.missingSignals.join(' ')}
              </Alert>
            )}
          </section>
        )}
      </FieldSet>
    </form>
  );
};

export default AppConfig;

const getStyles = (theme: GrafanaTheme2) => ({
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(3)};
  `,
  badgeRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
  `,
  description: css`
    color: ${theme.colors.text.secondary};
    line-height: ${theme.typography.body.lineHeight};
    margin: 0;
    max-width: 760px;
  `,
  marginTop: css`
    margin-top: ${theme.spacing(3)};
  `,
  readinessHeader: css`
    align-items: center;
    display: flex;
    gap: ${theme.spacing(1)};
    justify-content: space-between;
  `,
  readinessPanel: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1.5)};
    margin-top: ${theme.spacing(3)};
    padding: ${theme.spacing(2)};
  `,
  testingState: css`
    align-items: center;
    color: ${theme.colors.text.secondary};
    display: flex;
    gap: ${theme.spacing(1)};
    margin-top: ${theme.spacing(2)};
  `,
});

function getStatusColor(status: DatasourceHealthStatus) {
  switch (status) {
    case 'healthy':
      return 'green';
    case 'degraded':
      return 'orange';
    case 'unavailable':
      return 'red';
    case 'not-configured':
      return 'darkgrey';
    default:
      return 'blue';
  }
}

const updatePluginAndReload = async (
  pluginId: string,
  data: Partial<PluginMeta<ReliabilityControlPlaneSettings>>
) => {
  try {
    await updatePlugin(pluginId, data);

    // Grafana does not push plugin setting changes into the already-mounted app tree.
    window.location.reload();
  } catch (e) {
    console.error('Error while updating the plugin', e);
  }
};

const updatePlugin = async (pluginId: string, data: Partial<PluginMeta<ReliabilityControlPlaneSettings>>) => {
  const response = await getBackendSrv().fetch({
    url: `/api/plugins/${pluginId}/settings`,
    method: 'POST',
    data,
  });

  return lastValueFrom(response as any);
};
