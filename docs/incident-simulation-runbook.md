# Incident Simulation Runbook

This runbook validates Reliability Control Plane against real telemetry from the OpenTelemetry Demo and Grafana LGTM. It intentionally avoids fake payloads, static incident JSON, and frontend-only mocks.

## Start the Lab

```bash
observability/scripts/lab.sh up
observability/scripts/lab.sh load
observability/scripts/lab.sh validate
```

Open the plugin in Grafana at `http://localhost:3000/a/sarika1731-reliabilitycontrolplane-app/overview`.

## Scenario Matrix

| Scenario | Command | Expected telemetry | Plugin areas to validate |
| --- | --- | --- | --- |
| Baseline traffic | `observability/scripts/lab.sh load` | HTTP request metrics, normal logs, traces | Services, Overview |
| Downstream failure | `SERVICE=recommendationservice observability/scripts/simulate-incident.sh dependency-failure` | 5xx errors, error logs, failing spans | Incidents, RCA, recommendations |
| Service degradation | `SERVICE=checkoutservice observability/scripts/simulate-incident.sh service-degradation` | latency spike, slow traces, delayed logs | Overview, Incidents, Topology |
| Retry amplification | `SERVICE=paymentservice observability/scripts/simulate-incident.sh retry-amplification` | high request rate, 5xx surge, repeated errors | SLO burn, incident confidence |
| High noisy load | `K6_VUS=200 K6_DURATION=20m observability/scripts/simulate-incident.sh high-load` | large trace/log volume | pagination, performance budgets |
| Telemetry outage | `observability/scripts/simulate-incident.sh partial-telemetry-loki` | datasource outage | degraded banners, partial rendering |

Recover a failed or paused service:

```bash
SERVICE=recommendationservice observability/scripts/simulate-incident.sh recover-service
```

## Operational Validation

- Services page: request rate, error rate, and p95 latency should update from Prometheus.
- Incidents page: Loki error patterns should produce incident signals without hardcoded incidents.
- Trace drilldowns: related trace IDs should open Tempo Explore.
- Root cause: failing or slow spans should influence probable cause and confidence.
- Topology: dependency graph should reflect trace relationships and propagation.
- Overview: SLO burn and reliability score should degrade during failure windows.
- Resilience: when a datasource is stopped, the page should continue rendering partial results with health banners.

## Performance Validation

Run high-volume traffic for at least 20 minutes:

```bash
K6_VUS=200 K6_DURATION=20m observability/scripts/simulate-incident.sh high-load
```

Validate:

- Incident list remains paginated.
- Drilldowns expand on demand.
- Topology remains bounded by performance budgets.
- UI remains readable while logs and traces are noisy.
- Datasource health indicators continue to update.

## Datasource Validation

Use:

```bash
observability/scripts/validate-ingestion.sh
```

The script checks Prometheus, Loki, and Tempo readiness plus basic query endpoints. It does not insert data; it only verifies that real telemetry backends are reachable.
