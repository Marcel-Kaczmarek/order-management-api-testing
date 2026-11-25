import type { Order, Product } from '@src/models';
import type { OrderRepository } from '@src/database/OrderRepository';
import { expect } from './matchers';

/** Order total must equal Σ(quantity × unit price). The AUT has no tax/discount. */
export function expectOrderTotalConsistent(order: Order): void {
  const computed = order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  expect(order.totalCents, `order ${order.id} total vs Σ(items)`).toBe(computed);
}

/** Each line item captures the product price that was current at checkout. */
export function expectUnitPricesSnapshot(
  order: Order,
  pricesAtCheckout: Map<string, number>,
): void {
  for (const item of order.items) {
    expect(item.unitPriceCents, `unit price for ${item.productId}`).toBe(
      pricesAtCheckout.get(item.productId),
    );
  }
}

/** API representation of an order must match what PostgreSQL stores. */
export async function expectOrderPersisted(repo: OrderRepository, order: Order): Promise<void> {
  const row = await repo.findOrder(order.id);
  expect(row, `order ${order.id} row`).toBeDefined();
  expect(row).toMatchObject({
    userId: order.userId,
    status: order.status,
    totalCents: order.totalCents,
  });
  expect(row?.createdAt.toISOString()).toBe(order.createdAt);

  const items = await repo.findOrderItems(order.id);
  expect(items).toHaveLength(order.items.length);
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const item of order.items) {
    expect(byId.get(item.id), `order item ${item.id}`).toMatchObject({
      orderId: order.id,
      productId: item.productId,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
    });
  }
}

/**
 * Inventory conservation: for a product created by the test with `initialStock`,
 * current stock + units held by non-cancelled orders must equal the initial stock,
 * and stock must never be negative.
 */
export async function expectInventoryConserved(
  repo: OrderRepository,
  product: Pick<Product, 'id'>,
  initialStock: number,
): Promise<void> {
  const row = await repo.findProduct(product.id);
  const reserved = await repo.reservedUnits(product.id);
  expect(row?.stock, `stock of ${product.id} must not be negative`).toBeGreaterThanOrEqual(0);
  expect((row?.stock ?? 0) + reserved, `stock + reserved units for ${product.id}`).toBe(
    initialStock,
  );
}
