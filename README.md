# Reliability Control Plane

Reliability Control Plane is a Grafana app plugin for SRE incident investigation. It correlates Prometheus metrics, Loki logs, and Tempo traces into an operational workflow for service health, SLO pressure, incident drilldowns, topology, root-cause evidence, and recommendations.

The plugin is intentionally Grafana-native:

- App pages are React + TypeScript pages registered through the Grafana app plugin entrypoint.
- Telemetry is queried from configured Grafana datasources at runtime.
- No telemetry is duplicated into plugin storage.
- Incident reasoning is deterministic and rules-based.
- Degraded telemetry is rendered as partial operational context instead of failing the whole workflow.

## Capabilities

- Service health from Prometheus request rate, error rate, and p95 latency.
- SLO overview with reliability scores, burn-rate context, and degraded services.
- Loki error grouping into dominant failure signatures.
- Tempo trace correlation for slow and failing spans.
- Root-cause confidence, blast-radius summaries, and operational recommendations.
- Lightweight service topology and dependency risk summaries.
- Grafana Explore deep links for metrics, logs, and traces with incident time context.
- Incident JSON snapshot export for operational reporting.
- Datasource readiness checks in the app configuration page.
- Real telemetry lab using Grafana LGTM, OpenTelemetry Demo, and k6.

## Development

```bash
npm install
npm run dev
docker compose up -d
```

Open Grafana at `http://localhost:3000`, then open:

```text
http://localhost:3000/a/sarika1731-reliabilitycontrolplane-app/overview
```

## Configuration

Open the plugin configuration page in Grafana and select:

- Prometheus datasource for metrics and SLOs.
- Loki datasource for logs and error signatures.
- Tempo datasource for traces and topology.

Use **Test readiness** to verify datasource connectivity before incident use. Readiness checks use Grafana datasource runtime APIs and report missing or degraded telemetry without storing data.

## Real Telemetry Lab

Start the local observability lab:

```bash
observability/scripts/lab.sh up
observability/scripts/lab.sh load
observability/scripts/lab.sh validate
```

Run a controlled incident:

```bash
SERVICE=recommendationservice observability/scripts/simulate-incident.sh dependency-failure
SERVICE=recommendationservice observability/scripts/simulate-incident.sh recover-service
```

More workflows are documented in:

- [Local observability testing](docs/local-observability-testing.md)
- [Incident simulation runbook](docs/incident-simulation-runbook.md)
- [Architecture overview](docs/architecture.md)

## Validation

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

## Production Principles

- No fake telemetry payloads.
- No hardcoded incident datasets.
- No custom telemetry database.
- No fake AI or LLM wrappers.
- No heavyweight global state manager.
- Keep rendering bounded under noisy logs, large traces, and dense dependency graphs.
