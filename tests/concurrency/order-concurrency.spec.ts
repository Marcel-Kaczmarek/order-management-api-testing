import { test, expect, Tag, Defect, expectInventoryConserved } from '@src/fixtures';
import { fireConcurrently, fulfilled } from '@src/utilities/concurrency';

interface BurstOutcome {
  accepted: number;
  serverErrors: number;
  persisted: number;
}

/** Bounded reproduction: runs at most `attempts` bursts, stopping at the first 5xx. */
async function burstUntilServerError(
  attempts: number,
  burst: () => Promise<BurstOutcome>,
): Promise<BurstOutcome[]> {
  const rounds: BurstOutcome[] = [];
  for (let i = 0; i < attempts; i += 1) {
    const outcome = await burst();
    rounds.push(outcome);
    if (outcome.serverErrors > 0) break;
  }
  return rounds;
}

test.describe(
  'Concurrency › orders, payments & idempotency',
  { tag: [Tag.concurrency, Tag.database] },
  () => {
    test(
      'CON-04 many customers race for the last units: no overselling, stock never negative',
      {
        tag: Tag.knownDefect,
        annotation: {
          type: 'defect',
          description: `${Defect.CONCURRENT_OVERSELL} – stock check outside the transaction`,
        },
      },
      async ({ api, registerCustomer, createProduct, repo }) => {
        test.fail(true, `${Defect.CONCURRENT_OVERSELL}: concurrent orders oversell limited stock`);
        const STOCK = 3;
        const product = await createProduct({ stock: STOCK });
        const buyers = await Promise.all(Array.from({ length: 12 }, () => registerCustomer()));

        const results = fulfilled(
          await fireConcurrently(buyers.length, (i) =>
            api.as(buyers[i]!).orders.create({ items: [{ productId: product.id, quantity: 1 }] }),
          ),
        );

        const accepted = results.filter((r) => r.status === 201).length;
        const rejected = results.filter((r) => r.status === 400).length;
        test.info().annotations.push({
          type: 'observed',
          description: `accepted=${accepted} rejected=${rejected} stock=${(await repo.findProduct(product.id))?.stock}`,
        });
        expect(accepted, 'orders accepted must not exceed stock').toBe(STOCK);
        expect(rejected).toBe(buyers.length - STOCK);
        await expectInventoryConserved(repo, product, STOCK);
      },
    );

    test(
      'CON-05 concurrent payment confirmations: exactly one succeeds',
      {
        tag: Tag.knownDefect,
        annotation: {
          type: 'defect',
          description: `${Defect.CONCURRENT_STATUS_RACE} – read-then-write status update`,
        },
      },
      async ({ api, admin, customer, createProduct, placeOrder }) => {
        test.fail(
          true,
          `${Defect.CONCURRENT_STATUS_RACE}: duplicate concurrent status updates are all accepted`,
        );
        const product = await createProduct();
        const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

        const results = fulfilled(
          await fireConcurrently(8, () => api.as(admin).orders.confirmPayment(order.id)),
        );

        const statuses = results.map((r) => r.status);
        test
          .info()
          .annotations.push({ type: 'observed', description: `statuses=${statuses.join(',')}` });
        expect(
          statuses.filter((s) => s === 200),
          'successful PAID confirmations',
        ).toHaveLength(1);
        expect(statuses.filter((s) => s === 400)).toHaveLength(7);
      },
    );

    test(
      'CON-06 conflicting concurrent transitions (ship vs cancel): exactly one may succeed',
      {
        tag: Tag.knownDefect,
        annotation: {
          type: 'defect',
          description: `${Defect.CONCURRENT_STATUS_RACE} – both transitions are acknowledged`,
        },
      },
      async ({ api, admin, customer, createProduct, placeOrder, repo }) => {
        test.fail(
          true,
          `${Defect.CONCURRENT_STATUS_RACE}: SHIPPED and CANCELLED are both acknowledged`,
        );
        const product = await createProduct();
        const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);
        await api.as(admin).orders.confirmPayment(order.id);
        const targets = ['SHIPPED', 'CANCELLED'] as const;

        const results = fulfilled(
          await fireConcurrently(targets.length, (i) =>
            api.as(admin).orders.updateStatus(order.id, targets[i]!),
          ),
        );

        const final = (await repo.findOrder(order.id))?.status;
        const statuses = results.map((r) => r.status);
        test.info().annotations.push({
          type: 'observed',
          description: `ship=${statuses[0]} cancel=${statuses[1]} final=${final}`,
        });
        expect(['SHIPPED', 'CANCELLED']).toContain(final);
        // Expected: the loser is rejected, so no client is told about a state the order is not in.
        expect(
          statuses.filter((s) => s === 200),
          'acknowledged transitions',
        ).toHaveLength(1);
      },
    );

    test('CON-07 repeated identical order submission creates separate orders (no idempotency key support)', async ({
      api,
      customer,
      createProduct,
      repo,
    }) => {
      // Observed behaviour, not an invented requirement: the AUT offers no
      // Idempotency-Key mechanism, so a double-submitted checkout creates two
      // orders and reserves stock twice. Business risk recorded as R-04.
      const product = await createProduct({ stock: 10 });
      const payload = { items: [{ productId: product.id, quantity: 2 }] };

      const results = fulfilled(
        await fireConcurrently(2, () =>
          api
            .as(customer)
            .orders.create(payload, { headers: { 'Idempotency-Key': 'qa-same-key-for-both' } }),
        ),
      );

      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(new Set(results.map((r) => r.body.id)).size).toBe(2);
      expect(await repo.ordersForUser(customer.user.id)).toHaveLength(2);
      expect((await repo.findProduct(product.id))?.stock).toBe(6);
    });

    test('CON-08 concurrent registrations with the same email create exactly one account', async ({
      api,
      data,
      repo,
    }) => {
      const payload = data.customer();

      const results = fulfilled(await fireConcurrently(5, () => api.auth.register(payload)));

      const statuses = results.map((r) => r.status);
      test
        .info()
        .annotations.push({ type: 'observed', description: `statuses=${statuses.join(',')}` });
      // Data integrity holds thanks to the DB unique index (the status codes are BUG-013).
      expect(await repo.countUsersByEmail(payload.email), 'database uniqueness must hold').toBe(1);
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    });

    test(
      'CON-09 concurrent duplicate registrations: losers receive 409 Conflict',
      {
        tag: Tag.knownDefect,
        annotation: {
          type: 'defect',
          description: `${Defect.REGISTRATION_RACE_500} docs/bug-reports/BUG-013-concurrent-registration-500.md`,
        },
      },
      async ({ api, data }) => {
        test.fail(
          true,
          `${Defect.REGISTRATION_RACE_500}: unique-constraint violation surfaces as 500`,
        );
        const payload = data.customer();

        const results = fulfilled(await fireConcurrently(5, () => api.auth.register(payload)));

        const statuses = results.map((r) => r.status).sort();
        test
          .info()
          .annotations.push({ type: 'observed', description: `statuses=${statuses.join(',')}` });
        expect(statuses).toEqual([201, 409, 409, 409, 409]);
      },
    );

    test(
      'CON-10 concurrent cancellations of the same order: exactly one succeeds',
      {
        tag: Tag.knownDefect,
        annotation: {
          type: 'defect',
          description: `${Defect.CONCURRENT_STATUS_RACE} – duplicate transitions acknowledged`,
        },
      },
      async ({ api, admin, customer, createProduct, placeOrder, repo }) => {
        test.fail(
          true,
          `${Defect.CONCURRENT_STATUS_RACE}: duplicate CANCELLED transitions are all acknowledged`,
        );
        const product = await createProduct();
        const order = await placeOrder(customer, [{ productId: product.id, quantity: 1 }]);

        const results = fulfilled(
          await fireConcurrently(5, () => api.as(admin).orders.cancel(order.id)),
        );

        const statuses = results.map((r) => r.status);
        test
          .info()
          .annotations.push({ type: 'observed', description: `statuses=${statuses.join(',')}` });
        expect((await repo.findOrder(order.id))?.status).toBe('CANCELLED');
        expect(
          statuses.filter((s) => s === 200),
          'acknowledged cancellations',
        ).toHaveLength(1);
      },
    );

    test(
      'CON-11 checkout under heavy contention: no 5xx and no order persisted without a 201 (phantom order)',
      {
        tag: Tag.knownDefect,
        annotation: {
          type: 'defect',
          description: `${Defect.CONTENTION_TIMEOUT_PHANTOM} docs/bug-reports/BUG-012-contention-timeout-phantom-orders.md`,
        },
      },
      async ({ api, registerCustomer, createProduct, repo }) => {
        test.slow();
        const buyers = await Promise.all(Array.from({ length: 16 }, () => registerCustomer()));
        const rounds = await burstUntilServerError(3, async () => {
          const product = await createProduct({ stock: 1_000 });
          const results = fulfilled(
            await fireConcurrently(buyers.length, (i) =>
              api.as(buyers[i]!).orders.create({ items: [{ productId: product.id, quantity: 1 }] }),
            ),
          );
          return {
            accepted: results.filter((r) => r.status === 201).length,
            serverErrors: results.filter((r) => r.status >= 500).length,
            persisted: await repo.orderedUnits(product.id),
          };
        });

        test.info().annotations.push({ type: 'observed', description: JSON.stringify(rounds) });
        const reproduced = rounds.some((r) => r.serverErrors > 0);
        // The defect needs ≥ 5 s of row-lock queueing; fast hosts may never reach it.
        test.skip(
          !reproduced,
          `${Defect.CONTENTION_TIMEOUT_PHANTOM} precondition (transaction timeout) not reached on this host`,
        );
        test.fail(
          true,
          `${Defect.CONTENTION_TIMEOUT_PHANTOM}: timed-out checkouts return 500 and may still commit`,
        );

        const last = rounds[rounds.length - 1]!;
        expect(last.serverErrors, '5xx responses').toBe(0);
        expect(last.persisted, 'persisted orders must equal acknowledged orders').toBe(
          last.accepted,
        );
      },
    );
  },
);
