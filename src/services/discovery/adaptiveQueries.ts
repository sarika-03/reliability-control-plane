import { DiscoveredMetrics, buildSelector } from './metricDiscovery';

export interface DynamicPrometheusQuery {
  refId: string;
  expr: string;
  instant: boolean;
  range: boolean;
  legendFormat?: string;
}

export function buildRequestRateQuery(discovered: DiscoveredMetrics, duration = '5m'): DynamicPrometheusQuery {
  const totalByService = buildTotalRateByService(discovered, duration);

  return {
    refId: 'requestRate',
    expr: totalByService,
    instant: true,
    range: false,
    legendFormat: `{{${discovered.serviceLabel}}}`,
  };
}

export function buildErrorRateQuery(discovered: DiscoveredMetrics, duration = '5m'): DynamicPrometheusQuery {
  const totalByService = buildTotalRateByService(discovered, duration);

  if (!discovered.statusLabel || !discovered.statusErrorMatcher) {
    return {
      refId: 'errorRate',
      expr: `0 * ${totalByService}`,
      instant: true,
      range: false,
      legendFormat: `{{${discovered.serviceLabel}}}`,
    };
  }

  const errorSelector = buildSelector(discovered.requestMetric, [
    ...discovered.requestMatchers,
    {
      label: discovered.statusLabel,
      operator: '=~',
      value: discovered.statusErrorMatcher,
    },
  ]);
  const errorByService = `sum by (${discovered.serviceLabel}) (rate(${errorSelector}[${duration}]))`;
  const zeroByService = `0 * ${totalByService}`;

  return {
    refId: 'errorRate',
    expr: `100 * (${errorByService} or on (${discovered.serviceLabel}) (${zeroByService})) / clamp_min(${totalByService}, 1)`,
    instant: true,
    range: false,
    legendFormat: `{{${discovered.serviceLabel}}}`,
  };
}

export function buildLatencyP95Query(discovered: DiscoveredMetrics, duration = '5m'): DynamicPrometheusQuery {
  const totalByService = buildTotalRateByService(discovered, duration);

  if (!discovered.durationMetric) {
    return {
      refId: 'latencyP95',
      expr: `0 * ${totalByService}`,
      instant: true,
      range: false,
      legendFormat: `{{${discovered.serviceLabel}}}`,
    };
  }

  const durationSelector = buildSelector(discovered.durationMetric, discovered.durationMatchers);
  const quantile = `histogram_quantile(0.95, sum by (le, ${discovered.serviceLabel}) (rate(${durationSelector}[${duration}])))`;
  const expr = discovered.latencyUnit === 'milliseconds' ? `(${quantile}) / 1000` : quantile;

  return {
    refId: 'latencyP95',
    expr,
    instant: true,
    range: false,
    legendFormat: `{{${discovered.serviceLabel}}}`,
  };
}

export function buildDynamicQuery(refId: string, expr: string, serviceLabel: string): DynamicPrometheusQuery {
  return {
    refId,
    expr,
    instant: true,
    range: false,
    legendFormat: `{{${serviceLabel}}}`,
  };
}

function buildTotalRateByService(discovered: DiscoveredMetrics, duration: string): string {
  const requestSelector = buildSelector(discovered.requestMetric, discovered.requestMatchers);

  return `sum by (${discovered.serviceLabel}) (rate(${requestSelector}[${duration}]))`;
}
