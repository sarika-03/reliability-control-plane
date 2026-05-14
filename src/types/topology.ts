import { IncidentSeverity } from './incidents';

/**
 * Represents a node in the service dependency graph
 */
export interface ServiceNode {
  /** Unique service identifier */
  serviceName: string;

  /** Current health status */
  status: 'healthy' | 'degraded' | 'failed' | 'unknown';

  /** Criticality score (0-100) based on in-degree, error rate, SLO impact */
  criticality: number;

  /** How many other services directly depend on this service */
  inDegree: number;

  /** How many services this service directly depends on */
  outDegree: number;

  /** Number of critical dependency chains this service participates in */
  betweenness: number;

  /** Error rate percentage at query time */
  errorRatePercent: number | null;

  /** P95 latency in seconds */
  latencyP95Seconds: number | null;

  /** If true, node is part of an active incident */
  isIncidentRoot: boolean;

  /** If true, node was affected by incident propagation */
  isAffectedByPropagation: boolean;
}

/**
 * Represents a directed dependency relationship between services
 */
export interface ServiceEdge {
  /** Calling service */
  source: string;

  /** Called service */
  target: string;

  /** Type of relationship */
  type: 'direct' | 'inferred';

  /** Average latency of calls along this edge (milliseconds) */
  latencyMs: number | null;

  /** Error rate for calls along this edge (percentage) */
  errorRatePercent: number | null;

  /** Number of independent trace observations supporting this edge */
  observationCount: number;

  /** Criticality of this dependency (0-100) */
  criticality: number;

  /** If true, this edge is critical to system operation */
  isCritical: boolean;

  /** Operation names observed across this edge */
  operations: string[];
}

/**
 * Complete service dependency graph
 */
export interface DependencyGraph {
  /** Timestamp when graph was inferred */
  generatedAt: string;

  /** All service nodes in the graph */
  nodes: ServiceNode[];

  /** All dependency edges in the graph */
  edges: ServiceEdge[];

  /** Overall health of the graph */
  overallHealth: 'healthy' | 'degraded' | 'critical';

  /** Services currently experiencing incidents */
  incidentServices: string[];
}

/**
 * Represents how well a service meets its SLO targets
 */
export interface DependencyHealth {
  serviceName: string;

  /** SLO target error rate (percentage) */
  errorRateSLO: number | null;

  /** Actual error rate (percentage) */
  actualErrorRate: number | null;

  /** SLO target latency P95 (seconds) */
  latencyP95SLO: number | null;

  /** Actual latency P95 (seconds) */
  actualLatencyP95: number | null;

  /** If true, service is violating SLO */
  sloViolated: boolean;

  /** Time remaining until SLO is lost (minutes) */
  timeToSLOLoss: number | null;
}

/**
 * A sequence of services along a dependency path
 */
export interface CriticalPath {
  /** Unique path identifier */
  id: string;

  /** Ordered sequence of services in the path */
  services: string[];

  /** Combined criticality of the path (0-100) */
  criticality: number;

  /** If true, all services in path are healthy */
  allHealthy: boolean;

  /** Number of degraded services in path */
  degradedCount: number;

  /** Estimated MTTR if root service fails (minutes) */
  estimatedMTTR: number | null;
}

/**
 * Describes how an incident propagates through the dependency graph
 */
export interface PropagationPath {
  /** Unique incident identifier */
  incidentId: string;

  /** Service where incident originated */
  originService: string;

  /** Severity of the incident */
  severity: IncidentSeverity;

  /** Ordered sequence of services affected by propagation */
  affectedChain: string[];

  /** Total number of services affected (direct + indirect) */
  blastRadius: number;

  /** Estimated time until propagation reaches end of chain (seconds) */
  propagationTimeSeconds: number | null;

  /** Critical paths that are now compromised */
  compromisedPaths: CriticalPath[];

  /** Services most at risk of cascading failure */
  downstreamRiskServices: string[];

  /** Confidence score for this propagation analysis (0-100) */
  confidence: number;
}

/**
 * Topology analysis combining graph inference and health assessment
 */
export interface TopologyAnalysis {
  /** The inferred dependency graph */
  graph: DependencyGraph;

  /** Critical paths identified in the graph */
  criticalPaths: CriticalPath[];

  /** Active incident propagation analysis */
  propagations: PropagationPath[];

  /** Services sorted by criticality (highest first) */
  criticalServices: ServiceNode[];

  /** Edges most likely to cause cascading failures */
  riskEdges: ServiceEdge[];

  /** Debug metrics for the UI */
  debugMetrics?: {
    tracesDiscovered: number;
    spansParsed: number;
    edgesInferred: number;
    incidentTriggersMatched: number;
  };
}
