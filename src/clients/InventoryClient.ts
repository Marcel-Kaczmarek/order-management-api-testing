import { Endpoints } from '@src/constants';
import type { Product } from '@src/models';
import { BaseApiClient, type ApiResult, type RequestOptions } from './BaseApiClient';

/**
 * Inventory facade. The AUT has no dedicated inventory service: stock is the
 * `Product.stock` column, read via GET /products/:id and adjusted by an admin
 * via PATCH /products/:id. This client gives tests an inventory-centric
 * vocabulary without inventing endpoints.
 */
export class InventoryClient extends BaseApiClient {
  async getStock(productId: string, options?: RequestOptions): Promise<number> {
    const result = await this.send<Product>('GET', Endpoints.product(productId), options);
    if (result.status !== 200) {
      throw new Error(`Cannot read stock of ${productId}: HTTP ${result.status}`);
    }
    return result.body.stock;
  }

  setStock(
    productId: string,
    stock: number,
    options?: RequestOptions,
  ): Promise<ApiResult<Product>> {
    return this.send<Product>('PATCH', Endpoints.product(productId), {
      ...options,
      data: { stock },
    });
  }
}
