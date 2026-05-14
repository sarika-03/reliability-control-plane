export interface PrometheusQuery {
  refId: string;
  expr: string;
  instant: boolean;
  range: boolean;
  legendFormat?: string;
}

export function createPrometheusQuery(refId: string, expr: string, legendFormat = '{{service}}'): PrometheusQuery {
  return {
    refId,
    expr,
    instant: true,
    range: false,
    legendFormat,
  };
}
