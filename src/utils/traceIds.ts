/**
 * Normalize trace identifiers for Tempo and log correlation.
 * Supports 32-char hex, UUID-with-dashes, and 16-char hex (zero-padded for Tempo).
 */
export function normalizeHexTraceId(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return undefined;
  }

  const compact = trimmed.replace(/-/g, '').toLowerCase();

  if (/^[0-9a-f]{32}$/.test(compact)) {
    return compact;
  }

  if (/^[0-9a-f]{16}$/.test(compact)) {
    return compact.padStart(32, '0');
  }

  return undefined;
}

export function normalizeTraceIdForCompare(value: string): string {
  return normalizeHexTraceId(value) ?? value.replace(/-/g, '').toLowerCase();
}
