import type { DbClient } from './DbClient';

/* Row types mirror the AUT's Prisma-generated tables (quoted, PascalCase). */
export interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'ADMIN' | 'CUSTOMER';
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  stock: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderRow {
  id: string;
  userId: string;
  status: string;
  totalCents: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemRow {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface ColumnInfo {
  table_name: string;
  column_name: string;
  is_nullable: 'YES' | 'NO';
  data_type: string;
}

export interface ConstraintInfo {
  constraint_name: string;
  constraint_type: string;
  table_name: string;
}

/** Read-only, parameterized queries used by database assertions. */
export class OrderRepository {
  constructor(private readonly db: DbClient) {}

  findUserByEmail(email: string) {
    return this.db.one<UserRow>('SELECT * FROM "User" WHERE email = $1', [email]);
  }

  findUserById(id: string) {
    return this.db.one<UserRow>('SELECT * FROM "User" WHERE id = $1', [id]);
  }

  countUsersByEmail(email: string) {
    return this.db
      .one<{ count: string }>(
        'SELECT COUNT(*)::text AS count FROM "User" WHERE lower(email) = lower($1)',
        [email],
      )
      .then((r) => Number(r?.count ?? 0));
  }

  findProduct(id: string) {
    return this.db.one<ProductRow>('SELECT * FROM "Product" WHERE id = $1', [id]);
  }

  productsByName(name: string) {
    return this.db.query<ProductRow>('SELECT * FROM "Product" WHERE name = $1', [name]);
  }

  findOrder(id: string) {
    return this.db.one<OrderRow>('SELECT * FROM "Order" WHERE id = $1', [id]);
  }

  findOrderItems(orderId: string) {
    return this.db.query<OrderItemRow>(
      'SELECT * FROM "OrderItem" WHERE "orderId" = $1 ORDER BY id',
      [orderId],
    );
  }

  ordersForUser(userId: string) {
    return this.db.query<OrderRow>(
      'SELECT * FROM "Order" WHERE "userId" = $1 ORDER BY "createdAt"',
      [userId],
    );
  }

  /** Units of a product held by non-cancelled orders. */
  reservedUnits(productId: string) {
    return this.db
      .one<{ units: string }>(
        `SELECT COALESCE(SUM(oi.quantity), 0)::text AS units
           FROM "OrderItem" oi JOIN "Order" o ON o.id = oi."orderId"
          WHERE oi."productId" = $1 AND o.status <> 'CANCELLED'`,
        [productId],
      )
      .then((r) => Number(r?.units ?? 0));
  }

  /** Units of a product across all orders regardless of status. */
  orderedUnits(productId: string) {
    return this.db
      .one<{ units: string }>(
        'SELECT COALESCE(SUM(quantity), 0)::text AS units FROM "OrderItem" WHERE "productId" = $1',
        [productId],
      )
      .then((r) => Number(r?.units ?? 0));
  }

  /** Orders whose stored total differs from Σ(quantity × unitPrice) of their items. */
  ordersWithInconsistentTotals(orderIds: string[]) {
    return this.db.query<{ id: string; totalCents: number; computed: string }>(
      `SELECT o.id, o."totalCents", COALESCE(SUM(oi.quantity * oi."unitPriceCents"), 0)::text AS computed
         FROM "Order" o LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
        WHERE o.id = ANY($1::text[])
        GROUP BY o.id
       HAVING o."totalCents" <> COALESCE(SUM(oi.quantity * oi."unitPriceCents"), 0)`,
      [orderIds],
    );
  }

  orphanOrderItems() {
    return this.db.query<OrderItemRow>(
      `SELECT oi.* FROM "OrderItem" oi
         LEFT JOIN "Order" o ON o.id = oi."orderId"
         LEFT JOIN "Product" p ON p.id = oi."productId"
        WHERE o.id IS NULL OR p.id IS NULL`,
    );
  }

  ordersWithoutItems() {
    return this.db.query<OrderRow>(
      `SELECT o.* FROM "Order" o
        WHERE NOT EXISTS (SELECT 1 FROM "OrderItem" oi WHERE oi."orderId" = o.id)`,
    );
  }

  ordersWithMissingUser() {
    return this.db.query<OrderRow>(
      'SELECT o.* FROM "Order" o LEFT JOIN "User" u ON u.id = o."userId" WHERE u.id IS NULL',
    );
  }

  productsWithNegativeStock(productIds?: string[]) {
    return productIds
      ? this.db.query<ProductRow>(
          'SELECT * FROM "Product" WHERE stock < 0 AND id = ANY($1::text[])',
          [productIds],
        )
      : this.db.query<ProductRow>('SELECT * FROM "Product" WHERE stock < 0');
  }

  columns(tables: string[]) {
    return this.db.query<ColumnInfo>(
      `SELECT table_name, column_name, is_nullable, data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1::text[])
        ORDER BY table_name, ordinal_position`,
      [tables],
    );
  }

  /**
   * Uses pg_catalog rather than information_schema.table_constraints, which
   * hides constraints from roles that only hold SELECT (our read-only role).
   */
  constraints(tables: string[]) {
    return this.db.query<ConstraintInfo>(
      `SELECT c.conname AS constraint_name,
              CASE c.contype WHEN 'f' THEN 'FOREIGN KEY' WHEN 'p' THEN 'PRIMARY KEY'
                             WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' ELSE c.contype::text END AS constraint_type,
              t.relname AS table_name
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = ANY($1::text[])`,
      [tables],
    );
  }

  uniqueIndexes(table: string) {
    return this.db.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' AND tablename = $1 AND indexdef ILIKE 'CREATE UNIQUE%'`,
      [table],
    );
  }

  tableExists(table: string) {
    return this.db
      .one<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
        [table],
      )
      .then((r) => r?.exists === true);
  }

  /** Effective privileges of the connected role – used to prove read-only access. */
  currentRolePrivileges() {
    return this.db.query<{ table_name: string; privilege_type: string }>(
      `SELECT table_name, privilege_type FROM information_schema.role_table_grants
        WHERE grantee = current_user AND table_schema = 'public'`,
    );
  }
}
