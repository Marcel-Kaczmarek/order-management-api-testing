import type { APIRequestContext } from '@playwright/test';
import type { Session } from '@src/models';
import { AuthClient } from './AuthClient';
import { BaseApiClient, type HttpRecorder } from './BaseApiClient';
import { InventoryClient } from './InventoryClient';
import { OrderClient } from './OrderClient';
import { ProductClient } from './ProductClient';
import { UserClient } from './UserClient';

/**
 * Facade over all service clients. `api.as(session)` returns the same set
 * of clients bound to a bearer token, which keeps tests readable:
 *   await api.as(customer).orders.create(payload)
 */
export class ApiClients {
  readonly auth: AuthClient;
  readonly users: UserClient;
  readonly products: ProductClient;
  readonly inventory: InventoryClient;
  readonly orders: OrderClient;
  /** Low-level access for protocol-level tests (methods, content types, raw bodies). */
  readonly raw: BaseApiClient;

  constructor(
    private readonly request: APIRequestContext,
    private readonly recorder?: HttpRecorder,
    token?: string,
  ) {
    this.auth = new AuthClient(request, recorder, token);
    this.users = new UserClient(request, recorder, token);
    this.products = new ProductClient(request, recorder, token);
    this.inventory = new InventoryClient(request, recorder, token);
    this.orders = new OrderClient(request, recorder, token);
    this.raw = new BaseApiClient(request, recorder, token);
  }

  as(actor: Session | string): ApiClients {
    return new ApiClients(
      this.request,
      this.recorder,
      typeof actor === 'string' ? actor : actor.token,
    );
  }
}

export { AuthClient, BaseApiClient, InventoryClient, OrderClient, ProductClient, UserClient };
export type { ApiResult, HttpExchange, RequestOptions } from './BaseApiClient';
export { HttpRecorder } from './BaseApiClient';
