# Reliability Control Plane

Production-grade Grafana App Plugin for operational reliability intelligence using real-time Prometheus, Loki, and Tempo telemetry.

---

## Overview

Reliability Control Plane is a Grafana-native incident investigation and operational intelligence platform built as an official Grafana App Plugin.

The plugin correlates:

* Prometheus metrics
* Loki logs
* Tempo traces
* SLO burn analysis
* Service topology
* Incident timelines

into a unified operational workflow for SRE and observability teams.

The system uses real telemetry only.

No:

* fake AI systems
* mock telemetry
* vector databases
* duplicated storage
* backend-heavy architectures

---

# Features

## Incident Intelligence

* Real-time incident correlation
* Operational risk scoring
* Root-cause estimation
* Blast-radius analysis
* Escalation detection
* Reliability degradation tracking

---

## Telemetry Correlation

* Adaptive Prometheus metric discovery
* Loki error-pattern analysis
* Tempo trace correlation
* Service dependency inference
* Incident timeline generation

---

## Operational UX

* Grafana-native UI
* Explore deep links
* Incident drilldowns
* Service topology analysis
* Reliability trend signals
* Exportable incident snapshots

---

## Production Readiness

* Datasource readiness validation
* Typed frontend services
* Query batching
* Lazy-loaded drilldowns
* Memoized rendering
* Responsive layouts

---

# Architecture

## Stack

* Grafana App Plugin SDK
* React
* TypeScript
* Prometheus
* Loki
* Tempo
* OpenTelemetry
* Grafana LGTM Stack

---

## Design Principles

* Official Grafana plugin architecture only
* Frontend intelligence layer
* Rules-based operational reasoning
* No telemetry duplication
* Runtime datasource querying
* Lightweight rendering
* Typed modular services

---

# Screenshots

## Overview Dashboard

![Overview](https://github.com/sarika-03/reliability-control-plane/raw/main/src/img/overview.png)

## Incidents Page

![Incidents](https://github.com/sarika-03/reliability-control-plane/raw/main/src/img/incidents.png)

## Topology View

![Topology](https://github.com/sarika-03/reliability-control-plane/raw/main/src/img/topology.png)

---

# Local Development

## Install dependencies

```bash
npm install
```

---

## Start Grafana

```bash
docker compose up -d
```

---

## Start plugin development

```bash
npm run dev
```

---

# Observability Lab

The repository includes a real telemetry validation environment using:

* Grafana LGTM
* OpenTelemetry Demo
* k6 load generation

---

## Start observability lab

```bash
bash observability/scripts/lab.sh up
```

---

## Validate telemetry ingestion

```bash
bash observability/scripts/lab.sh validate
```

---

## Generate baseline traffic

```bash
bash observability/scripts/lab.sh load
```

---

# Incident Simulation

## Dependency failure

```bash
bash observability/scripts/simulate-incident.sh dependency-failure
```

---

## High-load incident

```bash
bash observability/scripts/simulate-incident.sh high-load
```

---

## Retry amplification

```bash
SERVICE=checkoutservice K6_VUS=150 bash observability/scripts/simulate-incident.sh retry-amplification
```

---

# Operational Capabilities

## Reliability Intelligence

* Operational summaries
* Risk estimation
* SLO impact analysis
* Incident recommendations
* Reliability trend detection

---

## Topology Intelligence

* Dependency graph generation
* Critical-path analysis
* Propagation-path estimation
* Service criticality scoring

---

## Incident Workflow

* Logs → Metrics → Traces correlation
* Explore integration
* Incident snapshots
* Timeline reconstruction
* RCA assistance

---

# Validation

Validated using:

```bash
npm run typecheck
npm run lint
npm run test:ci
npm run build
```

Telemetry validation:

```bash
bash observability/scripts/lab.sh validate
```

---

# Grafana Compatibility

Tested with:

* Grafana v12+
* Grafana LGTM
* OpenTelemetry Demo

---

# Repository Structure

```text
src/
 ├── components/
 ├── hooks/
 ├── pages/
 ├── services/
 ├── topology/
 ├── intelligence/
 ├── timeline/
 ├── resilience/
 ├── discovery/
 └── types/

observability/
 ├── scripts/
 ├── provisioning/
 └── telemetry/
```

---

# Future Improvements

* Advanced topology visualization
* Historical incident replay
* Cross-cluster reliability analysis
* Enhanced trace propagation inference
* Multi-environment operational views

---

# License

Apache-2.0

---

# References

* Grafana Plugin Tools
* Grafana App Plugin Architecture
* Grafana LGTM
* OpenTelemetry Demo