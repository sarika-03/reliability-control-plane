import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { PluginPage } from '@grafana/runtime';
import { Alert, Badge, Button, Spinner, useStyles2 } from '@grafana/ui';
import { OperationalStatusStrip } from '../components/OperationalStatusStrip';
import { testIds } from '../components/testIds';
import { useServiceHealth } from '../hooks/useServiceHealth';
import { ReliabilityControlPlaneSettings, ServiceHealth, ServiceHealthStatus } from '../types';

function ServicesPage({ settings = {} }: { settings?: ReliabilityControlPlaneSettings }) {
  const styles = useStyles2(getStyles);
  const { datasources, error, loading, refresh, services, telemetryHealth } = useServiceHealth(settings);

  return (
    <PluginPage>
      <section className={styles.page} data-testid={testIds.servicesPage.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Fleet health</p>
            <h1 className={styles.title}>Services</h1>
            <p className={styles.description}>
              Service inventory and health are queried from configured Grafana datasources at runtime. This plugin does
              not duplicate Prometheus, Loki, or Tempo telemetry.
            </p>
          </div>
          <Button icon="sync" onClick={refresh} disabled={loading} variant="secondary">
            Refresh
          </Button>
        </header>

        <div className={styles.datasourceStrip}>
          <DatasourceBadge label="Prometheus" connected={Boolean(datasources?.prometheus)} />
          <DatasourceBadge label="Loki" connected={Boolean(datasources?.loki)} />
          <DatasourceBadge label="Tempo" connected={Boolean(datasources?.tempo)} />
        </div>

        <OperationalStatusStrip health={telemetryHealth} />

        {error && (
          <Alert title="Datasource query failed" severity="warning">
            {error}
          </Alert>
        )}

        {loading && (
          <div className={styles.loadingState}>
            <Spinner />
            <span>Querying Grafana datasources...</span>
          </div>
        )}

        {!loading && !error && services.length === 0 && (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>No service metrics returned</h2>
            <p className={styles.emptyText}>
              Prometheus is configured, but adaptive discovery did not find usable RED metrics in the active time
              range. Generate traffic or verify that request counters and latency histograms are being ingested.
            </p>
          </div>
        )}

        {!loading && services.length > 0 && (
          <div className={styles.serviceGrid}>
            {services.map((service) => (
              <ServiceCard key={service.serviceName} service={service} />
            ))}
          </div>
        )}
      </section>
    </PluginPage>
  );
}

export default ServicesPage;

function DatasourceBadge({ connected, label }: { connected: boolean; label: string }) {
  return <Badge color={connected ? 'green' : 'darkgrey'} text={`${label}: ${connected ? 'connected' : 'not found'}`} />;
}

function ServiceCard({ service }: { service: ServiceHealth }) {
  const styles = useStyles2(getStyles);

  return (
    <article className={styles.serviceCard}>
      <div className={styles.cardHeader}>
        <h2 className={styles.serviceName}>{service.serviceName}</h2>
        <Badge color={getStatusColor(service.status)} text={service.status} />
      </div>
      <div className={styles.metricGrid}>
        <Metric label="Request rate" value={formatPerSecond(service.metrics.requestRatePerSecond)} />
        <Metric label="Error rate" value={formatPercent(service.metrics.errorRatePercent)} />
        <Metric label="Latency p95" value={formatSeconds(service.metrics.latencyP95Seconds)} />
      </div>
      <p className={styles.cardMeta}>Prometheus UID: {service.datasourceUid}</p>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </div>
  );
}

function getStatusColor(status: ServiceHealthStatus) {
  switch (status) {
    case 'healthy':
      return 'green';
    case 'warning':
      return 'orange';
    case 'critical':
      return 'red';
    default:
      return 'darkgrey';
  }
}

function formatPerSecond(value: number | null): string {
  return value === null ? 'No data' : `${value.toFixed(2)}/s`;
}

function formatPercent(value: number | null): string {
  return value === null ? 'No data' : `${value.toFixed(2)}%`;
}

function formatSeconds(value: number | null): string {
  return value === null ? 'No data' : `${value.toFixed(3)}s`;
}

const getStyles = (theme: GrafanaTheme2) => ({
  page: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(3)};
  `,
  header: css`
    align-items: flex-start;
    display: flex;
    gap: ${theme.spacing(2)};
    justify-content: space-between;

    @media (max-width: 700px) {
      flex-direction: column;
    }
  `,
  eyebrow: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0 0 ${theme.spacing(1)};
    text-transform: uppercase;
  `,
  title: css`
    font-size: ${theme.typography.h2.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0;
  `,
  description: css`
    color: ${theme.colors.text.secondary};
    line-height: ${theme.typography.body.lineHeight};
    margin: ${theme.spacing(1)} 0 0;
    max-width: 760px;
  `,
  datasourceStrip: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
  `,
  loadingState: css`
    align-items: center;
    color: ${theme.colors.text.secondary};
    display: flex;
    gap: ${theme.spacing(1)};
    min-height: 120px;
  `,
  emptyState: css`
    align-items: center;
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 280px;
    padding: ${theme.spacing(4, 2)};
    text-align: center;
  `,
  emptyTitle: css`
    font-size: ${theme.typography.h4.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0 0 ${theme.spacing(1)};
  `,
  emptyText: css`
    color: ${theme.colors.text.secondary};
    line-height: ${theme.typography.body.lineHeight};
    margin: 0;
    max-width: 640px;
  `,
  serviceGrid: css`
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: repeat(3, minmax(0, 1fr));

    @media (max-width: 1200px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 800px) {
      grid-template-columns: 1fr;
    }
  `,
  serviceCard: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(2)};
    min-height: 180px;
    padding: ${theme.spacing(2)};
  `,
  cardHeader: css`
    align-items: flex-start;
    display: flex;
    gap: ${theme.spacing(1)};
    justify-content: space-between;
  `,
  serviceName: css`
    font-size: ${theme.typography.h4.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  `,
  metricGrid: css`
    display: grid;
    gap: ${theme.spacing(1.5)};
    grid-template-columns: repeat(3, minmax(0, 1fr));

    @media (max-width: 520px) {
      grid-template-columns: 1fr;
    }
  `,
  metric: css`
    min-width: 0;
  `,
  metricLabel: css`
    color: ${theme.colors.text.secondary};
    display: block;
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  metricValue: css`
    display: block;
    font-size: ${theme.typography.h5.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    overflow-wrap: anywhere;
  `,
  cardMeta: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    margin: auto 0 0;
    overflow-wrap: anywhere;
  `,
});
