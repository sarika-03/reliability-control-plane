export const PERFORMANCE_BUDGETS = {
  maxIncidentRows: 10,
  /** Cap related traces rendered per incident card (full list still in exported JSON). */
  maxRelatedTracesInIncidentUi: 18,
  /** Topology dependency rows shown before paging the UI list. */
  topologyEdgeDisplayPage: 36,
  /** Propagation rows before paging. */
  maxPropagationRowsUi: 20,
  maxLogLinesToParse: 1000,
  maxErrorPatterns: 100,
  maxTraceReferencesPerPattern: 25,
  maxTraceSummaries: 25,
  maxSpansPerTrace: 500,
  maxSlowSpansPerTrace: 50,
  maxFailingSpansPerTrace: 50,
  maxTopologyTraces: 50,
  maxTopologyNodes: 150,
  maxTopologyEdges: 300,
  maxCriticalPaths: 50,
  maxOperationsPerEdge: 20,
  datasourceQueryTimeoutMs: 12000,
  datasourceRetryDelayMs: 600,
  staleTelemetryMs: 5 * 60 * 1000,
} as const;
