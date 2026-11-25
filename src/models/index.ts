import type { OrderStatus, Role } from '@src/constants';

/* ----------------------------- Requests ----------------------------- */

export interface RegisterRequest {
  email: string;
  name: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateProductRequest {
  name: string;
  description?: string;
  priceCents: number;
  stock: number;
  isActive?: boolean;
}

export type UpdateProductRequest = Partial<CreateProductRequest>;

export interface OrderItemRequest {
  productId: string;
  quantity: number;
}

export interface CreateOrderRequest {
  items: OrderItemRequest[];
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/* ----------------------------- Responses ---------------------------- */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface UserProfile extends AuthUser {
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
  product: Product;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  totalCents: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Uniform error envelope produced by the AUT's global HttpExceptionFilter. */
export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/** JWT claims issued by the AUT (`sub`, `email`, `role`) plus registered claims. */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: Role;
  iat: number;
  exp: number;
}

/** An authenticated actor used throughout the tests. */
export interface Session {
  token: string;
  user: AuthUser;
  password: string;
}
