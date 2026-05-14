/**
 * Service Topology Engine
 *
 * Dynamically infers service dependencies from traces and logs,
 * analyzes propagation paths, and identifies critical infrastructure.
 *
 * Core responsibilities:
 * - Infer dependency graph from Tempo spans (parent-child relationships)
 * - Calculate service criticality and centrality metrics
 * - Identify critical dependency chains
 * - Analyze incident propagation through the graph
 * - Enhance incidents with blast radius and downstream risk
 *
 * No custom storage is used. All topology is inferred at query time
 * from traces, logs, and health metrics.
 */

export { identifyCriticalPaths, inferDependencyGraph } from './topologyEngine';
export {
  analyzePropagation,
  analyzeTopology,
  enrichIncidentWithPropagation,
} from './propagationAnalysis';
export { buildTopologyAnalysis, enrichSignalsWithTopology } from './topologyService';

export type {
  CriticalPath,
  DependencyGraph,
  DependencyHealth,
  PropagationPath,
  ServiceEdge,
  ServiceNode,
  TopologyAnalysis,
} from '../../types/topology';
