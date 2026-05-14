import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Alert, Badge, useStyles2 } from '@grafana/ui';
import { TelemetryCorrelationDebug, TelemetryHealth } from '../types';

export function TelemetryDebugPanel({
  debug,
  health,
}: {
  debug: TelemetryCorrelationDebug;
  health?: TelemetryHealth;
}) {
  const styles = useStyles2(getStyles);

  return (
    <Alert severity="info" title="Telemetry correlation debug">
      <div className={styles.grid}>
        <div>
          <strong>Patterns / references</strong>
          <p className={styles.mono}>
            errorPatterns={debug.errorPatternCount} · traceRefs={debug.traceReferenceCount}
          </p>
        </div>
        <div>
          <strong>Tempo fetch</strong>
          <p className={styles.mono}>
            traces={debug.tracesFetched} · spans={debug.spanTotal} · parent-links≈{debug.edgeCountApprox}
          </p>
          {debug.tempoReadinessPath && <Badge color="blue" text={`path:${debug.tempoReadinessPath}`} />}
        </div>
        <div>
          <strong>Datasource strip</strong>
          <div className={styles.badges}>
            {health?.datasources.map((d) => (
              <Badge key={`${d.type}:${d.uid ?? d.name}`} color="darkgrey" text={`${d.type}:${d.status}`} />
            ))}
          </div>
        </div>
      </div>

      {(debug.lokiReadinessQuery ||
        debug.tempoEndpointTested ||
        debug.lokiResponseState ||
        debug.tempoResponseState) && (
        <div className={styles.probeSection}>
          <strong>Readiness probes</strong>
          {debug.lokiReadinessQuery && (
            <p className={styles.mono}>
              Loki query: {debug.lokiReadinessQuery}
              {debug.lokiResponseState ? ` · state=${debug.lokiResponseState}` : ''}
              {debug.lokiCompatibilityMode ? ` · mode=${debug.lokiCompatibilityMode}` : ''}
            </p>
          )}
          {debug.tempoEndpointTested && (
            <p className={styles.mono}>
              Tempo step: {debug.tempoEndpointTested}
              {debug.tempoResponseState ? ` · state=${debug.tempoResponseState}` : ''}
              {debug.tempoCompatibilityMode ? ` · mode=${debug.tempoCompatibilityMode}` : ''}
            </p>
          )}
        </div>
      )}

      <p className={styles.hint}>Add ?rcpDebug=1 to the URL to toggle this panel. Remove for normal incident reviews.</p>
    </Alert>
  );
}

const getStyles = (theme: GrafanaTheme2) => ({
  grid: css`
    display: grid;
    gap: ${theme.spacing(2)};
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    margin-top: ${theme.spacing(1)};
  `,
  mono: css`
    font-family: ${theme.typography.fontFamilyMonospace};
    font-size: ${theme.typography.bodySmall.fontSize};
    margin: ${theme.spacing(0.5)} 0 0;
    overflow-wrap: anywhere;
  `,
  badges: css`
    display: flex;
    flex-wrap: wrap;
    gap: ${theme.spacing(0.75)};
    margin-top: ${theme.spacing(0.5)};
  `,
  probeSection: css`
    border-top: 1px solid ${theme.colors.border.weak};
    margin-top: ${theme.spacing(2)};
    padding-top: ${theme.spacing(1.5)};
  `,
  hint: css`
    color: ${theme.colors.text.secondary};
    font-size: ${theme.typography.bodySmall.fontSize};
    margin: ${theme.spacing(1.5)} 0 0;
  `,
});
