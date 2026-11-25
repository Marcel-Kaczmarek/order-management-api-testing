/**
 * Redacts secrets before anything is logged or attached to a report.
 * Reports are uploaded as CI artifacts, so tokens and passwords must never leak.
 */
const SENSITIVE_KEYS =
  /^(password|passwordhash|accesstoken|token|authorization|secret|jwt|cookie)$/i;
const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
const REDACTED = '[REDACTED]';

export function redactString(value: string): string {
  return value.replace(JWT_PATTERN, `${REDACTED}-JWT`);
}

export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[Truncated]';
  if (typeof value === 'string') return redactString(value);
  // Date has no enumerable own properties; without this it would become {}.
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        SENSITIVE_KEYS.test(key) ? REDACTED : sanitize(nested, depth + 1),
      ]),
    );
  }
  return value;
}

export function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_KEYS.test(key) ? REDACTED : redactString(value),
    ]),
  );
}
