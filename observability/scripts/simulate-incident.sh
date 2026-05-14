#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEMO_DIR="${ROOT_DIR}/observability/opentelemetry-demo"
DEMO_COMPOSE="${DEMO_DIR}/docker-compose.yml"
TELEMETRY_COMPOSE="${ROOT_DIR}/observability/docker-compose.telemetry.yaml"

scenario="${1:-help}"
service="${SERVICE:-recommendationservice}"

require_demo() {
  if [ ! -f "${DEMO_COMPOSE}" ]; then
    echo "OpenTelemetry Demo compose file was not found. Run observability/scripts/lab.sh up first." >&2
    exit 1
  fi
}

resolve_service() {
  case "$1" in
    recommendationservice)
      echo "recommendation"
      ;;
    checkoutservice)
      echo "checkout"
      ;;
    paymentservice)
      echo "payment"
      ;;
    shippingservice)
      echo "shipping"
      ;;
    cartservice)
      echo "cart"
      ;;
    productcatalogservice)
      echo "product-catalog"
      ;;
    *)
      echo "$1"
      ;;
  esac
}

case "${scenario}" in
  dependency-failure)
    require_demo
    resolved_service="$(resolve_service "${service}")"
    docker compose -f "${DEMO_COMPOSE}" stop "${resolved_service}"
    echo "Stopped ${resolved_service}. Run: SERVICE=${service} observability/scripts/simulate-incident.sh recover-service"
    ;;
  service-degradation)
    require_demo
    resolved_service="$(resolve_service "${service}")"
    docker compose -f "${DEMO_COMPOSE}" pause "${resolved_service}"
    echo "Paused ${resolved_service}. Run: SERVICE=${service} observability/scripts/simulate-incident.sh recover-service"
    ;;
  recover-service)
    require_demo
    resolved_service="$(resolve_service "${service}")"
    docker compose -f "${DEMO_COMPOSE}" unpause "${resolved_service}" || true
    docker compose -f "${DEMO_COMPOSE}" up -d "${resolved_service}"
    ;;
  high-load)
    K6_VUS="${K6_VUS:-80}" K6_DURATION="${K6_DURATION:-15m}" docker compose -f "${TELEMETRY_COMPOSE}" --profile load run --rm k6
    ;;
  retry-amplification)
    require_demo
    resolved_service="$(resolve_service "${service}")"
    docker compose -f "${DEMO_COMPOSE}" stop "${resolved_service}"
    K6_VUS="${K6_VUS:-120}" K6_DURATION="${K6_DURATION:-10m}" docker compose -f "${TELEMETRY_COMPOSE}" --profile load run --rm k6
    ;;
  partial-telemetry-loki)
    docker compose -f "${TELEMETRY_COMPOSE}" stop lgtm
    echo "LGTM stopped. This validates datasource outage handling. Restart with observability/scripts/lab.sh start-lgtm."
    ;;
  help|*)
    cat <<'USAGE'
Usage: observability/scripts/simulate-incident.sh <scenario>

Scenarios use real OpenTelemetry Demo services and real k6 traffic.
No static JSON, frontend mocks, or fake telemetry payloads are generated.

Scenarios:
  dependency-failure       Stop a downstream service. Default SERVICE=recommendationservice
  service-degradation      Pause a service to create latency/timeouts. Default SERVICE=recommendationservice
  recover-service          Unpause and restart SERVICE
  high-load                Run high-volume k6 traffic
  retry-amplification      Stop SERVICE, then run high-volume traffic
  partial-telemetry-loki   Stop LGTM to validate datasource outage behavior

Examples:
  SERVICE=paymentservice observability/scripts/simulate-incident.sh dependency-failure
  SERVICE=checkoutservice K6_VUS=150 observability/scripts/simulate-incident.sh retry-amplification
USAGE
    ;;
esac
