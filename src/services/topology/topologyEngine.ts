import { PERFORMANCE_BUDGETS } from '../../constants.performance';
import {
  CriticalPath,
  DependencyGraph,
  ServiceEdge,
  ServiceNode,
} from '../../types/topology';
import { ServiceHealth, TraceSummary } from '../../types';

/**
 * Infers service dependency graph from trace data and service health metrics.
 *
 * The graph is built dynamically from:
 * - Tempo spans (parent-child relationships = caller → callee)
 * - Service health metrics (error rates, latencies)
 * - Trace observations (frequency, latency, errors)
 *
 * No custom storage is used; dependencies are inferred at query time.
 */
export function inferDependencyGraph(
  traces: TraceSummary[],
  serviceHealth: ServiceHealth[]
): DependencyGraph {
  const generatedAt = new Date().toISOString();
  const healthByService = new Map(serviceHealth.map((h) => [h.serviceName, h]));
  const boundedTraces = traces.slice(0, PERFORMANCE_BUDGETS.maxTopologyTraces);

  // Extract edges from traces (span parent-child relationships)
  const edgeMap = buildEdgeMap(boundedTraces);

  // Extract all service names
  const serviceNames = new Set<string>();
  boundedTraces.forEach((trace) => {
    trace.spans.forEach((span) => serviceNames.add(span.serviceName));
  });
  serviceHealth.forEach((h) => serviceNames.add(h.serviceName));

  // Build service nodes with metrics and centrality
  const nodes: ServiceNode[] = Array.from(serviceNames).slice(0, PERFORMANCE_BUDGETS.maxTopologyNodes).map((serviceName) => {
    const health = healthByService.get(serviceName);
    const edges = Array.from(edgeMap.values()).filter(
      (edge) => edge.source === serviceName || edge.target === serviceName
    );

    const inDegree = edges.filter((e) => e.target === serviceName).length;
    const outDegree = edges.filter((e) => e.source === serviceName).length;

    // Calculate criticality: services depended on by many others are more critical
    const criticality = calculateServiceCriticality(
      inDegree,
      health?.metrics.errorRatePercent ?? 0,
      health?.metrics.latencyP95Seconds ?? 0
    );

    const statusMap: Record<string, 'healthy' | 'degraded' | 'failed' | 'unknown'> = {
      healthy: 'healthy',
      warning: 'degraded',
      critical: 'failed',
      unknown: 'unknown',
    };

    return {
      serviceName,
      status: statusMap[health?.status ?? 'unknown'] ?? 'unknown',
      criticality,
      inDegree,
      outDegree,
      betweenness: 0, // Calculated later
      errorRatePercent: health?.metrics.errorRatePercent ?? null,
      latencyP95Seconds: health?.metrics.latencyP95Seconds ?? null,
      isIncidentRoot: false,
      isAffectedByPropagation: false,
    };
  });

  // Calculate betweenness centrality (approximation: frequency in critical paths)
  const boundedEdges = Array.from(edgeMap.values()).slice(0, PERFORMANCE_BUDGETS.maxTopologyEdges);
  const criticalPaths = identifyCriticalPaths(nodes, boundedEdges);
  const betweennessMap = new Map<string, number>();
  criticalPaths.forEach((path) => {
    path.services.forEach((service) => {
      betweennessMap.set(service, (betweennessMap.get(service) ?? 0) + 1);
    });
  });

  // Update nodes with betweenness
  const nodesWithBetweenness = nodes.map((node) => ({
    ...node,
    betweenness: betweennessMap.get(node.serviceName) ?? 0,
  }));

  // Determine overall graph health
  const incidentServices = nodesWithBetweenness
    .filter((n) => n.status === 'failed' || n.status === 'degraded')
    .map((n) => n.serviceName);

  const overallHealth =
    incidentServices.length === 0
      ? 'healthy'
      : incidentServices.some((s) => {
          const node = nodesWithBetweenness.find((n) => n.serviceName === s);
          return node?.status === 'failed' || (node && node.criticality > 70);
        })
        ? 'critical'
        : 'degraded';

  return {
    generatedAt,
    nodes: nodesWithBetweenness,
    edges: boundedEdges,
    overallHealth,
    incidentServices,
  };
}

/**
 * Builds edge map from trace spans.
 * Each unique (caller, callee) pair becomes an edge.
 */
function buildEdgeMap(traces: TraceSummary[]): Map<string, ServiceEdge> {
  const edgeMap = new Map<string, ServiceEdge>();

  traces.forEach((trace) => {
    const spansById = new Map(
      trace.spans
        .map((span) => {
          const key = normalizeSpanIdKey(span.spanId);
          return key ? ([key, span] as const) : undefined;
        })
        .filter((entry): entry is readonly [string, (typeof trace.spans)[number]] => Boolean(entry))
    );

    trace.spans.forEach((span) => {
      const parentKey = normalizeSpanIdKey(span.parentSpanId);
      if (!parentKey) {
        return;
      }

      const parent = spansById.get(parentKey);
      if (parent && parent.serviceName !== span.serviceName) {
        // Found a cross-service call
        const edgeKey = `${parent.serviceName}→${span.serviceName}`;
        const existing = edgeMap.get(edgeKey);

        if (existing) {
          // Update existing edge with new observation
          existing.observationCount += 1;
          existing.latencyMs = span.durationMs
            ? (existing.latencyMs ?? 0) * 0.7 + span.durationMs * 0.3
            : existing.latencyMs;
          existing.errorRatePercent = span.isError
            ? (existing.errorRatePercent ?? 0) * 0.8 + 20
            : (existing.errorRatePercent ?? 0) * 0.9;
          existing.isCritical = existing.isCritical || span.isError || (span.durationMs ?? 0) > 500;
          if (!existing.operations.includes(span.operationName) && existing.operations.length < PERFORMANCE_BUDGETS.maxOperationsPerEdge) {
            existing.operations.push(span.operationName);
          }
        } else {
          // Create new edge
          edgeMap.set(edgeKey, {
            source: parent.serviceName,
            target: span.serviceName,
            type: 'direct',
            latencyMs: span.durationMs,
            errorRatePercent: span.isError ? 100 : 0,
            observationCount: 1,
            criticality: span.isError ? 50 : 30,
            isCritical: span.isError || (span.durationMs ?? 0) > 500,
            operations: [span.operationName],
          });
        }
      }
    });
  });

  return edgeMap;
}

function normalizeSpanIdKey(value: string | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = String(value).trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Calculates service criticality based on:
 * - In-degree (how many services depend on it)
 * - Error rate
 * - Latency
 */
function calculateServiceCriticality(inDegree: number, errorRate: number, latency: number): number {
  const inDegreeFactor = Math.min(40, inDegree * 5); // Max 40 points
  const errorFactor = Math.min(30, errorRate * 3); // Max 30 points (high error = less critical)
  const latencyFactor = Math.min(20, latency * 10); // Max 20 points

  // Services with high in-degree but low errors are most critical
  return Math.min(100, inDegreeFactor + Math.max(0, 30 - errorFactor) + Math.max(0, 10 - latencyFactor));
}

/**
 * Identifies critical paths: chains of dependencies where failure cascades.
 */
export function identifyCriticalPaths(nodes: ServiceNode[], edges: ServiceEdge[]): CriticalPath[] {
  const paths: CriticalPath[] = [];
  const visited = new Set<string>();

  // Start from each leaf node (services with no outgoing dependencies)
  const leafNodes = nodes.filter((n) => n.outDegree === 0);

  leafNodes.forEach((leaf) => {
    const pathsFromLeaf = findPathsUpstream(leaf.serviceName, nodes, edges, visited);
    paths.push(...pathsFromLeaf);
  });

  // Also identify high-criticality linear chains
  nodes.forEach((node) => {
    if (node.criticality > 60 && node.inDegree > 0) {
      const downstreamChain = findDownstreamChain(node.serviceName, nodes, edges);
      if (downstreamChain.length > 1) {
        paths.push({
          id: `path:${node.serviceName}→downstream`,
          services: downstreamChain,
          criticality: downstreamChain.reduce(
            (acc, serviceName) => acc + (nodes.find((n) => n.serviceName === serviceName)?.criticality ?? 0),
            0
          ) / downstreamChain.length,
          allHealthy: downstreamChain.every(
            (s) => nodes.find((n) => n.serviceName === s)?.status === 'healthy'
          ),
          degradedCount: downstreamChain.filter(
            (s) => nodes.find((n) => n.serviceName === s)?.status !== 'healthy'
          ).length,
          estimatedMTTR: downstreamChain.length * 5, // Simple heuristic: 5 min per service
        });
      }
    }
  });

  return paths
    .filter((p, i, arr) => arr.findIndex((a) => a.id === p.id) === i)
    .sort((a, b) => b.criticality - a.criticality)
    .slice(0, PERFORMANCE_BUDGETS.maxCriticalPaths);
}

/**
 * Finds paths from a service upstream to its callers.
 */
function findPathsUpstream(
  serviceName: string,
  nodes: ServiceNode[],
  edges: ServiceEdge[],
  _visited: Set<string>
): CriticalPath[] {
  const incomingEdges = edges.filter((e) => e.target === serviceName);
  if (incomingEdges.length === 0) {
    return [];
  }

  const paths: CriticalPath[] = [];
  incomingEdges.forEach((edge) => {
    const upstream = findDownstreamChain(edge.source, nodes, edges);
    paths.push({
      id: `path:${upstream.join('→')}`,
      services: upstream,
      criticality: upstream.reduce(
        (acc, svc) => acc + (nodes.find((n) => n.serviceName === svc)?.criticality ?? 0),
        0
      ) / upstream.length,
      allHealthy: upstream.every((s) => nodes.find((n) => n.serviceName === s)?.status === 'healthy'),
      degradedCount: upstream.filter((s) => nodes.find((n) => n.serviceName === s)?.status !== 'healthy').length,
      estimatedMTTR: upstream.length * 5,
    });
  });

  return paths;
}

/**
 * Finds the chain of services downstream from a given service.
 */
function findDownstreamChain(serviceName: string, nodes: ServiceNode[], edges: ServiceEdge[]): string[] {
  const chain = [serviceName];
  const visited = new Set<string>([serviceName]);
  let current = serviceName;

  // Follow the most prominent downstream edge
  while (true) {
    const outgoing = edges
      .filter((e) => e.source === current && !visited.has(e.target))
      .sort((a, b) => b.observationCount - a.observationCount);
      
    if (outgoing.length === 0) {
      break;
    }

    const next = outgoing[0]!.target;
    chain.push(next);
    visited.add(next);
    current = next;
  }

  return chain;
}
