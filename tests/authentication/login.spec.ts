import { test, expect, Tag, Role } from '@src/fixtures';
import { env } from '@src/config/env';
import { decodeClaims, decodeHeader } from '@src/utilities/jwt';

test.describe(
  'Authentication › login',
  { tag: [Tag.authentication, Tag.regression, Tag.api] },
  () => {
    test('AUTH-01 valid credentials return a signed JWT and the public user profile', async ({
      api,
      customer,
    }) => {
      const result = await api.auth.login({
        email: customer.user.email,
        password: customer.password,
      });

      expect(result).toHaveStatus(201);
      expect(result.body).toMatchSchema('authResponse');
      expect(result.body.user).toEqual(customer.user);
      expect(result.headers['content-type']).toContain('application/json');
    });

    test('AUTH-02 issued token carries the documented claims and expiry', async ({
      api,
      customer,
    }) => {
      const result = await api.auth.login({
        email: customer.user.email,
        password: customer.password,
      });
      const header = decodeHeader(result.body.accessToken);
      const claims = decodeClaims(result.body.accessToken);

      expect(header).toMatchObject({ alg: 'HS256', typ: 'JWT' });
      expect(claims).toMatchObject({
        sub: customer.user.id,
        email: customer.user.email,
        role: Role.CUSTOMER,
      });
      // JWT_EXPIRES_IN=1d in the local environment.
      expect(claims.exp - claims.iat).toBe(24 * 60 * 60);
      expect(claims.iat).toBeLessThanOrEqual(Math.ceil(Date.now() / 1000) + 5);
    });

    test('AUTH-03 email is matched case-insensitively', async ({ api, customer }) => {
      const result = await api.auth.login({
        email: customer.user.email.toUpperCase(),
        password: customer.password,
      });

      expect(result).toHaveStatus(201);
      expect(result.body.user.id).toBe(customer.user.id);
    });

    test('AUTH-04 wrong password is rejected with a generic 401', async ({ api, customer }) => {
      const result = await api.auth.login({
        email: customer.user.email,
        password: `${customer.password}x`,
      });

      expect(result).toBeApiError(401, /^Invalid credentials$/);
      expect(result.body).not.toHaveProperty('accessToken');
    });

    test('AUTH-05 unknown user gets the same response as a wrong password (no account enumeration)', async ({
      api,
      data,
      customer,
    }) => {
      const unknown = await api.auth.login({
        email: data.uniqueEmail('nobody'),
        password: 'Whatever123!',
      });
      const wrongPassword = await api.auth.login({
        email: customer.user.email,
        password: 'Whatever123!',
      });

      expect(unknown).toBeApiError(401);
      expect(unknown.error.message).toBe(wrongPassword.error.message);
      expect(unknown.error.error).toBe(wrongPassword.error.error);
    });

    const invalidLoginBodies: { name: string; body: Record<string, unknown>; field: RegExp }[] = [
      { name: 'empty body', body: {}, field: /email/ },
      { name: 'missing email', body: { password: 'Customer123!' }, field: /email/ },
      { name: 'missing password', body: { email: 'customer@orderflow.dev' }, field: /password/ },
      {
        name: 'invalid email format',
        body: { email: 'not-an-email', password: 'Customer123!' },
        field: /email must be an email/,
      },
      {
        name: 'password shorter than 8',
        body: { email: 'customer@orderflow.dev', password: 'short' },
        field: /password must be longer than or equal to 8/,
      },
    ];
    for (const { name, body, field } of invalidLoginBodies) {
      test(`AUTH-06 request validation: ${name} → 400`, { tag: Tag.negative }, async ({ api }) => {
        const result = await api.auth.login(body);

        expect(result).toBeApiError(400, field);
      });
    }

    test(
      'AUTH-07 login response never exposes the password hash',
      { tag: Tag.security },
      async ({ api }) => {
        const result = await api.auth.login({
          email: env.ADMIN_EMAIL,
          password: env.ADMIN_PASSWORD,
        });

        expect(result.body).toExposeNoSensitiveFields();
        expect(result.rawText).not.toMatch(/\$2[aby]\$\d{2}\$/); // bcrypt hash signature
      },
    );
  },
);
