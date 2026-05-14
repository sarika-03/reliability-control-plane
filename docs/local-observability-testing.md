# Local Observability Testing

Reliability Control Plane should be tested against real telemetry. Do not use static JSON incident fixtures or hardcoded demo incidents. The local stack should generate real Prometheus metrics, Loki logs, and Tempo traces through instrumented services.

## Architecture

- Grafana app plugin: this repository, mounted into the development Grafana container.
- LGTM stack: Grafana, Prometheus, Loki, Tempo, and an OpenTelemetry ingest endpoint.
- OpenTelemetry Collector: receives OTLP from sample services and forwards metrics, logs, and traces.
- Sample microservices: the official OpenTelemetry Demo application.
- Load and failure driver: k6 traffic against the demo frontend and controlled demo failure modes.

## Start the telemetry backend

Use the companion script from this repository:

```bash
observability/scripts/lab.sh start-lgtm
```

The LGTM service exposes:

- Grafana: `http://localhost:3001`
- Prometheus: `http://localhost:9090`
- Loki: `http://localhost:3100`
- Tempo: `http://localhost:3200`
- OTLP gRPC: `localhost:4317`
- OTLP HTTP: `localhost:4318`

## Start real sample services

Run the official OpenTelemetry Demo from its own repository. The lab script keeps LGTM as the only local Prometheus, Loki, and Tempo backend, disables the demo Grafana/Prometheus services when present, and points the demo collector at LGTM over OTLP:

```bash
observability/scripts/lab.sh clone-demo
observability/scripts/lab.sh start-demo
```

The demo creates a realistic service graph with frontend, checkout, cart, product catalog, recommendation, payment, shipping, Kafka, and supporting services. This produces real distributed traces, logs, and service metrics.

Only LGTM should bind the backend ports:

- Prometheus: `9090`
- Loki: `3100`
- Tempo: `3200`

If a cloned demo compose file includes its own Prometheus service, the lab script scales/stops it so it does not conflict with LGTM.

## Generate load

Drive traffic through the demo frontend with k6:

```bash
observability/scripts/lab.sh load
```

Tune intensity without changing code:

```bash
K6_VUS=80 K6_DURATION=20m observability/scripts/lab.sh load
```

## Simulate production incidents

Use controlled changes against the running demo, then verify the plugin sees real datasource output:

- Database latency: add latency or CPU pressure to a backing demo dependency and watch p95 latency plus slow spans.
- Downstream dependency failure: stop `recommendationservice`, `paymentservice`, or another leaf dependency and watch HTTP 500s, logs, and trace errors.
- HTTP 500 storm: enable a demo feature flag or failure mode that returns application errors under load.
- Retry amplification: combine a failing downstream service with high k6 VUs and watch request rate plus error rate rise together.
- Service degradation: constrain a service with Docker CPU or memory limits and watch latency SLO burn.
- Trace fan-out failure: degrade a mid-path dependency such as checkout, payment, or shipping and inspect Tempo fan-out spans.
- Cascading impact: fail a dependency used by multiple upstream services, then confirm topology propagation and incident blast-radius summaries.

Repeatable scenario commands are documented in [incident-simulation-runbook.md](./incident-simulation-runbook.md).

Examples:

```bash
SERVICE=recommendationservice observability/scripts/simulate-incident.sh dependency-failure
SERVICE=recommendationservice observability/scripts/simulate-incident.sh recover-service
K6_VUS=200 K6_DURATION=20m observability/scripts/simulate-incident.sh high-load
```

## Configure the plugin

In Grafana `http://localhost:3000`, open the Reliability Control Plane configuration page and select the real Prometheus, Loki, and Tempo datasources. If your datasource names differ, leave settings on auto-discovery and confirm the Services page shows connected datasource badges.

## Validation checklist

- Services page shows request rate, error rate, and p95 latency from Prometheus.
- Incidents page shows Loki error patterns without static incident fixtures.
- Trace drilldowns open Tempo Explore from real trace IDs.
- Topology page infers dependencies from Tempo spans.
- Overview page shows SLO burn and degraded services during the failure window.

Validate ingestion endpoints at any point:

```bash
observability/scripts/validate-ingestion.sh
```

Some Tempo builds do not expose every service-name search endpoint. In that case validation reports a Tempo compatibility warning while still passing readiness and ingestion checks.
