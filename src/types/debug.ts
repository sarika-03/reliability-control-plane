export interface TelemetryCorrelationDebug {
  errorPatternCount: number;
  traceReferenceCount: number;
  tracesFetched: number;
  spanTotal: number;
  edgeCountApprox: number;
  tempoReadinessPath?: string;
  /** Last successful or attempted Loki readiness stream selector (rcpDebug). */
  lokiReadinessQuery?: string;
  lokiResponseState?: string;
  lokiCompatibilityMode?: string;
  /** Tempo query type last used for readiness (rcpDebug). */
  tempoEndpointTested?: string;
  tempoResponseState?: string;
  tempoCompatibilityMode?: string;
}
