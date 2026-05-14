import { DataQueryResponse, LoadingState } from '@grafana/data';

export function getQueryResponseError(response: DataQueryResponse): string | undefined {
  if (response.errors?.length) {
    return response.errors.map((entry) => entry.message ?? String(entry)).join('; ');
  }

  // Legacy single-field error (older Grafana / some datasources); prefer `errors` above.
  const legacyError = (response as unknown as Record<string, { message?: string } | undefined>)['error'];
  if (legacyError?.message) {
    return legacyError.message;
  }

  return undefined;
}

export function getResponseStateDescription(response: DataQueryResponse): string {
  return String(response.state ?? 'unknown');
}

/**
 * True when Grafana accepted the query and returned without top-level error state.
 * Empty frames are OK (e.g. no matching streams, unknown trace id).
 */
export function isSuccessfulDatasourceResponse(response: DataQueryResponse): { ok: true } | { ok: false; reason: string } {
  if (response.state === LoadingState.Error) {
    return { ok: false, reason: getQueryResponseError(response) ?? 'LoadingState.Error' };
  }

  const message = getQueryResponseError(response);
  if (message) {
    return { ok: false, reason: message };
  }

  return { ok: true };
}
