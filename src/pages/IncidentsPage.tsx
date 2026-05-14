import React, { useCallback, useMemo, useState } from 'react';
import { cx, css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { PluginPage } from '@grafana/runtime';
import { Alert, Badge, Button, Spinner, useStyles2 } from '@grafana/ui';
import { useSearchParams } from 'react-router-dom';
import { OperationalStatusStrip } from '../components/OperationalStatusStrip';
import { TelemetryDebugPanel } from '../components/TelemetryDebugPanel';
import { testIds } from '../components/testIds';
import { useIncidentCorrelation } from '../hooks/useIncidentCorrelation';
import {
  IncidentSeverity,
  IncidentSignal,
  OperationalRecommendation,
  ReliabilityControlPlaneSettings,
  ReliabilityEvent,
  ReliabilityTrendInsight,
} from '../types';
import { buildLogsExploreUrl, buildMetricsExploreUrl, buildTraceExploreUrl } from '../services/explore';
import { downloadIncidentSnapshot } from '../services/export';
import { analyzeReliabilityTrends } from '../services/trends';
import { PERFORMANCE_BUDGETS } from '../constants.performance';
import { sortIncidentSignals } from '../utils/incidentPresentation';

const PAGE_SIZE = PERFORMANCE_BUDGETS.maxIncidentRows;

function IncidentsPage({ settings = {} }: { settings?: ReliabilityControlPlaneSettings }) {
  const styles = useStyles2(getStyles);
  const [searchParams] = useSearchParams();
  const showTelemetryDebug = searchParams.get('rcpDebug') === '1';
  const { correlation, datasources, error, loading, refresh, telemetryHealth, telemetryDebug } = useIncidentCorrelation(
    settings,
    showTelemetryDebug
  );
  const [page, setPage] = useState(0);
  const signals = useMemo(() => correlation?.signals ?? [], [correlation]);
  const orderedSignals = useMemo(() => sortIncidentSignals(signals), [signals]);
  const visibleSignals = orderedSignals.slice(0, (page + 1) * PAGE_SIZE);
  const trends = useMemo(() => analyzeReliabilityTrends(orderedSignals), [orderedSignals]);

  return (
    <PluginPage>
      <section className={styles.page} data-testid={testIds.incidentsPage.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Correlation engine</p>
            <h1 className={styles.title}>Incidents</h1>
            <p className={styles.description}>
              Reliability signals are correlated from Loki error patterns and Prometheus service metrics through
              configured Grafana datasources.
            </p>
            <p className={styles.kbdHint}>
              Incident cards: focus a card, then <kbd>L</kbd> logs · <kbd>M</kbd> metrics · <kbd>D</kbd> details ·{' '}
              <kbd>T</kbd> first trace
            </p>
          </div>
          <Button icon="sync" onClick={refresh} disabled={loading} variant="secondary">
            Refresh
          </Button>
        </header>

        {correlation && (
          <div className={styles.summaryGrid}>
            <SummaryStat label="Confidence" value={`${correlation.confidence}%`} />
            <SummaryStat label="Signals" value={String(correlation.signals.length)} />
            <SummaryStat label="Error patterns" value={String(correlation.errorPatterns.length)} />
            <SummaryStat label="Telemetry completeness" value={`${correlation.telemetryCompleteness}%`} />
          </div>
        )}

        <OperationalStatusStrip health={telemetryHealth} />

        {showTelemetryDebug && telemetryDebug && <TelemetryDebugPanel debug={telemetryDebug} health={telemetryHealth} />}

        {trends.length > 0 && (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Reliability trend signals</h2>
              <Badge color="blue" text={`${trends.length} insights`} />
            </div>
            <div className={styles.trendGrid}>
              {trends.map((trend) => (
                <TrendCard key={trend.id} trend={trend} />
              ))}
            </div>
          </section>
        )}

        {error && (
          <Alert title="Incident correlation failed" severity="warning">
            {error}
          </Alert>
        )}

        {loading && (
          <div className={styles.loadingState}>
            <Spinner />
            <span>Querying Loki and correlating incident signals...</span>
          </div>
        )}

        {!loading && !error && orderedSignals.length === 0 && (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>No active incident signals detected</h2>
            <p className={styles.emptyText}>
              Loki and Prometheus queries completed, but no dominant error pattern or unhealthy service metric crossed
              the current correlation thresholds.
            </p>
          </div>
        )}

        {!loading && orderedSignals.length > 0 && (
          <>
            <div className={styles.incidentList}>
              {visibleSignals.map((signal) => (
                <IncidentCard key={signal.id} datasources={datasources} signal={signal} />
              ))}
            </div>
            {visibleSignals.length < orderedSignals.length && (
              <Button className={styles.loadMoreButton} icon="angle-down" onClick={() => setPage((value) => value + 1)} variant="secondary">
                Show next {Math.min(PAGE_SIZE, orderedSignals.length - visibleSignals.length)} incidents
              </Button>
            )}
          </>
        )}
      </section>
    </PluginPage>
  );
}

export default IncidentsPage;

function SummaryStat({ label, value }: { label: string; value: string }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.summaryCard}>
      <span className={styles.summaryLabel}>{label}</span>
      <strong className={styles.summaryValue}>{value}</strong>
    </div>
  );
}

const TrendCard = React.memo(function TrendCard({ trend }: { trend: ReliabilityTrendInsight }) {
  const styles = useStyles2(getStyles);

  return (
    <article className={styles.trendCard}>
      <div className={styles.rowHeader}>
        <strong>{trend.title}</strong>
        <Badge color={getSeverityColor(trend.severity)} text={trend.severity} />
        <Badge color="darkgrey" text={`${trend.score}/100`} />
      </div>
      <p className={styles.rowText}>{trend.summary}</p>
      {trend.serviceName && <p className={styles.rowMeta}>{trend.serviceName}</p>}
    </article>
  );
});

const IncidentCard = React.memo(function IncidentCard({
  datasources,
  signal,
}: {
  datasources: ReturnType<typeof useIncidentCorrelation>['datasources'];
  signal: IncidentSignal;
}) {
  const styles = useStyles2(getStyles);
  const [expanded, setExpanded] = useState(false);
  const logsUrl = buildLogsExploreUrl(signal, {
    loki: datasources?.loki,
    prometheus: datasources?.prometheus,
    tempo: datasources?.tempo,
  });
  const metricsUrl = buildMetricsExploreUrl(signal, {
    loki: datasources?.loki,
    prometheus: datasources?.prometheus,
    tempo: datasources?.tempo,
  });
  const firstTraceUrl = useMemo(() => {
    const first = signal.relatedTraces[0];
    if (!first || !datasources?.tempo) {
      return undefined;
    }
    return buildTraceExploreUrl(
      first.traceId,
      { loki: datasources.loki, prometheus: datasources.prometheus, tempo: datasources.tempo },
      { from: signal.firstSeen, to: signal.lastSeen }
    );
  }, [datasources, signal.firstSeen, signal.lastSeen, signal.relatedTraces]);

  const onCardKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement;
      if (target.closest('button, a, [href], input, textarea, select, [contenteditable="true"]')) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 'l' && logsUrl) {
        event.preventDefault();
        openExplore(logsUrl);
        return;
      }
      if (key === 'm' && metricsUrl) {
        event.preventDefault();
        openExplore(metricsUrl);
        return;
      }
      if (key === 'd' || event.key === ' ') {
        event.preventDefault();
        setExpanded((value) => !value);
        return;
      }
      if (key === 't' && firstTraceUrl) {
        event.preventDefault();
        openExplore(firstTraceUrl);
      }
    },
    [firstTraceUrl, logsUrl, metricsUrl]
  );

  return (
    <article
      aria-expanded={expanded}
      aria-label={`${signal.title}, severity ${signal.severity}`}
      className={cx(
        styles.incidentCard,
        signal.severity === 'critical' && styles.incidentBorderCritical,
        signal.severity === 'warning' && styles.incidentBorderWarning,
        signal.severity === 'info' && styles.incidentBorderInfo
      )}
      onKeyDown={onCardKeyDown}
      role="article"
      tabIndex={0}
    >
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.incidentTitle}>{signal.title}</h2>
          <p className={styles.incidentSummary}>{signal.summary}</p>
        </div>
        <div className={styles.badgeStack}>
          <Badge color={getSeverityColor(signal.severity)} text={signal.severity} />
          <Badge color="blue" text={`${signal.confidence}% confidence`} />
        </div>
      </div>

      <div className={styles.detailGrid}>
        <Detail label="Affected services" value={signal.affectedServices.join(', ')} />
        <Detail label="First seen" value={formatTimestamp(signal.firstSeen)} />
        <Detail label="Last seen" value={formatTimestamp(signal.lastSeen)} />
        <Detail label="Related traces" value={String(signal.relatedTraces.length)} />
      </div>

      {signal.dominantError && (
        <div className={styles.errorPattern}>
          <div className={styles.patternHeader}>
            <span>Dominant error</span>
            <Badge color="darkgrey" text={`${signal.dominantError.occurrenceCount} occurrences`} />
          </div>
          <code className={styles.signature}>{signal.dominantError.signature}</code>
          <p className={styles.exampleMessage}>{signal.dominantError.exampleMessage}</p>
        </div>
      )}

      <div className={styles.actionRow}>
        <Button
          className={styles.drilldownButton}
          icon={expanded ? 'angle-up' : 'angle-down'}
          onClick={() => setExpanded((value) => !value)}
          variant="secondary"
        >
          {expanded ? 'Hide analysis' : 'Show analysis'}
        </Button>
        <Button icon="gf-logs" onClick={() => openExplore(logsUrl)} disabled={!logsUrl} variant="secondary">
          Open logs
        </Button>
        <Button icon="chart-line" onClick={() => openExplore(metricsUrl)} disabled={!metricsUrl} variant="secondary">
          Open metrics
        </Button>
        <Button icon="download-alt" onClick={() => downloadIncidentSnapshot(signal)} variant="secondary">
          Export JSON
        </Button>
      </div>

      {expanded && <IncidentDrilldown datasources={datasources} signal={signal} />}
    </article>
  );
});

const IncidentDrilldown = React.memo(function IncidentDrilldown({
  datasources,
  signal,
}: {
  datasources: ReturnType<typeof useIncidentCorrelation>['datasources'];
  signal: IncidentSignal;
}) {
  const styles = useStyles2(getStyles);
  const rootCause = signal.rootCause;
  const maxTraces = PERFORMANCE_BUDGETS.maxRelatedTracesInIncidentUi;
  const tracesVisible = useMemo(() => signal.relatedTraces.slice(0, maxTraces), [maxTraces, signal.relatedTraces]);

  return (
    <div className={styles.drilldown}>
      {signal.incidentSummary && (
        <section className={styles.analysisSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Operational summary</h3>
            <Badge color={getSeverityColor(signal.incidentSummary.operationalSeverity)} text={signal.incidentSummary.operationalSeverity} />
          </div>
          <p className={styles.analysisText}>{signal.incidentSummary.executiveSummary}</p>
          <div className={styles.detailGrid}>
            <Detail label="Dominant cause" value={signal.incidentSummary.dominantFailureCause} />
            <Detail label="Blast radius" value={signal.incidentSummary.blastRadiusSummary} />
            <Detail label="Suspected owner" value={signal.incidentSummary.suspectedOwner ?? 'Unknown'} />
            <Detail label="Escalation stage" value={signal.timeline?.escalationStage ?? 'detected'} />
          </div>
        </section>
      )}

      {signal.operationalRisk && (
        <section className={styles.analysisSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Operational risk</h3>
            <Badge color={getSeverityColor(signal.operationalRisk.severity)} text={`${signal.operationalRisk.score}/100`} />
          </div>
          <p className={styles.analysisText}>{signal.operationalRisk.summary}</p>
          {signal.operationalRisk.factors.length > 0 && (
            <div className={styles.impactList}>
              {signal.operationalRisk.factors.map((factor) => (
                <Badge key={factor} color="darkgrey" text={factor} />
              ))}
            </div>
          )}
        </section>
      )}

      {signal.recommendations && signal.recommendations.length > 0 && (
        <section className={styles.analysisSection}>
          <h3 className={styles.sectionTitle}>Recommended actions</h3>
          <div className={styles.recommendationList}>
            {signal.recommendations.map((recommendation) => (
              <RecommendationRow key={recommendation.id} recommendation={recommendation} />
            ))}
          </div>
        </section>
      )}

      {signal.timeline && signal.timeline.events.length > 0 && (
        <section className={styles.analysisSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Incident timeline</h3>
            <Badge color={getEventStageColor(signal.timeline.escalationStage)} text={signal.timeline.escalationStage} />
          </div>
          <div className={styles.timelineList}>
            {signal.timeline.events.map((event) => (
              <TimelineRow key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {rootCause ? (
        <section className={styles.analysisSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Suspected root cause</h3>
            <Badge color="blue" text={`${rootCause.confidence}% confidence`} />
          </div>
          <p className={styles.analysisText}>{rootCause.probableRootCause}</p>
          <div className={styles.detailGrid}>
            <Detail label="Suspected service" value={rootCause.suspectedService ?? 'Unknown'} />
            <Detail label="Suspected dependency" value={rootCause.suspectedDependency ?? 'None'} />
            <Detail label="Dominant operation" value={rootCause.dominantFailingOperation ?? 'Unknown'} />
            <Detail label="Impact severity" value={rootCause.blastRadius.impactSeverity} />
          </div>
        </section>
      ) : (
        <Alert title="Root cause needs more trace context" severity="info">
          No Tempo spans were linked strongly enough to produce a root-cause candidate.
        </Alert>
      )}

      {signal.sloImpact && (
        <section className={styles.analysisSection}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>SLO impact</h3>
            <Badge color={signal.sloImpact.highRisk ? 'orange' : 'green'} text={signal.sloImpact.highRisk ? 'high risk' : 'contained'} />
          </div>
          <p className={styles.analysisText}>{signal.sloImpact.summary}</p>
          <div className={styles.detailGrid}>
            <Detail label="Budget consumed" value={`${signal.sloImpact.estimatedBudgetConsumedPercent}%`} />
            <Detail
              label="Burn rate"
              value={signal.sloImpact.burnRate === null ? 'No data' : `${signal.sloImpact.burnRate.toFixed(1)}x`}
            />
            <Detail label="Service" value={signal.sloImpact.serviceName} />
          </div>
        </section>
      )}

      {rootCause && (
        <section className={styles.analysisSection}>
          <h3 className={styles.sectionTitle}>Blast radius</h3>
          <div className={styles.detailGrid}>
            <Detail label="Affected services" value={rootCause.blastRadius.affectedServices.join(', ') || 'None'} />
            <Detail label="Upstream callers" value={rootCause.blastRadius.upstreamCallers.join(', ') || 'None'} />
            <Detail
              label="Downstream dependencies"
              value={rootCause.blastRadius.downstreamDependencies.join(', ') || 'None'}
            />
          </div>
          {rootCause.blastRadius.dependencyImpacts.length > 0 && (
            <div className={styles.impactList}>
              {rootCause.blastRadius.dependencyImpacts.map((impact) => (
                <Badge
                  key={`${impact.role}:${impact.serviceName}`}
                  color={getSeverityColor(impact.impactSeverity)}
                  text={`${impact.role}: ${impact.serviceName}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {rootCause && (rootCause.failingSpans.length > 0 || rootCause.slowSpans.length > 0) && (
        <section className={styles.analysisSection}>
          <h3 className={styles.sectionTitle}>Slow and failing spans</h3>
          <div className={styles.spanList}>
            {[...rootCause.failingSpans, ...rootCause.slowSpans].slice(0, 6).map((span) => (
              <div className={styles.spanRow} key={`${span.traceId}:${span.spanId}`}>
                <div>
                  <strong>{span.operationName}</strong>
                  <p className={styles.spanMeta}>
                    {span.serviceName} · {span.durationMs === null ? 'duration unknown' : `${span.durationMs.toFixed(2)}ms`}
                  </p>
                </div>
                <Badge color={span.isError ? 'red' : 'orange'} text={span.isError ? 'failing' : 'slow'} />
              </div>
            ))}
          </div>
        </section>
      )}

      {tracesVisible.length > 0 && (
        <section className={styles.analysisSection}>
          <h3 className={styles.sectionTitle}>Related traces</h3>
          {signal.relatedTraces.length > tracesVisible.length && (
            <p className={styles.rowMeta}>
              Showing {tracesVisible.length} of {signal.relatedTraces.length} trace links (export JSON for the full
              list).
            </p>
          )}
          <div className={styles.traceList}>
            {tracesVisible.map((trace) => (
              <div className={styles.traceRow} key={trace.traceId}>
                <code className={styles.traceId}>{trace.traceId}</code>
                <div className={styles.traceBadges}>
                  <Badge color="darkgrey" text={`${trace.spanCount} spans`} />
                  <Badge color={trace.errorSpanCount > 0 ? 'red' : 'green'} text={`${trace.errorSpanCount} errors`} />
                  <Button
                    size="sm"
                    icon="external-link-alt"
                    onClick={() =>
                      openExplore(
                        buildTraceExploreUrl(trace.traceId, {
                          loki: datasources?.loki,
                          prometheus: datasources?.prometheus,
                          tempo: datasources?.tempo,
                        }, { from: signal.firstSeen, to: signal.lastSeen })
                      )
                    }
                    disabled={!datasources?.tempo}
                    variant="secondary"
                  >
                    Explore
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

function RecommendationRow({ recommendation }: { recommendation: OperationalRecommendation }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.recommendationRow}>
      <div>
        <div className={styles.rowHeader}>
          <strong>{recommendation.title}</strong>
          <Badge color={getPriorityColor(recommendation.priority)} text={recommendation.priority} />
          <Badge color="blue" text={formatCategory(recommendation.category)} />
        </div>
        <p className={styles.rowText}>{recommendation.description}</p>
        <p className={styles.rowMeta}>{recommendation.rationale}</p>
      </div>
    </div>
  );
}

function TimelineRow({ event }: { event: ReliabilityEvent }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.timelineRow}>
      <div className={styles.timelineMarker}>
        <Badge color={getEventSourceColor(event.source)} text={event.source} />
      </div>
      <div>
        <div className={styles.rowHeader}>
          <strong>{event.title}</strong>
          <Badge color={getEventStageColor(event.stage)} text={event.stage} />
          <Badge color={getSeverityColor(event.severity)} text={event.severity} />
        </div>
        <p className={styles.rowText}>{event.description}</p>
        <p className={styles.rowMeta}>
          {formatTimestamp(event.timestamp)}
          {event.serviceName ? ` · ${event.serviceName}` : ''}
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const styles = useStyles2(getStyles);

  return (
    <div>
      <span className={styles.detailLabel}>{label}</span>
      <strong className={styles.detailValue}>{value}</strong>
    </div>
  );
}

function getSeverityColor(severity: IncidentSeverity) {
  switch (severity) {
    case 'critical':
      return 'red';
    case 'warning':
      return 'orange';
    default:
      return 'blue';
  }
}

function getPriorityColor(priority: OperationalRecommendation['priority']) {
  switch (priority) {
    case 'immediate':
      return 'red';
    case 'soon':
      return 'orange';
    default:
      return 'green';
  }
}

function getEventStageColor(stage: ReliabilityEvent['stage']) {
  switch (stage) {
    case 'escalating':
      return 'red';
    case 'propagating':
      return 'orange';
    case 'contained':
      return 'green';
    default:
      return 'blue';
  }
}

function getEventSourceColor(source: ReliabilityEvent['source']) {
  switch (source) {
    case 'loki':
      return 'orange';
    case 'tempo':
      return 'purple';
    case 'slo':
      return 'red';
    case 'topology':
      return 'blue';
    default:
      return 'green';
  }
}

function formatCategory(category: OperationalRecommendation['category']): string {
  return category.replace('-', ' ');
}

function openExplore(url: string | undefined): void {
  if (!url) {
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
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
  kbdHint: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    line-height: ${theme.typography.bodySmall.lineHeight};
    margin: ${theme.spacing(1)} 0 0;
    max-width: 760px;

    kbd {
      background: ${theme.colors.background.primary};
      border: 1px solid ${theme.colors.border.weak};
      border-radius: ${theme.shape.radius.default};
      font-family: ${theme.typography.fontFamilyMonospace};
      font-size: ${theme.typography.bodySmall.fontSize};
      padding: 0 ${theme.spacing(0.75)};
    }
  `,
  summaryGrid: css`
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: repeat(4, minmax(0, 1fr));

    @media (max-width: 900px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 520px) {
      grid-template-columns: 1fr;
    }
  `,
  summaryCard: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(2)};
  `,
  summaryLabel: css`
    color: ${theme.colors.text.secondary};
    display: block;
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  summaryValue: css`
    display: block;
    font-size: ${theme.typography.h4.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
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
    max-width: 620px;
  `,
  incidentList: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(2)};
  `,
  section: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1.5)};
  `,
  incidentCard: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-left: 3px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1.75)};
    outline: none;
    padding: ${theme.spacing(1.75)};

    &:focus-visible {
      box-shadow: 0 0 0 2px ${theme.colors.primary.main};
    }
  `,
  incidentBorderCritical: css`
    border-left-color: ${theme.colors.error.text};
  `,
  incidentBorderWarning: css`
    border-left-color: ${theme.colors.warning.text};
  `,
  incidentBorderInfo: css`
    border-left-color: ${theme.colors.info.text};
  `,
  cardHeader: css`
    align-items: flex-start;
    display: flex;
    gap: ${theme.spacing(2)};
    justify-content: space-between;

    @media (max-width: 700px) {
      flex-direction: column;
    }
  `,
  incidentTitle: css`
    font-size: ${theme.typography.h4.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0;
  `,
  incidentSummary: css`
    color: ${theme.colors.text.secondary};
    line-height: ${theme.typography.body.lineHeight};
    margin: ${theme.spacing(1)} 0 0;
  `,
  badgeStack: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
    justify-content: flex-end;

    @media (max-width: 700px) {
      justify-content: flex-start;
    }
  `,
  detailGrid: css`
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
  detailLabel: css`
    color: ${theme.colors.text.secondary};
    display: block;
    font-size: ${theme.typography.bodySmall.fontSize};
    margin-bottom: ${theme.spacing(0.5)};
  `,
  detailValue: css`
    display: block;
    font-weight: ${theme.typography.fontWeightMedium};
    overflow-wrap: anywhere;
  `,
  errorPattern: css`
    border-top: 1px solid ${theme.colors.border.weak};
    padding-top: ${theme.spacing(2)};
  `,
  patternHeader: css`
    align-items: center;
    color: ${theme.colors.text.secondary};
    display: flex;
    font-size: ${theme.typography.bodySmall.fontSize};
    gap: ${theme.spacing(1)};
    justify-content: space-between;
    margin-bottom: ${theme.spacing(1)};
  `,
  signature: css`
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: block;
    overflow-wrap: anywhere;
    padding: ${theme.spacing(1)};
    white-space: pre-wrap;
  `,
  exampleMessage: css`
    color: ${theme.colors.text.secondary};
    line-height: ${theme.typography.body.lineHeight};
    margin: ${theme.spacing(1)} 0 0;
    overflow-wrap: anywhere;
  `,
  drilldownButton: css`
    align-self: flex-start;
  `,
  actionRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
  `,
  loadMoreButton: css`
    align-self: flex-start;
  `,
  drilldown: css`
    border-top: 1px solid ${theme.colors.border.weak};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(2)};
    padding-top: ${theme.spacing(2)};
  `,
  analysisSection: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1.5)};
  `,
  sectionHeader: css`
    align-items: center;
    display: flex;
    gap: ${theme.spacing(1)};
    justify-content: space-between;
  `,
  sectionTitle: css`
    font-size: ${theme.typography.h5.fontSize};
    font-weight: ${theme.typography.fontWeightMedium};
    margin: 0;
  `,
  analysisText: css`
    color: ${theme.colors.text.secondary};
    line-height: ${theme.typography.body.lineHeight};
    margin: 0;
  `,
  impactList: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
  `,
  spanList: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  spanRow: css`
    align-items: flex-start;
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    gap: ${theme.spacing(1)};
    justify-content: space-between;
    padding: ${theme.spacing(1.5)};
  `,
  spanMeta: css`
    color: ${theme.colors.text.secondary};
    margin: ${theme.spacing(0.5)} 0 0;
  `,
  traceList: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  traceRow: css`
    align-items: center;
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    gap: ${theme.spacing(1)};
    justify-content: space-between;
    padding: ${theme.spacing(1)};

    @media (max-width: 700px) {
      align-items: flex-start;
      flex-direction: column;
    }
  `,
  traceId: css`
    overflow-wrap: anywhere;
  `,
  traceBadges: css`
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
  `,
  trendGrid: css`
    display: grid;
    gap: ${theme.spacing(1)};
    grid-template-columns: repeat(2, minmax(0, 1fr));

    @media (max-width: 900px) {
      grid-template-columns: 1fr;
    }
  `,
  trendCard: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1.5)};
  `,
  recommendationList: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  recommendationRow: css`
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    padding: ${theme.spacing(1.5)};
  `,
  rowHeader: css`
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
  `,
  rowText: css`
    color: ${theme.colors.text.primary};
    line-height: ${theme.typography.body.lineHeight};
    margin: ${theme.spacing(0.75)} 0 0;
  `,
  rowMeta: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    line-height: ${theme.typography.bodySmall.lineHeight};
    margin: ${theme.spacing(0.5)} 0 0;
  `,
  timelineList: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  timelineRow: css`
    align-items: flex-start;
    background: ${theme.colors.background.primary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: grid;
    gap: ${theme.spacing(1.5)};
    grid-template-columns: minmax(92px, auto) 1fr;
    padding: ${theme.spacing(1.5)};

    @media (max-width: 560px) {
      grid-template-columns: 1fr;
    }
  `,
  timelineMarker: css`
    align-items: flex-start;
    display: flex;
  `,
});
