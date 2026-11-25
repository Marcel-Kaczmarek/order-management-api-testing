import { test, expect, Tag, Role } from '@src/fixtures';
import { Boundaries } from '@src/factories';

test.describe(
  'Authentication › registration',
  { tag: [Tag.authentication, Tag.regression, Tag.api] },
  () => {
    test('REG-01 registration creates a CUSTOMER and returns a usable token', async ({
      api,
      data,
    }) => {
      const payload = data.customer();

      const result = await api.auth.register(payload);

      expect(result).toHaveStatus(201);
      expect(result.body).toMatchSchema('authResponse');
      expect(result.body.user).toMatchObject({
        email: payload.email,
        name: payload.name,
        role: Role.CUSTOMER,
      });
      const me = await api.as(result.body.accessToken).users.me();
      expect(me).toHaveStatus(200);
      expect(me.body.id).toBe(result.body.user.id);
    });

    test('REG-02 email is normalised to lower case', async ({ api, data }) => {
      const payload = data.customer();
      const mixedCase = payload.email
        .replace(/^./, (c) => c.toUpperCase())
        .replace('@example', '@EXAMPLE');

      const result = await api.auth.register({ ...payload, email: mixedCase });

      expect(result).toHaveStatus(201);
      expect(result.body.user.email).toBe(mixedCase.toLowerCase());
    });

    test(
      'REG-03 duplicate email (any casing) is rejected with 409',
      { tag: Tag.negative },
      async ({ api, customer, data }) => {
        const result = await api.auth.register(
          data.customer({ email: customer.user.email.toUpperCase() }),
        );

        expect(result).toBeApiError(409, /Email already registered/);
      },
    );

    test(
      'REG-04 self-registration cannot choose the ADMIN role (mass assignment)',
      { tag: [Tag.security, Tag.negative] },
      async ({ api, data }) => {
        const result = await api.auth.register({ ...data.customer(), role: Role.ADMIN });

        expect(result).toBeApiError(400, /property role should not exist/);
      },
    );

    test('REG-05 boundary: password of exactly the minimum length is accepted', async ({
      api,
      data,
    }) => {
      const password = 'P'.repeat(Boundaries.register.passwordMinLength);

      const result = await api.auth.register(data.customer({ password }));

      expect(result).toHaveStatus(201);
    });

    test('REG-06 boundary: name of exactly the minimum length is accepted', async ({
      api,
      data,
    }) => {
      const result = await api.auth.register(data.customer({ name: 'Jo' }));

      expect(result).toHaveStatus(201);
      expect(result.body.user.name).toBe('Jo');
    });

    const invalid: { name: string; mutate: Record<string, unknown>; message: RegExp }[] = [
      {
        name: 'password one below minimum (7)',
        mutate: { password: 'P'.repeat(7) },
        message: /password must be longer than or equal to 8/,
      },
      {
        name: 'name one below minimum (1)',
        mutate: { name: 'J' },
        message: /name must be longer than or equal to 2/,
      },
      { name: 'malformed email', mutate: { email: 'jane@' }, message: /email must be an email/ },
      {
        name: 'empty name',
        mutate: { name: '' },
        message: /name must be longer than or equal to 2/,
      },
    ];
    for (const { name, mutate, message } of invalid) {
      test(`REG-07 validation: ${name} → 400`, { tag: Tag.negative }, async ({ api, data }) => {
        const result = await api.auth.register({ ...data.customer(), ...mutate });

        expect(result).toBeApiError(400, message);
      });
    }
  },
);
