export interface TraceReference {
  traceId: string;
  spanId?: string;
}

export interface SpanSummary {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operationName: string;
  durationMs: number | null;
  startTime?: string;
  status?: string;
  isError: boolean;
  attributes: Record<string, string>;
}

export interface TraceSummary {
  traceId: string;
  rootServiceName?: string;
  rootOperationName?: string;
  durationMs: number | null;
  spanCount: number;
  errorSpanCount: number;
  slowSpans: SpanSummary[];
  failingSpans: SpanSummary[];
  spans: SpanSummary[];
}
