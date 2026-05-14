import { normalizeHexTraceId } from './traceIds';

describe('normalizeHexTraceId', () => {
  it('normalizes 32-char hex', () => {
    expect(normalizeHexTraceId('AbCdEf0123456789AbCdEf0123456789')).toBe('abcdef0123456789abcdef0123456789');
  });

  it('strips UUID dashes to 32 hex', () => {
    expect(normalizeHexTraceId('abcdef01-2345-6789-abcd-ef0123456789')).toBe('abcdef0123456789abcdef0123456789');
  });

  it('pads 16-char hex', () => {
    expect(normalizeHexTraceId('1234567890abcdef')).toBe('00000000000000001234567890abcdef');
  });
});
