import { Endpoints, type OrderStatus } from '@src/constants';
import type { CreateOrderRequest, Order, PaginatedResponse, PaginationQuery } from '@src/models';
import { BaseApiClient, type ApiResult, type RequestOptions } from './BaseApiClient';

export class OrderClient extends BaseApiClient {
  create(
    payload: CreateOrderRequest | Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResult<Order>> {
    return this.send<Order>('POST', Endpoints.orders, { ...options, data: payload });
  }

  list(
    query: PaginationQuery = {},
    options?: RequestOptions,
  ): Promise<ApiResult<PaginatedResponse<Order>>> {
    return this.send<PaginatedResponse<Order>>('GET', Endpoints.orders, {
      ...options,
      params: query as Record<string, number>,
    });
  }

  get(id: string, options?: RequestOptions): Promise<ApiResult<Order>> {
    return this.send<Order>('GET', Endpoints.order(id), options);
  }

  updateStatus(
    id: string,
    status: OrderStatus,
    options?: RequestOptions,
  ): Promise<ApiResult<Order>> {
    return this.send<Order>('PATCH', Endpoints.orderStatus(id), { ...options, data: { status } });
  }

  /** Simulated payment confirmation – the AUT models payment as PENDING → PAID. */
  confirmPayment(id: string, options?: RequestOptions): Promise<ApiResult<Order>> {
    return this.updateStatus(id, 'PAID', options);
  }

  ship(id: string, options?: RequestOptions): Promise<ApiResult<Order>> {
    return this.updateStatus(id, 'SHIPPED', options);
  }

  deliver(id: string, options?: RequestOptions): Promise<ApiResult<Order>> {
    return this.updateStatus(id, 'DELIVERED', options);
  }

  cancel(id: string, options?: RequestOptions): Promise<ApiResult<Order>> {
    return this.updateStatus(id, 'CANCELLED', options);
  }
}
