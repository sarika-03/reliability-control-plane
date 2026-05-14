import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { PluginPage } from '@grafana/runtime';
import { Alert, Badge, Button, LinkButton, Spinner, useStyles2 } from '@grafana/ui';
import { OperationalStatusStrip } from '../components/OperationalStatusStrip';
import { PLUGIN_NAME, ROUTES } from '../constants';
import { testIds } from '../components/testIds';
import { useReliabilityOverview } from '../hooks/useReliabilityOverview';
import { ReliabilityControlPlaneSettings, ReliabilityScore } from '../types';
import { prefixRoute } from '../utils/utils.routing';

function OverviewPage({ settings = {} }: { settings?: ReliabilityControlPlaneSettings }) {
  const styles = useStyles2(getStyles);
  const { error, loading, overview, refresh, telemetryHealth } = useReliabilityOverview(settings);
  const topScores = overview?.scores.slice(0, 6) ?? [];

  return (
    <PluginPage>
      <section className={styles.page} data-testid={testIds.overviewPage.container}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>SLO intelligence</p>
            <h1 className={styles.title}>{PLUGIN_NAME}</h1>
            <p className={styles.description}>
              Track reliability score, error-budget pressure, burn rate, and degraded services from Grafana datasources.
            </p>
          </div>
          <div className={styles.actions}>
            <Button icon="sync" onClick={refresh} disabled={loading} variant="secondary">
              Refresh
            </Button>
            <LinkButton href={prefixRoute(ROUTES.Services)} data-testid={testIds.overviewPage.navigateToServices}>
              View services
            </LinkButton>
            <LinkButton
              href={prefixRoute(ROUTES.Incidents)}
              data-testid={testIds.overviewPage.navigateToIncidents}
              variant="secondary"
            >
              Incidents
            </LinkButton>
          </div>
        </div>

        {error && (
          <Alert title="SLO analysis failed" severity="warning">
            {error}
          </Alert>
        )}

        <OperationalStatusStrip health={telemetryHealth} />

        {loading && (
          <div className={styles.loadingState}>
            <Spinner />
            <span>Calculating SLOs and reliability scores...</span>
          </div>
        )}

        {overview && (
          <>
            <div className={styles.summaryGrid}>
              <SummaryCard label="Reliability score" value={`${overview.averageReliabilityScore}`} />
              <SummaryCard label="Budget remaining" value={`${overview.averageBudgetRemainingPercent}%`} />
              <SummaryCard label="High-risk services" value={String(overview.highRiskServices.length)} />
              <SummaryCard label="Degraded services" value={String(overview.degradedServices.length)} />
            </div>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Reliability scorecards</h2>
                <Badge color="blue" text={`${overview.scores.length} services`} />
              </div>

              {topScores.length === 0 ? (
                <EmptyState text="Prometheus returned no service metrics for SLO analysis." />
              ) : (
                <div className={styles.scoreGrid}>
                  {topScores.map((score) => (
                    <ReliabilityCard key={score.serviceName} score={score} />
                  ))}
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Burn rate and error budget</h2>
                <Badge color={overview.highRiskServices.length > 0 ? 'orange' : 'green'} text="current window" />
              </div>
              <div className={styles.budgetGrid}>
                {(overview.highRiskServices.length > 0 ? overview.highRiskServices : topScores).slice(0, 4).map((score) => (
                  <BudgetCard key={score.serviceName} score={score} />
                ))}
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Trend summary</h2>
              <div className={styles.trendList}>
                {topScores.map((score) => (
                  <div className={styles.trendRow} key={score.serviceName}>
                    <div>
                      <strong>{score.serviceName}</strong>
                      <p className={styles.trendText}>{score.trend.summary}</p>
                    </div>
                    <Badge color={getTrendColor(score.trend.direction)} text={score.trend.direction} />
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </PluginPage>
  );
}

export default OverviewPage;

function SummaryCard({ label, value }: { label: string; value: string }) {
  const styles = useStyles2(getStyles);

  return (
    <article className={styles.summaryCard}>
      <span className={styles.cardLabel}>{label}</span>
      <strong className={styles.cardValue}>{value}</strong>
    </article>
  );
}

function ReliabilityCard({ score }: { score: ReliabilityScore }) {
  const styles = useStyles2(getStyles);

  return (
    <article className={styles.scoreCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{score.serviceName}</h3>
        <Badge color={getSeverityColor(score.degradationSeverity)} text={score.degradationSeverity} />
      </div>
      <strong className={styles.scoreValue}>{score.score}</strong>
      <div className={styles.metricGrid}>
        <Metric label="SLO compliance" value={`${score.sloCompliancePercent}%`} />
        <Metric label="Availability" value={formatPercent(score.slo.availabilityPercent)} />
        <Metric label="Latency SLO" value={score.slo.isLatencyCompliant ? 'Passing' : 'Breaching'} />
      </div>
    </article>
  );
}

function BudgetCard({ score }: { score: ReliabilityScore }) {
  const styles = useStyles2(getStyles);

  return (
    <article className={styles.budgetCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{score.serviceName}</h3>
        <Badge color={score.burnRate.isFastBurn ? 'red' : score.burnRate.isSlowBurn ? 'orange' : 'green'} text={getBurnLabel(score)} />
      </div>
      <div className={styles.metricGrid}>
        <Metric label="Budget remaining" value={`${score.errorBudget.remainingPercent}%`} />
        <Metric label="Burn rate" value={score.burnRate.value === null ? 'No data' : `${score.burnRate.value.toFixed(1)}x`} />
        <Metric label="Incidents" value={String(score.incidentFrequency)} />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const styles = useStyles2(getStyles);

  return (
    <div>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  const styles = useStyles2(getStyles);
  return <div className={styles.emptyState}>{text}</div>;
}

function formatPercent(value: number | null): string {
  return value === null ? 'No data' : `${value.toFixed(3)}%`;
}

function getBurnLabel(score: ReliabilityScore): string {
  if (score.burnRate.isFastBurn) {
    return 'fast burn';
  }

  if (score.burnRate.isSlowBurn) {
    return 'slow burn';
  }

  return 'within budget';
}

function getSeverityColor(severity: ReliabilityScore['degradationSeverity']) {
  switch (severity) {
    case 'critical':
      return 'red';
    case 'warning':
      return 'orange';
    default:
      return 'green';
  }
}

function getTrendColor(direction: ReliabilityScore['trend']['direction']) {
  switch (direction) {
    case 'critical':
      return 'red';
    case 'degrading':
      return 'orange';
    case 'stable':
    case 'improving':
      return 'green';
    default:
      return 'darkgrey';
  }
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
    gap: ${theme.spacing(3)};
    justify-content: space-between;

    @media (max-width: 900px) {
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
    font-size: ${theme.typography.h1.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0;
  `,
  description: css`
    color: ${theme.colors.text.secondary};
    line-height: ${theme.typography.body.lineHeight};
    margin: ${theme.spacing(1.5)} 0 0;
    max-width: 760px;
  `,
  actions: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
    justify-content: flex-end;

    @media (max-width: 900px) {
      justify-content: flex-start;
    }
  `,
  loadingState: css`
    align-items: center;
    color: ${theme.colors.text.secondary};
    display: flex;
    gap: ${theme.spacing(1)};
    min-height: 120px;
  `,
  summaryGrid: css`
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: repeat(4, minmax(0, 1fr));

    @media (max-width: 900px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 560px) {
      grid-template-columns: 1fr;
    }
  `,
  summaryCard: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(2)};
  `,
  cardLabel: css`
    color: ${theme.colors.text.secondary};
    display: block;
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  cardValue: css`
    display: block;
    font-size: ${theme.typography.h3.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  section: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(2)};
  `,
  sectionHeader: css`
    align-items: center;
    display: flex;
    gap: ${theme.spacing(1)};
    justify-content: space-between;
  `,
  sectionTitle: css`
    font-size: ${theme.typography.h4.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0;
  `,
  scoreGrid: css`
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: repeat(3, minmax(0, 1fr));

    @media (max-width: 1100px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 700px) {
      grid-template-columns: 1fr;
    }
  `,
  scoreCard: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(2)};
    padding: ${theme.spacing(2)};
  `,
  budgetGrid: css`
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: repeat(4, minmax(0, 1fr));

    @media (max-width: 1100px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 700px) {
      grid-template-columns: 1fr;
    }
  `,
  budgetCard: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(2)};
  `,
  cardHeader: css`
    align-items: flex-start;
    display: flex;
    gap: ${theme.spacing(1)};
    justify-content: space-between;
  `,
  cardTitle: css`
    font-size: ${theme.typography.h5.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0;
    overflow-wrap: anywhere;
  `,
  scoreValue: css`
    font-size: ${theme.typography.h2.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  metricGrid: css`
    display: grid;
    gap: ${theme.spacing(1.5)};
    grid-template-columns: repeat(3, minmax(0, 1fr));

    @media (max-width: 560px) {
      grid-template-columns: 1fr;
    }
  `,
  metricLabel: css`
    color: ${theme.colors.text.secondary};
    display: block;
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  metricValue: css`
    display: block;
    font-weight: ${theme.typography.fontWeightMedium};
    overflow-wrap: anywhere;
  `,
  trendList: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  trendRow: css`
    align-items: flex-start;
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    gap: ${theme.spacing(2)};
    justify-content: space-between;
    padding: ${theme.spacing(1.5)};
  `,
  trendText: css`
    color: ${theme.colors.text.secondary};
    margin: ${theme.spacing(0.5)} 0 0;
  `,
  emptyState: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    color: ${theme.colors.text.secondary};
    padding: ${theme.spacing(3)};
    text-align: center;
  `,
});
