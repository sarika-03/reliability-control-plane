import { DataFrame, FieldType } from '@grafana/data';
import { DatasourceInfo, MetricSeriesPoint, ServiceHealth, ServiceHealthStatus } from '../../types';
import { createQueryRequest, executeDatasourceQuery } from '../datasources';
import { discoverMetrics, buildRequestRateQuery, buildErrorRateQuery, buildLatencyP95Query } from '../discovery';

const REQUEST_RATE_REF_ID = 'requestRate';
const ERROR_RATE_REF_ID = 'errorRate';
const LATENCY_P95_REF_ID = 'latencyP95';

/**
 * Query service health metrics using adaptively discovered metric names and labels.
 * This function automatically adapts to different Prometheus setups:
 * - OpenTelemetry Demo (service_name label, traces_spanmetrics_calls_total metric)
 * - Traditional Prometheus (service label, http_requests_total metric)
 * - Kubernetes exporters (job/app labels)
 */
export async function queryServiceHealth(prometheus: DatasourceInfo): Promise<ServiceHealth[]> {
  const capturedAt = new Date().toISOString();

  // Step 1: Discover available metrics and service labels
  const discovered = await discoverMetrics(prometheus);

  // Step 2: Build dynamic queries based on discovered metrics
  const response = await executeDatasourceQuery(
    prometheus,
    createQueryRequest(prometheus, [
      buildRequestRateQuery(discovered),
      buildErrorRateQuery(discovered),
      buildLatencyP95Query(discovered),
    ])
  );

  // Step 3: Extract metric points using the discovered service label
  const requestRates = extractMetricPoints(response.data, REQUEST_RATE_REF_ID, discovered.serviceLabel);
  const errorRates = extractMetricPoints(response.data, ERROR_RATE_REF_ID, discovered.serviceLabel);
  const latencies = extractMetricPoints(response.data, LATENCY_P95_REF_ID, discovered.serviceLabel);
  const serviceNames = new Set([
    ...requestRates.map((point) => point.serviceName),
    ...errorRates.map((point) => point.serviceName),
    ...latencies.map((point) => point.serviceName),
  ]);

  return Array.from(serviceNames)
    .sort()
    .map((serviceName) => {
      const requestRatePerSecond = findMetricValue(requestRates, serviceName);
      const errorRatePercent = findMetricValue(errorRates, serviceName);
      const latencyP95Seconds = findMetricValue(latencies, serviceName);

      return {
        serviceName,
        datasourceUid: prometheus.uid,
        status: calculateServiceStatus(errorRatePercent, latencyP95Seconds),
        metrics: {
          serviceName,
          requestRatePerSecond,
          errorRatePercent,
          latencyP95Seconds,
          capturedAt,
        },
      };
    });
}

/**
 * Extract metric data points from response frames.
 * Uses the discovered service label to extract service names from metric labels.
 * Falls back to frame name and field name if primary label is not found.
 */
function extractMetricPoints(frames: DataFrame[], refId: string, serviceLabel: string): MetricSeriesPoint[] {
  return frames
    .filter((frame) => frame.refId === refId)
    .flatMap((frame) => {
      const valueFields = frame.fields.filter((field) => field.type === FieldType.number);

      return valueFields.flatMap((field) => {
        // Try discovered label first, then common alternatives, then frame/field name
        const serviceName =
          field.labels?.[serviceLabel] ??
          field.labels?.service_name ??
          field.labels?.service ??
          field.labels?.app ??
          frame.name ??
          field.name;

        const value = getLastNumber(field.values);

        return value === null ? [] : [{ serviceName, value }];
      });
    });
}

function getLastNumber(values: unknown[]): number | null {
  for (let index = values.length - 1; index >= 0; index--) {
    const numericValue = Number(values[index]);

    if (Number.isFinite(numericValue)) {
      return numericValue;
    }
  }

  return null;
}

function findMetricValue(points: MetricSeriesPoint[], serviceName: string): number | null {
  return points.find((point) => point.serviceName === serviceName)?.value ?? null;
}

function calculateServiceStatus(
  errorRatePercent: number | null,
  latencyP95Seconds: number | null
): ServiceHealthStatus {
  if (errorRatePercent === null && latencyP95Seconds === null) {
    return 'unknown';
  }

  if ((errorRatePercent ?? 0) >= 3 || (latencyP95Seconds ?? 0) >= 0.8) {
    return 'critical';
  }

  if ((errorRatePercent ?? 0) >= 0.5 || (latencyP95Seconds ?? 0) >= 0.3) {
    return 'warning';
  }

  return 'healthy';
}
