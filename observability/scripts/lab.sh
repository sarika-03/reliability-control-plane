#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TELEMETRY_COMPOSE="${ROOT_DIR}/observability/docker-compose.telemetry.yaml"
DEMO_DIR="${ROOT_DIR}/observability/opentelemetry-demo"
DEMO_REPO="https://github.com/open-telemetry/opentelemetry-demo.git"
DEMO_COMPOSE="${DEMO_DIR}/docker-compose.yml"
OTEL_LGTM_EXTRAS="${ROOT_DIR}/observability/otelcol-lgtm-exporters.yml"

command="${1:-help}"

demo_services() {
  docker compose -f "${DEMO_COMPOSE}" config --services
}

demo_up() {
  local scale_args=()

  if demo_services | grep -qx "prometheus"; then
    scale_args+=(--scale prometheus=0)
  fi

  if demo_services | grep -qx "grafana"; then
    scale_args+=(--scale grafana=0)
  fi

  OTEL_EXPORTER_OTLP_ENDPOINT="${OTEL_EXPORTER_OTLP_ENDPOINT:-http://otel-collector:4317}" \
  OTEL_COLLECTOR_CONFIG_EXTRAS="${OTEL_COLLECTOR_CONFIG_EXTRAS:-${OTEL_LGTM_EXTRAS}}" \
    docker compose -f "${DEMO_COMPOSE}" up -d --remove-orphans "${scale_args[@]}"

  if demo_services | grep -qx "prometheus"; then
    docker compose -f "${DEMO_COMPOSE}" stop prometheus || true
  fi

  if demo_services | grep -qx "grafana"; then
    docker compose -f "${DEMO_COMPOSE}" stop grafana || true
  fi
}

case "${command}" in
  start-lgtm)
    docker compose -f "${TELEMETRY_COMPOSE}" up -d lgtm
    ;;
  clone-demo)
    if [ -d "${DEMO_DIR}/.git" ]; then
      echo "OpenTelemetry Demo already exists at ${DEMO_DIR}"
    else
      git clone "${DEMO_REPO}" "${DEMO_DIR}"
    fi
    ;;
  start-demo)
    if [ ! -d "${DEMO_DIR}" ]; then
      echo "Run: observability/scripts/lab.sh clone-demo" >&2
      exit 1
    fi
    demo_up
    ;;
  stop-demo)
    docker compose -f "${DEMO_COMPOSE}" down
    ;;
  load)
    docker compose -f "${TELEMETRY_COMPOSE}" --profile load run --rm k6
    ;;
  validate)
    "${ROOT_DIR}/observability/scripts/validate-ingestion.sh"
    ;;
  up)
    "${BASH_SOURCE[0]}" start-lgtm
    "${BASH_SOURCE[0]}" clone-demo
    "${BASH_SOURCE[0]}" start-demo
    ;;
  down)
    if [ -f "${DEMO_COMPOSE}" ]; then
      docker compose -f "${DEMO_COMPOSE}" down || true
    fi
    docker compose -f "${TELEMETRY_COMPOSE}" down || true
    echo "Stopped observability lab (OpenTelemetry Demo if present + LGTM stack)."
    ;;
  help|*)
    cat <<'USAGE'
Usage: observability/scripts/lab.sh <command>

Commands:
  up           Start LGTM and OpenTelemetry Demo
  start-lgtm   Start Grafana LGTM telemetry backend
  clone-demo   Clone the official OpenTelemetry Demo repository
  start-demo   Start OpenTelemetry Demo services
  stop-demo    Stop OpenTelemetry Demo services
  down         Stop demo + LGTM telemetry compose (full lab teardown)
  load         Run k6 load against the demo frontend
  validate     Check Prometheus, Loki, and Tempo ingestion endpoints

Environment:
  OTEL_EXPORTER_OTLP_ENDPOINT  Default: http://otel-collector:4317
  OTEL_COLLECTOR_CONFIG_EXTRAS Default: observability/otelcol-lgtm-exporters.yml
  TARGET_BASE_URL              Default for k6: http://host.docker.internal:8080
  K6_VUS                       Default: 20
  K6_DURATION                  Default: 10m
  K6_HTTP_FAIL_MAX_RATE        Optional: k6 http_req_failed threshold (default 0.42 for OTel demo)
USAGE
    ;;
esac
