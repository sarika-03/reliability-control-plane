/**
 * Adaptive telemetry discovery module.
 * Exports functions for discovering metrics and labels from Prometheus dynamically.
 */

export { discoverMetrics, clearDiscoveryCache } from './metricDiscovery';
export type { DiscoveredMetrics } from './metricDiscovery';

export {
  buildRequestRateQuery,
  buildErrorRateQuery,
  buildLatencyP95Query,
  buildDynamicQuery,
} from './adaptiveQueries';
export type { DynamicPrometheusQuery } from './adaptiveQueries';
