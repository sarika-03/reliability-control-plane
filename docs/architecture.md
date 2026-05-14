# Architecture Overview

Reliability Control Plane follows the official Grafana app plugin model: `src/module.tsx` exports an `AppPlugin`, `src/plugin.json` declares app metadata and navigation pages, and React pages render inside Grafana using `PluginPage`.

## Telemetry Flow

```text
OpenTelemetry Demo services
  -> OpenTelemetry Collector / OTLP
  -> Grafana LGTM
  -> Prometheus, Loki, Tempo datasources
  -> Grafana runtime datasource APIs
  -> Reliability Control Plane pages
```

The plugin queries Grafana datasources directly and does not duplicate metrics, logs, or traces.

## Frontend Layers

- `src/hooks`: page-level orchestration, partial query handling, loading/error state.
- `src/services/datasources`: Grafana datasource discovery and query execution.
- `src/services/prometheus`: request, error, and latency metric queries.
- `src/services/loki`: log query, DataFrame parsing, error-pattern grouping.
- `src/services/tempo`: trace lookup, span parsing, trace-reference extraction.
- `src/services/correlation`: incident signal assembly and confidence scoring.
- `src/services/rootCause`: slow/failing span reasoning and blast radius.
- `src/services/slo`: reliability score, error budget, and burn-rate calculations.
- `src/services/topology`: dynamic dependency inference from traces.
- `src/services/intelligence`: deterministic summaries and recommendations.
- `src/services/resilience`: datasource health, stale telemetry, partial-mode state.

## Resilience Model

Each datasource is queried independently. Page hooks use partial-result handling so Prometheus, Loki, and Tempo can fail separately. The UI continues rendering available evidence and reduces confidence when telemetry is incomplete.

Datasource states:

- `healthy`: query succeeded with useful signal.
- `degraded`: query succeeded but returned no useful operational signal.
- `unavailable`: query failed or timed out.
- `not-configured`: datasource is missing.
- `unknown`: datasource is present but has not been queried.

## Performance Model

`src/constants.performance.ts` defines operational budgets for:

- log lines parsed
- error patterns grouped
- trace references
- spans per trace
- topology nodes and edges
- critical paths
- incident pagination
- datasource query timeout and retry delay

These budgets keep the UI responsive under noisy logs, large traces, and dense graphs.

## Explore Integration

Explore URLs are generated in `src/services/explore`. Links include datasource UID, query model, and incident time range so responders land in the relevant investigation window.

## Real Telemetry Validation

The local lab uses Grafana LGTM and the official OpenTelemetry Demo. k6 drives real HTTP traffic. Incident scripts control real containers to create dependency failures, service degradation, retry amplification, and telemetry outage scenarios.
