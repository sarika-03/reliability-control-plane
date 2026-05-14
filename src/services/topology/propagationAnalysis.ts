import {
  CriticalPath,
  DependencyGraph,
  PropagationPath,
  ServiceEdge,
  ServiceNode,
  TopologyAnalysis,
} from '../../types/topology';
import { IncidentSignal } from '../../types';

/**
 * Analyzes how an incident propagates through the service dependency graph.
 *
 * Propagation analysis:
 * - Traces the affected service chain from incident origin
 * - Estimates cascade impact (which services will be affected)
 * - Identifies critical paths that are compromised
 * - Ranks services by propagation risk
 */
export function analyzePropagation(
  graph: DependencyGraph,
  incidentSignal: IncidentSignal,
  criticalPaths: CriticalPath[]
): PropagationPath {
  const incidentId = incidentSignal.id;
  const originService = incidentSignal.affectedServices[0] || 'unknown';
  const severity = incidentSignal.severity;

  // Find all services that depend on the incident origin
  const affectedChain = traceAffectedServices(originService, graph.edges, graph.nodes);
  const blastRadius = affectedChain.length;

  // Find critical paths that contain the incident service
  const compromisedPaths = criticalPaths.filter((path) =>
    path.services.includes(originService)
  );

  // Identify downstream services at highest risk
  const downstreamRiskServices = rankDownstreamRisk(originService, affectedChain, graph);

  // Estimate propagation time based on latency of edges
  const propagationTime = estimatePropagationTime(originService, graph.edges);

  // Calculate confidence based on trace observations and metrics
  const confidence = calculatePropagationConfidence(
    incidentSignal,
    affectedChain,
    graph
  );

  return {
    incidentId,
    originService,
    severity,
    affectedChain,
    blastRadius,
    propagationTimeSeconds: propagationTime,
    compromisedPaths,
    downstreamRiskServices,
    confidence,
  };
}

function toIncidentPropagation(propagation: PropagationPath) {
  return {
    originService: propagation.originService,
    affectedDependencyChain: propagation.affectedChain,
    blastRadius: propagation.blastRadius,
    downstreamRiskServices: propagation.downstreamRiskServices,
    confidence: propagation.confidence,
  };
}

/**
 * Performs comprehensive topology analysis combining graph inference and propagation.
 */
export function analyzeTopology(
  graph: DependencyGraph,
  signals: IncidentSignal[],
  criticalPaths: CriticalPath[]
): TopologyAnalysis {
  // Analyze propagation for each incident signal
  const propagations = signals.map((signal) =>
    analyzePropagation(graph, signal, criticalPaths)
  );

  // Update graph nodes with incident information
  const updatedNodes = graph.nodes.map((node) => {
    const rootIncidents = signals.filter(
      (s) => s.affectedServices[0] === node.serviceName
    );
    const propagationAffected = propagations.some((p) =>
      p.affectedChain.includes(node.serviceName)
    );

    return {
      ...node,
      isIncidentRoot: rootIncidents.length > 0,
      isAffectedByPropagation: propagationAffected,
    };
  });

  // Identify risk edges (high error rate or high latency)
  const riskEdges = graph.edges
    .filter(
      (edge) =>
        (edge.errorRatePercent ?? 0) > 5 ||
        (edge.latencyMs ?? 0) > 500 ||
        edge.isCritical
    )
    .sort((a, b) => (b.criticality ?? 0) - (a.criticality ?? 0));

  // Sort critical services by criticality
  const criticalServices = updatedNodes
    .filter((n) => n.criticality > 50)
    .sort((a, b) => b.criticality - a.criticality);

  return {
    graph: { ...graph, nodes: updatedNodes },
    criticalPaths,
    propagations,
    criticalServices,
    riskEdges,
  };
}

/**
 * Traces all services that would be affected if the origin service fails.
 * Follows the dependency graph edges to find downstream services.
 */
function traceAffectedServices(
  originService: string,
  edges: ServiceEdge[],
  _nodes: ServiceNode[]
): string[] {
  const affected = new Set<string>([originService]);
  const queue = [originService];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const outgoing = edges.filter((e) => e.source === current);

    outgoing.forEach((edge) => {
      if (!affected.has(edge.target)) {
        affected.add(edge.target);
        queue.push(edge.target);
      }
    });
  }

  return Array.from(affected);
}

/**
 * Ranks downstream services by propagation risk.
 * Risk factors: criticality, in-degree, current health status.
 */
function rankDownstreamRisk(
  originService: string,
  affectedChain: string[],
  graph: DependencyGraph
): string[] {
  const affectedNodes = graph.nodes.filter((n) =>
    affectedChain.includes(n.serviceName) && n.serviceName !== originService
  );

  // Sort by risk: failed services first, then by criticality
  return affectedNodes
    .sort((a, b) => {
      const statusRank = {
        failed: 3,
        degraded: 2,
        healthy: 1,
        unknown: 0,
      };
      const statusDiff = (statusRank[b.status] ?? 0) - (statusRank[a.status] ?? 0);
      return statusDiff !== 0 ? statusDiff : b.criticality - a.criticality;
    })
    .slice(0, 5) // Top 5 at-risk services
    .map((n) => n.serviceName);
}

/**
 * Estimates time for incident to propagate through the dependency chain.
 * Based on average span latency along the edges.
 */
function estimatePropagationTime(originService: string, edges: ServiceEdge[]): number | null {
  const outgoing = edges.filter((e) => e.source === originService);
  if (outgoing.length === 0) {
    return null;
  }

  // Average latency of outgoing calls
  const avgLatency =
    outgoing.reduce((sum, e) => sum + (e.latencyMs ?? 100), 0) / outgoing.length;

  // Convert milliseconds to seconds, with minimum of 0.5 seconds
  return Math.max(0.5, avgLatency / 1000);
}

/**
 * Calculates confidence in the propagation analysis.
 * Higher confidence when:
 * - More traces support the dependency relationships
 * - Services are in unhealthy state
 * - Paths have been previously observed
 */
function calculatePropagationConfidence(
  signal: IncidentSignal,
  affectedChain: string[],
  graph: DependencyGraph
): number {
  let confidence = signal.confidence; // Start with incident confidence

  // Boost confidence based on blast radius observation
  const nodes = graph.nodes;
  const affectedNodes = nodes.filter((n) => affectedChain.includes(n.serviceName));
  const degradedCount = affectedNodes.filter(
    (n) => n.status === 'degraded' || n.status === 'failed'
  ).length;

  if (degradedCount > 0) {
    confidence = Math.min(100, confidence + 20);
  }

  // Boost if origin service has high criticality
  const originNode = nodes.find((n) => n.serviceName === affectedChain[0]);
  if (originNode && originNode.criticality > 70) {
    confidence = Math.min(100, confidence + 15);
  }

  // Reduce confidence if chain is long (harder to predict propagation)
  confidence = Math.max(0, confidence - (affectedChain.length - 1) * 5);

  return Math.min(100, Math.max(0, confidence));
}

/**
 * Enhances an incident signal with propagation metadata.
 */
export function enrichIncidentWithPropagation(
  signal: IncidentSignal,
  propagation: PropagationPath
): IncidentSignal {
  return {
    ...signal,
    propagation: toIncidentPropagation(propagation),
    affectedServices: propagation.affectedChain,
    summary: `${signal.summary} Estimated blast radius: ${propagation.blastRadius} services. ` +
             `Propagation confidence: ${propagation.confidence}%. ` +
             `At-risk services: ${propagation.downstreamRiskServices.join(', ') || 'none'}.`,
  };
}
