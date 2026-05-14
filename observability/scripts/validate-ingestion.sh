#!/usr/bin/env bash
set -euo pipefail

PROMETHEUS_URL="${PROMETHEUS_URL:-http://localhost:9090}"
LOKI_URL="${LOKI_URL:-http://localhost:3100}"
TEMPO_URL="${TEMPO_URL:-http://localhost:3200}"

failures=0
warnings=0

check_http() {
  local name="$1"
  local url="$2"

  if curl -fsS --max-time 5 "${url}" >/dev/null; then
    echo "OK ${name}: ${url}"
  else
    echo "FAIL ${name}: ${url}" >&2
    failures=$((failures + 1))
  fi
}

check_tempo_services() {
  local url="$1"
  local status

  status="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 5 "${url}" || true)"

  case "${status}" in
    2??)
      echo "OK Tempo services query: ${url}"
      return 0
      ;;
    404)
      echo "WARN Tempo services query unsupported by this Tempo build: ${url}" >&2
      warnings=$((warnings + 1))
      return 1
      ;;
    *)
      echo "WARN Tempo services query unavailable or empty (${status}): ${url}" >&2
      warnings=$((warnings + 1))
      return 1
      ;;
  esac
}

check_http "Prometheus readiness" "${PROMETHEUS_URL}/-/ready"
check_http "Loki readiness" "${LOKI_URL}/ready"
check_http "Tempo readiness" "${TEMPO_URL}/ready"
check_http "Prometheus service metrics query" "${PROMETHEUS_URL}/api/v1/query?query=up"
check_http "Loki labels query" "${LOKI_URL}/loki/api/v1/labels"
check_tempo_services "${TEMPO_URL}/api/search/tags/service.name/values" || \
  check_tempo_services "${TEMPO_URL}/api/v2/search/tags/service.name/values" || true

if [ "${failures}" -gt 0 ]; then
  echo "${failures} ingestion checks failed." >&2
  exit 1
fi

if [ "${warnings}" -gt 0 ]; then
  echo "${warnings} Tempo compatibility checks produced warnings, but required telemetry backends are reachable."
fi

echo "Telemetry ingestion endpoints are reachable."
