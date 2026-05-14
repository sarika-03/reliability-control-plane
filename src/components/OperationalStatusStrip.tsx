import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Alert, Badge, useStyles2 } from '@grafana/ui';
import { DatasourceHealthStatus, TelemetryHealth } from '../types';

export function OperationalStatusStrip({ health }: { health?: TelemetryHealth }) {
  const styles = useStyles2(getStyles);

  if (!health) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.badges} role="list" aria-label="Datasource telemetry status">
        {health.datasources.map((datasource) => {
          const detailTime = datasource.lastSuccessfulQuery ? ` · last OK ${formatTime(datasource.lastSuccessfulQuery)}` : '';
          const fullLabel = `${datasource.name} (${datasource.type}): ${datasource.status}${detailTime}`;
          const shortLabel = `${truncateLabel(datasource.name, 28)} · ${datasource.status}`;

          return (
            <span className={styles.badgeWrap} key={`${datasource.type}:${datasource.uid ?? datasource.name}`} role="listitem" title={fullLabel}>
              <Badge color={getHealthColor(datasource.status)} text={shortLabel} />
            </span>
          );
        })}
      </div>

      {health.hasPartialData && (
        <Alert title="Partial telemetry mode" severity="warning">
          {health.warnings.join(' ')} Reliability analysis will continue with reduced confidence.
        </Alert>
      )}

      {health.stale && (
        <Alert title="Telemetry may be stale" severity="info">
          One or more datasources have not completed a successful query recently. Refresh or inspect datasource health in
          Grafana.
        </Alert>
      )}
    </div>
  );
}

function getHealthColor(status: DatasourceHealthStatus) {
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

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}

function truncateLabel(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}

const getStyles = (theme: GrafanaTheme2) => ({
  wrapper: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  badges: css`
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(0.75)};
  `,
  badgeWrap: css`
    cursor: default;
    line-height: 1;
  `,
});
