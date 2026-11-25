import { test, expect, Tag, OrderStatus } from '@src/fixtures';
import { ALLOWED_TRANSITIONS } from '@src/constants';
import type { ApiClients } from '@src/clients';
import type { Order, Session } from '@src/models';

/** Shortest admin path from PENDING to each state. */
const PATH_TO: Record<OrderStatus, OrderStatus[]> = {
  PENDING: [],
  PAID: ['PAID'],
  SHIPPED: ['PAID', 'SHIPPED'],
  DELIVERED: ['PAID', 'SHIPPED', 'DELIVERED'],
  CANCELLED: ['CANCELLED'],
};

async function driveTo(
  api: ApiClients,
  admin: Session,
  order: Order,
  target: OrderStatus,
): Promise<void> {
  for (const status of PATH_TO[target]) {
    const result = await api.as(admin).orders.updateStatus(order.id, status);
    expect(result, `setup transition → ${status}`).toHaveStatus(200);
  }
}

test.describe(
  'Orders › status lifecycle (state machine)',
  { tag: [Tag.api, Tag.regression] },
  () => {
    test('LC-01 happy path: PENDING → PAID → SHIPPED → DELIVERED', async ({
      api,
      admin,
      customer,
      createProduct,
      placeOrder,
    }) => {
      const product = await createProduct();
      const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
      let previousUpdate = Date.parse(order.updatedAt);

      for (const status of ['PAID', 'SHIPPED', 'DELIVERED'] as const) {
        const result = await api.as(admin).orders.updateStatus(order.id, status);
        expect(result).toHaveStatus(200);
        expect(result.body.status).toBe(status);
        expect(Date.parse(result.body.updatedAt)).toBeGreaterThanOrEqual(previousUpdate);
        expect(result.body.totalCents).toBe(order.totalCents);
        previousUpdate = Date.parse(result.body.updatedAt);
      }
      expect((await api.as(customer).orders.get(order.id)).body.status).toBe('DELIVERED');
    });

    for (const from of ['PENDING', 'PAID'] as const) {
      test(`LC-02 cancellation is allowed from ${from}`, async ({
        api,
        admin,
        customer,
        createProduct,
        placeOrder,
      }) => {
        const product = await createProduct();
        const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
        await driveTo(api, admin, order, from);

        const result = await api.as(admin).orders.cancel(order.id);

        expect(result).toHaveStatus(200);
        expect(result.body.status).toBe('CANCELLED');
      });
    }

    // Exhaustive negative coverage of the transition table: for every state, every
    // target that is not explicitly allowed must be rejected and leave the order intact.
    for (const from of Object.values(OrderStatus)) {
      const forbidden = Object.values(OrderStatus)
        .filter((to) => !ALLOWED_TRANSITIONS[from].includes(to))
        .map((to) => ({
          to,
          message:
            to === from ? `Order is already ${from}` : `Invalid status transition: ${from} → ${to}`,
        }));

      test(
        `LC-03 from ${from}: rejects ${forbidden.map((f) => f.to).join(', ')}`,
        { tag: Tag.negative },
        async ({ api, admin, customer, createProduct, placeOrder, repo }) => {
          const product = await createProduct();
          const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
          await driveTo(api, admin, order, from);
          const before = await repo.findOrder(order.id);

          for (const { to, message } of forbidden) {
            const result = await api.as(admin).orders.updateStatus(order.id, to);
            expect(result, `${from} → ${to}`).toBeApiError(400, new RegExp(message));
          }

          const after = await repo.findOrder(order.id);
          expect(after?.status).toBe(from);
          expect(after?.updatedAt.getTime(), 'rejected transitions must not touch the row').toBe(
            before?.updatedAt.getTime(),
          );
          expect(after?.totalCents).toBe(before?.totalCents);
        },
      );
    }

    test(
      'LC-04 repeated payment confirmation is rejected (no double payment)',
      { tag: Tag.negative },
      async ({ api, admin, customer, createProduct, placeOrder }) => {
        const product = await createProduct();
        const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
        await api.as(admin).orders.confirmPayment(order.id);

        const second = await api.as(admin).orders.confirmPayment(order.id);

        expect(second).toBeApiError(400, /Order is already PAID/);
      },
    );

    test(
      'LC-05 duplicate fulfilment (shipping twice) is rejected',
      { tag: Tag.negative },
      async ({ api, admin, customer, createProduct, placeOrder }) => {
        const product = await createProduct();
        const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
        await driveTo(api, admin, order, 'SHIPPED');

        const second = await api.as(admin).orders.ship(order.id);

        expect(second).toBeApiError(400, /Order is already SHIPPED/);
      },
    );

    const invalidBodies: { name: string; body: unknown; message: RegExp }[] = [
      {
        name: 'unknown enum value',
        body: { status: 'REFUNDED' },
        message: /status must be one of the following values/,
      },
      {
        name: 'lower-case enum value',
        body: { status: 'paid' },
        message: /status must be one of the following values/,
      },
      { name: 'missing status', body: {}, message: /status must be one of the following values/ },
      {
        name: 'null status',
        body: { status: null },
        message: /status must be one of the following values/,
      },
      {
        name: 'extra property',
        body: { status: 'PAID', totalCents: 1 },
        message: /property totalCents should not exist/,
      },
    ];
    for (const { name, body, message } of invalidBodies) {
      test(
        `LC-06 status update validation: ${name} → 400`,
        { tag: Tag.negative },
        async ({ api, admin, customer, createProduct, placeOrder }) => {
          const product = await createProduct();
          const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

          const result = await api
            .as(admin)
            .raw.send('PATCH', `orders/${order.id}/status`, { data: body });

          expect(result).toBeApiError(400, message);
        },
      );
    }

    test(
      'LC-07 status update of a non-existent order → 404',
      { tag: Tag.negative },
      async ({ api, admin }) => {
        const result = await api
          .as(admin)
          .orders.updateStatus('cunknownunknownunknown0000', 'PAID');

        expect(result).toBeApiError(404, /Order not found/);
      },
    );
  },
);
