# Operations validation and demo readiness

## Investigation workflow (what to show in a portfolio walkthrough)

1. **Overview** — Confirm reliability scorecards and burn-rate language match Prometheus-backed SLO math; note any high-risk services called out in badges.
2. **Incidents** — Read the telemetry strip first (partial vs healthy datasources). Scan the queue: **critical** incidents surface first (severity rail + sort). Expand analysis for RCA, timeline, and SLO impact; use **L** / **M** / **T** keyboard shortcuts after focusing a card.
3. **Topology** — Validate dependency edges and propagation rows against Tempo-derived structure; page large edge lists instead of rendering everything at once.
4. **Explore** — Open logs, metrics, or a trace from the incident card and confirm the time window and datasource match the signal.

## Telemetry flow (plain language)

Grafana resolves Prometheus, Loki, and Tempo instances from plugin settings and defaults. The plugin issues standard queries, normalizes responses in service modules, then runs deterministic engines (correlation, topology, SLO, root cause). Health metadata is merged so **degraded** telemetry still produces a bounded analysis with explicit warnings.

## Incident lifecycle (as modeled in the UI)

Detection (signals from metrics/logs) → enrichment (traces, SLO context) → timeline and risk scoring → recommended actions. Escalation language comes from timeline stages, not from generative “AI”.

## How to validate against real telemetry

1. From the repo root, start bundled Grafana for plugin development (see project `README.md` / `docker compose` if that is your workflow), or attach the plugin to your own Grafana with working datasources.
2. Optional all-in-one telemetry stack: `docker compose -f observability/docker-compose.telemetry.yaml up` — provides LGTM-style endpoints you can wire as datasources (ports documented in that file).
3. Optional load (k6) is behind a Docker **profile** named `load` in the same compose file; use it only when you intend to generate sustained traffic.

## Scenario checklist (manual)

| Scenario | What to observe |
|----------|-----------------|
| Latency spike | Degraded health metrics, slower spans highlighted in RCA |
| Dependency failure | Topology risky edges / propagation chain |
| Log storm | Dominant error pattern concentration; correlation confidence |
| Retry amplification | Related traces and span lists showing repeated downstream calls |
| Partial telemetry | `OperationalStatusStrip` partial mode + reduced completeness |
| Cascading failure | Propagation paths and blast-radius badges |
| SLO burn | Overview + incident SLO impact blocks |

## Screenshot checklist (demo polish)

Capture: Overview score grid with burn-rate row; Incidents list with severity rails and expanded RCA; Topology graph + propagation section; partial telemetry alert with datasource badges; Explore deep link opened from an incident.

## Performance validation (lightweight)

- Watch Topology **Load more** behavior on large graphs (staged rendering).
- Refresh Incidents under load: list should stay responsive within `PERFORMANCE_BUDGETS` caps (`src/constants.performance.ts`).
- Trace lists in drilldowns cap at `maxRelatedTracesInIncidentUi` with an explicit “showing N of M” note.
