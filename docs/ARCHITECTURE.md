# Reliability Control Plane — architecture

This Grafana **app plugin** follows the official app plugin model: `AppPlugin` in `src/module.tsx`, lazy-loaded routes in `src/components/App/App.tsx`, and datasource-driven pages using `PluginPage` from `@grafana/runtime` and `@grafana/ui` primitives.

References: [Build an app plugin](https://grafana.com/developers/plugin-tools/tutorials/build-an-app-plugin), [App plugin how-to guides](https://grafana.com/developers/plugin-tools/how-to-guides/app-plugins/), [Anatomy of a plugin](https://grafana.com/developers/plugin-tools/key-concepts/anatomy-of-a-plugin).

## Telemetry ingestion and datasource flow

```mermaid
flowchart LR
  subgraph Grafana["Grafana runtime"]
    App["App pages\n(Overview / Services / Incidents / Topology)"]
    DS["Configured datasources\nPrometheus · Loki · Tempo"]
  end
  subgraph Plugin["Plugin frontend"]
    Disc["discoverTelemetryDatasources"]
    PromQ["prometheusService"]
    LokiQ["lokiService"]
    TempoQ["tempoService"]
    Health["telemetryHealth\nbuildTelemetryHealth"]
  end
  App --> Disc
  Disc --> DS
  PromQ --> DS
  LokiQ --> DS
  TempoQ --> DS
  PromQ --> Health
  LokiQ --> Health
  TempoQ --> Health
  Health --> App
```

## Correlation engine

```mermaid
flowchart TD
  M["Service metrics\n(Prometheus)"]
  L["Error patterns\n(Loki)"]
  T["Traces by log references\n(Tempo)"]
  C["correlateIncidentSignals"]
  S["IncidentSignal[]"]
  M --> C
  L --> C
  T --> C
  C --> S
```

## Topology inference and propagation

```mermaid
flowchart TD
  Tr["Trace spans\n(parent/child)"]
  SH["Service health metrics"]
  Sig["Incident signals"]
  B["buildTopologyAnalysis"]
  G["Service graph\nnodes + edges"]
  P["Propagation paths"]
  Tr --> B
  SH --> B
  Sig --> B
  B --> G
  B --> P
```

## SLO engine and operational intelligence

```mermaid
flowchart LR
  Prom["Prometheus SLO queries"]
  SloE["sloEngine"]
  Intel["intelligenceEngine\nsummaries / risk / recommendations"]
  RC["rootCauseEngine"]
  Prom --> SloE
  SloE --> Intel
  Loki2["Loki patterns"] --> RC
  Tempo2["Tempo spans"] --> RC
  RC --> Intel
```

## Operational intelligence pipeline (incident page)

```mermaid
flowchart LR
  Hook["useIncidentCorrelation"]
  Corr["Correlation + RCA"]
  UI["IncidentsPage\nsorted · keyboard drilldowns\nExplore links"]
  Hook --> Corr
  Corr --> UI
```

All analysis stays **in-browser** over Grafana’s datasource APIs; the plugin does not duplicate telemetry storage.
