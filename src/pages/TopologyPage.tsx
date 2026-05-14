import React, { useMemo, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { PluginPage } from '@grafana/runtime';
import { Alert, Badge, Button, Spinner, useStyles2 } from '@grafana/ui';
import { OperationalStatusStrip } from '../components/OperationalStatusStrip';
import { testIds } from '../components/testIds';
import { useTopologyAnalysis } from '../hooks/useTopologyAnalysis';
import { PERFORMANCE_BUDGETS } from '../constants.performance';
import { ReliabilityControlPlaneSettings } from '../types';
import { CriticalPath, PropagationPath, ServiceEdge, ServiceNode, TopologyAnalysis } from '../types/topology';

function TopologyPage({ settings = {} }: { settings?: ReliabilityControlPlaneSettings }) {
  const styles = useStyles2(getStyles);
  const { analysis, error, loading, refresh, telemetryHealth } = useTopologyAnalysis(settings);

  return (
    <PluginPage>
      <section className={styles.page} data-testid={testIds.topologyPage.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Dependency intelligence</p>
            <h1 className={styles.title}>Service Topology</h1>
            <p className={styles.description}>
              Infer service relationships, critical paths, and incident propagation from Tempo traces and live
              reliability signals.
            </p>
          </div>
          <Button icon="sync" onClick={refresh} disabled={loading} variant="secondary">
            Refresh
          </Button>
        </header>

        {error && (
          <Alert title="Topology analysis failed" severity="warning">
            {error}
          </Alert>
        )}

        <OperationalStatusStrip health={telemetryHealth} />

        {loading && (
          <div className={styles.loadingState}>
            <Spinner />
            <span>Building dependency graph from Grafana datasources...</span>
          </div>
        )}

        {!loading && analysis && <TopologyContent analysis={analysis} />}
      </section>
    </PluginPage>
  );
}

export default TopologyPage;

function TopologyContent({ analysis }: { analysis: TopologyAnalysis }) {
  const styles = useStyles2(getStyles);
  const [edgePage, setEdgePage] = useState(1);
  const [propagationPage, setPropagationPage] = useState(1);
  const edgePageSize = PERFORMANCE_BUDGETS.topologyEdgeDisplayPage;
  const propagationPageSize = PERFORMANCE_BUDGETS.maxPropagationRowsUi;
  const visibleEdges = useMemo(
    () => analysis.graph.edges.slice(0, edgePage * edgePageSize),
    [analysis.graph.edges, edgePage, edgePageSize]
  );
  const visiblePropagations = useMemo(
    () => analysis.propagations.slice(0, propagationPage * propagationPageSize),
    [analysis.propagations, propagationPage, propagationPageSize]
  );
  const hasMoreEdges = visibleEdges.length < analysis.graph.edges.length;
  const hasMorePropagations = visiblePropagations.length < analysis.propagations.length;

  return (
    <>
      <div className={styles.summaryGrid}>
        <SummaryCard label="Graph health" value={analysis.graph.overallHealth} tone={analysis.graph.overallHealth} />
        <SummaryCard label="Services" value={String(analysis.graph.nodes.length)} />
        <SummaryCard label="Dependencies" value={String(analysis.graph.edges.length)} />
        <SummaryCard label="Propagations" value={String(analysis.propagations.length)} />
      </div>

      {analysis.debugMetrics && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Debug Metrics</h2>
          <div className={styles.summaryGrid}>
            <SummaryCard label="Traces Discovered" value={String(analysis.debugMetrics.tracesDiscovered)} />
            <SummaryCard label="Spans Parsed" value={String(analysis.debugMetrics.spansParsed)} />
            <SummaryCard label="Edges Inferred" value={String(analysis.debugMetrics.edgesInferred)} />
            <SummaryCard label="Incidents Matched" value={String(analysis.debugMetrics.incidentTriggersMatched)} />
          </div>
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Dependency Graph</h2>
          <Badge color={analysis.riskEdges.length > 0 ? 'orange' : 'green'} text={`${analysis.riskEdges.length} risky edges`} />
        </div>
        {analysis.graph.nodes.length === 0 ? (
          <EmptyState text="No topology data returned. Tempo traces with parent-child spans are required for dependency inference." />
        ) : (
          <div className={styles.graphCanvas}>
            <div className={styles.nodeGrid}>
              {analysis.graph.nodes.map((node) => (
                <ServiceNodeCard key={node.serviceName} node={node} />
              ))}
            </div>
            <div className={styles.edgeList}>
              {visibleEdges.map((edge) => (
                <ServiceEdgeRow edge={edge} key={`${edge.source}:${edge.target}`} />
              ))}
              {hasMoreEdges && (
                <Button
                  icon="angle-down"
                  onClick={() => setEdgePage((p) => p + 1)}
                  size="sm"
                  variant="secondary"
                >
                  Load more dependencies ({analysis.graph.edges.length - visibleEdges.length} remaining)
                </Button>
              )}
            </div>
          </div>
        )}
      </section>

      <div className={styles.twoColumn}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Critical Services</h2>
          <div className={styles.list}>
            {analysis.criticalServices.slice(0, 8).map((node) => (
              <ServiceRiskRow key={node.serviceName} node={node} />
            ))}
            {analysis.criticalServices.length === 0 && <EmptyState text="No high-criticality services detected." />}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Critical Paths</h2>
          <div className={styles.list}>
            {analysis.criticalPaths.slice(0, 6).map((path) => (
              <CriticalPathRow key={path.id} path={path} />
            ))}
            {analysis.criticalPaths.length === 0 && <EmptyState text="No critical dependency chains detected." />}
          </div>
        </section>
      </div>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Propagation Paths</h2>
        <div className={styles.list}>
          {visiblePropagations.map((propagation) => (
            <PropagationRow key={propagation.incidentId} propagation={propagation} />
          ))}
          {analysis.propagations.length === 0 && <EmptyState text="No active incident propagation paths detected." />}
          {hasMorePropagations && (
            <Button
              className={styles.loadMoreButton}
              icon="angle-down"
              onClick={() => setPropagationPage((p) => p + 1)}
              variant="secondary"
            >
              Load more propagation paths ({analysis.propagations.length - visiblePropagations.length} remaining)
            </Button>
          )}
        </div>
      </section>
    </>
  );
}

function SummaryCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: TopologyAnalysis['graph']['overallHealth'];
  value: string;
}) {
  const styles = useStyles2(getStyles);

  return (
    <article className={styles.summaryCard}>
      <span className={styles.cardLabel}>{label}</span>
      <strong className={styles.cardValue}>{value}</strong>
      {tone && <Badge color={getHealthColor(tone)} text={tone} />}
    </article>
  );
}

const ServiceNodeCard = React.memo(function ServiceNodeCard({ node }: { node: ServiceNode }) {
  const styles = useStyles2(getStyles);

  return (
    <article className={styles.nodeCard}>
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{node.serviceName}</h3>
        <Badge color={getNodeStatusColor(node.status)} text={node.status} />
      </div>
      <div className={styles.nodeMetrics}>
        <Metric label="Criticality" value={`${Math.round(node.criticality)}`} />
        <Metric label="Inbound" value={String(node.inDegree)} />
        <Metric label="Outbound" value={String(node.outDegree)} />
      </div>
      {(node.isIncidentRoot || node.isAffectedByPropagation) && (
        <div className={styles.badgeRow}>
          {node.isIncidentRoot && <Badge color="red" text="incident root" />}
          {node.isAffectedByPropagation && <Badge color="orange" text="propagation risk" />}
        </div>
      )}
    </article>
  );
});

const ServiceEdgeRow = React.memo(function ServiceEdgeRow({ edge }: { edge: ServiceEdge }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.edgeRow}>
      <div className={styles.edgePath}>
        <span>{edge.source}</span>
        <span className={styles.arrow}>{'->'}</span>
        <span>{edge.target}</span>
      </div>
      <div className={styles.badgeRow}>
        <Badge color={edge.isCritical ? 'red' : 'blue'} text={`${edge.observationCount} traces`} />
        <Badge color={(edge.latencyMs ?? 0) > 500 ? 'orange' : 'green'} text={formatLatency(edge.latencyMs)} />
      </div>
    </div>
  );
});

const ServiceRiskRow = React.memo(function ServiceRiskRow({ node }: { node: ServiceNode }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.compactRow}>
      <div>
        <strong>{node.serviceName}</strong>
        <p className={styles.rowText}>
          {node.inDegree} upstream callers, {node.outDegree} downstream dependencies
        </p>
      </div>
      <Badge color={node.criticality > 70 ? 'red' : 'orange'} text={`${Math.round(node.criticality)} risk`} />
    </div>
  );
});

const CriticalPathRow = React.memo(function CriticalPathRow({ path }: { path: CriticalPath }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.compactRow}>
      <div>
        <strong className={styles.chain}>{path.services.join(' -> ')}</strong>
        <p className={styles.rowText}>
          {path.degradedCount} degraded, estimated MTTR {path.estimatedMTTR ?? 'unknown'}m
        </p>
      </div>
      <Badge color={path.criticality > 70 ? 'red' : 'orange'} text={`${Math.round(path.criticality)} criticality`} />
    </div>
  );
});

const PropagationRow = React.memo(function PropagationRow({ propagation }: { propagation: PropagationPath }) {
  const styles = useStyles2(getStyles);

  return (
    <div className={styles.propagationRow}>
      <div>
        <div className={styles.cardHeader}>
          <strong>{propagation.originService}</strong>
          <Badge color={getSeverityColor(propagation.severity)} text={propagation.severity} />
        </div>
        <p className={styles.chain}>{propagation.affectedChain.join(' -> ')}</p>
        <p className={styles.rowText}>
          Blast radius {propagation.blastRadius} services, confidence {propagation.confidence}%
        </p>
      </div>
      <div className={styles.badgeRow}>
        {propagation.downstreamRiskServices.slice(0, 4).map((service) => (
          <Badge color="orange" key={service} text={service} />
        ))}
      </div>
    </div>
  );
});

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

function formatLatency(value: number | null): string {
  return value === null ? 'latency unknown' : `${value.toFixed(0)}ms`;
}

function getHealthColor(health: TopologyAnalysis['graph']['overallHealth']) {
  switch (health) {
    case 'critical':
      return 'red';
    case 'degraded':
      return 'orange';
    default:
      return 'green';
  }
}

function getNodeStatusColor(status: ServiceNode['status']) {
  switch (status) {
    case 'failed':
      return 'red';
    case 'degraded':
      return 'orange';
    case 'healthy':
      return 'green';
    default:
      return 'darkgrey';
  }
}

function getSeverityColor(severity: PropagationPath['severity']) {
  switch (severity) {
    case 'critical':
      return 'red';
    case 'warning':
      return 'orange';
    default:
      return 'blue';
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
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(2)};
  `,
  cardLabel: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  cardValue: css`
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
  graphCanvas: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: 2fr 1fr;
    padding: ${theme.spacing(2)};

    @media (max-width: 1000px) {
      grid-template-columns: 1fr;
    }
  `,
  nodeGrid: css`
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: repeat(3, minmax(0, 1fr));

    @media (max-width: 1000px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    @media (max-width: 640px) {
      grid-template-columns: 1fr;
    }
  `,
  nodeCard: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1.5)};
    min-height: 150px;
    padding: ${theme.spacing(2)};
  `,
  edgeList: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  edgeRow: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
    padding: ${theme.spacing(1.5)};
  `,
  edgePath: css`
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    font-family: ${theme.typography.fontFamilyMonospace};
    gap: ${theme.spacing(1)};
    overflow-wrap: anywhere;
  `,
  arrow: css`
    color: ${theme.colors.text.secondary};
  `,
  twoColumn: css`
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: repeat(2, minmax(0, 1fr));

    @media (max-width: 900px) {
      grid-template-columns: 1fr;
    }
  `,
  list: css`
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1)};
  `,
  compactRow: css`
    align-items: flex-start;
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    gap: ${theme.spacing(2)};
    justify-content: space-between;
    padding: ${theme.spacing(1.5)};
  `,
  propagationRow: css`
    background: ${theme.colors.background.secondary};
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    display: flex;
    flex-direction: column;
    gap: ${theme.spacing(1.5)};
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
  nodeMetrics: css`
    display: grid;
    gap: ${theme.spacing(1)};
    grid-template-columns: repeat(3, minmax(0, 1fr));
  `,
  metricLabel: css`
    color: ${theme.colors.text.secondary};
    display: block;
    font-size: ${theme.typography.bodySmall.fontSize};
  `,
  metricValue: css`
    display: block;
    font-weight: ${theme.typography.fontWeightMedium};
  `,
  badgeRow: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(1)};
  `,
  rowText: css`
    color: ${theme.colors.text.secondary};
    margin: ${theme.spacing(0.5)} 0 0;
  `,
  chain: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    overflow-wrap: anywhere;
  `,
  emptyState: css`
    border: 1px solid ${theme.colors.border.weak};
    border-radius: ${theme.shape.radius.default};
    color: ${theme.colors.text.secondary};
    padding: ${theme.spacing(3)};
    text-align: center;
  `,
  loadMoreButton: css`
    align-self: flex-start;
    margin-top: ${theme.spacing(1)};
  `,
});
