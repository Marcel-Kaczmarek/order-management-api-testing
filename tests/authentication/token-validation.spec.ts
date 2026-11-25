import { test, expect, Tag, Role } from '@src/fixtures';
import {
  corruptSignature,
  signExpiredToken,
  signWithForeignSecret,
  tamperPayload,
  unsignedToken,
} from '@src/utilities/jwt';

/**
 * Bearer-token handling on a protected endpoint (GET /users/me).
 * Every rejection must be 401 in the standard error envelope and must not
 * leak verification internals (e.g. "invalid signature", stack traces).
 */
test.describe(
  'Authentication › token validation',
  { tag: [Tag.authentication, Tag.security, Tag.regression, Tag.api] },
  () => {
    test('TOK-01 missing Authorization header → 401', async ({ api }) => {
      const result = await api.users.me();

      expect(result).toBeApiError(401, /Unauthorized/);
    });

    test('TOK-02 expired but correctly signed token → 401', async ({ api, customer }) => {
      const expired = signExpiredToken({
        sub: customer.user.id,
        email: customer.user.email,
        role: Role.CUSTOMER,
      });

      const result = await api.as(expired).users.me();

      expect(result).toBeApiError(401);
    });

    test('TOK-03 token signed with a foreign secret → 401', async ({ api, customer }) => {
      const forged = signWithForeignSecret({
        sub: customer.user.id,
        email: customer.user.email,
        role: Role.ADMIN,
      });

      const result = await api.as(forged).users.list();

      expect(result).toBeApiError(401);
    });

    test('TOK-04 modified signature → 401', async ({ api, customer }) => {
      const result = await api.as(corruptSignature(customer.token)).users.me();

      expect(result).toBeApiError(401);
    });

    test('TOK-05 payload tampered to escalate role to ADMIN → 401 (signature check)', async ({
      api,
      customer,
    }) => {
      const escalated = tamperPayload(customer.token, { role: Role.ADMIN });

      const result = await api.as(escalated).users.list();

      expect(result).toBeApiError(401);
    });

    test('TOK-06 unsigned "alg: none" token → 401', async ({ api, customer }) => {
      const none = unsignedToken({
        sub: customer.user.id,
        email: customer.user.email,
        role: Role.ADMIN,
      });

      const result = await api.as(none).users.list();

      expect(result).toBeApiError(401);
    });

    const malformed = ['not-a-jwt', 'a.b', 'a.b.c.d', '', '   ', 'Bearer'];
    for (const value of malformed) {
      test(
        `TOK-07 malformed token ${JSON.stringify(value)} → 401`,
        { tag: Tag.negative },
        async ({ api }) => {
          const result = await api.users.me({ headers: { Authorization: `Bearer ${value}` } });

          expect(result).toBeApiError(401);
        },
      );
    }

    test(
      'TOK-08 wrong authentication scheme (Basic) → 401',
      { tag: Tag.negative },
      async ({ api, customer }) => {
        const result = await api.users.me({
          headers: { Authorization: `Basic ${customer.token}` },
        });

        expect(result).toBeApiError(401);
      },
    );

    test('TOK-09 token rejections do not leak verification details', async ({ api, customer }) => {
      const result = await api.as(corruptSignature(customer.token)).users.me();

      expect(result.rawText).not.toMatch(
        /signature|jwt malformed|JsonWebTokenError|stack|at \w+ \(/i,
      );
    });

    test('TOK-10 a valid token keeps working across requests (stateless session)', async ({
      api,
      customer,
    }) => {
      const first = await api.as(customer).users.me();
      const second = await api.as(customer).orders.list();

      expect(first).toHaveStatus(200);
      expect(second).toHaveStatus(200);
    });
  },
);
