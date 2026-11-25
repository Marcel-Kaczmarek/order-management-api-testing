import { Endpoints } from '@src/constants';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@src/models';
import { BaseApiClient, type ApiResult, type RequestOptions } from './BaseApiClient';

export class AuthClient extends BaseApiClient {
  register(
    payload: RegisterRequest | Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResult<AuthResponse>> {
    return this.send<AuthResponse>('POST', Endpoints.register, { ...options, data: payload });
  }

  login(
    payload: LoginRequest | Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<ApiResult<AuthResponse>> {
    return this.send<AuthResponse>('POST', Endpoints.login, { ...options, data: payload });
  }
}
