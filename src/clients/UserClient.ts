import { Endpoints } from '@src/constants';
import type { UserProfile } from '@src/models';
import { BaseApiClient, type ApiResult, type RequestOptions } from './BaseApiClient';

/**
 * Customer / user account endpoints. The AUT models customers as `User`
 * records with role CUSTOMER, exposed under `/users`.
 */
export class UserClient extends BaseApiClient {
  me(options?: RequestOptions): Promise<ApiResult<UserProfile>> {
    return this.send<UserProfile>('GET', Endpoints.me, options);
  }

  list(options?: RequestOptions): Promise<ApiResult<UserProfile[]>> {
    return this.send<UserProfile[]>('GET', Endpoints.users, options);
  }
}
