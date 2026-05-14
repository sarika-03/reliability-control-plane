import { IncidentSignal, ServiceHealth, TraceSummary } from '../../types';
import { TopologyAnalysis } from '../../types/topology';
import { analyzeTopology, enrichIncidentWithPropagation } from './propagationAnalysis';
import { identifyCriticalPaths, inferDependencyGraph } from './topologyEngine';

export function buildTopologyAnalysis(
  traces: TraceSummary[],
  serviceHealth: ServiceHealth[],
  signals: IncidentSignal[]
): TopologyAnalysis {
  const graph = inferDependencyGraph(traces, serviceHealth);
  const criticalPaths = identifyCriticalPaths(graph.nodes, graph.edges);

  const baseAnalysis = analyzeTopology(graph, signals, criticalPaths);

  return {
    ...baseAnalysis,
    debugMetrics: {
      tracesDiscovered: traces.length,
      spansParsed: traces.reduce((acc, t) => acc + t.spans.length, 0),
      edgesInferred: graph.edges.length,
      incidentTriggersMatched: signals.length,
    },
  };
}

export function enrichSignalsWithTopology(signals: IncidentSignal[], topology: TopologyAnalysis): IncidentSignal[] {
  return signals.map((signal) => {
    const propagation = topology.propagations.find((candidate) => candidate.incidentId === signal.id);
    return propagation ? enrichIncidentWithPropagation(signal, propagation) : signal;
  });
}
