import { Endpoints } from '@src/constants';
import type {
  CreateProductRequest,
  PaginatedResponse,
  PaginationQuery,
  Product,
  UpdateProductRequest,
} from '@src/models';
import { BaseApiClient, type ApiResult, type RequestOptions } from './BaseApiClient';

export class ProductClient extends BaseApiClient {
  list(
    query: PaginationQuery | Record<string, string | number> = {},
    options?: RequestOptions,
  ): Promise<ApiResult<PaginatedResponse<Product>>> {
    return this.send<PaginatedResponse<Product>>('GET', Endpoints.products, {
      ...options,
      params: query as Record<string, string | number>,
    });
  }

  get(id: string, options?: RequestOptions): Promise<ApiResult<Product>> {
    return this.send<Product>('GET', Endpoints.product(id), options);
  }

  create(
    payload: CreateProductRequest | Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResult<Product>> {
    return this.send<Product>('POST', Endpoints.products, { ...options, data: payload });
  }

  update(
    id: string,
    payload: UpdateProductRequest | Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResult<Product>> {
    return this.send<Product>('PATCH', Endpoints.product(id), { ...options, data: payload });
  }

  /** Soft delete: the AUT sets `isActive=false` and returns the product. */
  remove(id: string, options?: RequestOptions): Promise<ApiResult<Product>> {
    return this.send<Product>('DELETE', Endpoints.product(id), options);
  }
}
