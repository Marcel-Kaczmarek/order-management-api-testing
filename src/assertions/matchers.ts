import { expect as baseExpect } from '@playwright/test';
import type { ApiResult } from '@src/clients';
import type { SchemaId } from '@src/schemas';
import { validateSchema } from '@src/schemas/validator';
import { sanitize } from '@src/utilities/sanitizer';

const describe = (result: ApiResult<unknown>) =>
  `${result.method} ${result.url} -> ${result.status}\n${JSON.stringify(sanitize(result.body), null, 2)?.slice(0, 2000)}`;

/** Fields that must never appear anywhere in an API response body. */
const FORBIDDEN_FIELDS = ['password', 'passwordHash', 'hash', 'salt', 'secret'];

function findForbiddenPaths(value: unknown, path = '$'): string[] {
  if (Array.isArray(value))
    return value.flatMap((item, i) => findForbiddenPaths(item, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => [
      ...(FORBIDDEN_FIELDS.some((f) => f.toLowerCase() === key.toLowerCase())
        ? [`${path}.${key}`]
        : []),
      ...findForbiddenPaths(nested, `${path}.${key}`),
    ]);
  }
  return [];
}

/**
 * Domain-specific matchers. Every failure message includes the sanitized
 * request/response so a CI failure can be diagnosed from the report alone.
 */
export const expect = baseExpect.extend({
  toHaveStatus(result: ApiResult<unknown>, expected: number | number[]) {
    const allowed = Array.isArray(expected) ? expected : [expected];
    const pass = allowed.includes(result.status);
    return {
      pass,
      name: 'toHaveStatus',
      expected,
      actual: result.status,
      message: () =>
        `${this.isNot ? 'Did not expect' : 'Expected'} HTTP ${allowed.join(' or ')} but received ${result.status}\n${describe(result)}`,
    };
  },

  toMatchSchema(received: unknown, schemaId: SchemaId) {
    const { valid, errors } = validateSchema(schemaId, received);
    return {
      pass: valid,
      name: 'toMatchSchema',
      message: () =>
        this.isNot
          ? `Expected value NOT to match schema "${schemaId}"`
          : `Schema "${schemaId}" violations:\n  - ${errors.join('\n  - ')}\nValue: ${JSON.stringify(sanitize(received), null, 2)?.slice(0, 2000)}`,
    };
  },

  /** Asserts the AUT's uniform error envelope and (optionally) message content. */
  toBeApiError(result: ApiResult<unknown>, status: number, messagePattern?: RegExp) {
    const { valid, errors } = validateSchema('error', result.body);
    const messages = Array.isArray(result.error?.message)
      ? result.error.message
      : [result.error?.message ?? ''];
    const statusOk = result.status === status && result.error?.statusCode === status;
    const messageOk = !messagePattern || messages.some((m) => messagePattern.test(String(m)));
    const pass = valid && statusOk && messageOk;
    return {
      pass,
      name: 'toBeApiError',
      message: () =>
        [
          `Expected API error ${status}${messagePattern ? ` with message ${String(messagePattern)}` : ''}`,
          !statusOk ? `  status mismatch (got ${result.status})` : '',
          !valid ? `  envelope violations: ${errors.join('; ')}` : '',
          !messageOk ? `  messages were: ${JSON.stringify(messages)}` : '',
          describe(result),
        ]
          .filter(Boolean)
          .join('\n'),
    };
  },

  toExposeNoSensitiveFields(received: unknown) {
    const leaks = findForbiddenPaths(received);
    return {
      pass: leaks.length === 0,
      name: 'toExposeNoSensitiveFields',
      message: () => `Sensitive fields exposed at: ${leaks.join(', ')}`,
    };
  },
});
