import type { APIRequestContext } from '@playwright/test';
import { env } from '@src/config/env';
import type { ErrorResponse } from '@src/models';
import { logger } from '@src/utilities/logger';
import { sanitize, sanitizeHeaders } from '@src/utilities/sanitizer';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface RequestOptions {
  /** JSON-serialisable body, or a raw string sent verbatim (used for malformed payload tests). */
  data?: unknown;
  params?: Record<string, string | number | boolean>;
  headers?: Record<string, string>;
  /** Per-call bearer token; overrides the token bound to the client. */
  token?: string | null;
}

export interface ApiResult<T> {
  method: HttpMethod;
  url: string;
  status: number;
  headers: Record<string, string>;
  /** Parsed JSON body typed as the success contract. */
  body: T;
  /** Same body typed as the AUT's error envelope (for 4xx/5xx assertions). */
  error: ErrorResponse;
  rawText: string;
  durationMs: number;
}

export interface HttpExchange {
  method: HttpMethod;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  durationMs: number;
}

/** Collects sanitized exchanges for a single test; attached to the report on failure. */
export class HttpRecorder {
  readonly exchanges: HttpExchange[] = [];
  record(exchange: HttpExchange): void {
    this.exchanges.push(exchange);
  }
}

/**
 * Thin, typed wrapper around Playwright's APIRequestContext.
 * Responsibilities: auth header injection, JSON parsing, timing and sanitized
 * diagnostics. It never asserts – assertions belong to tests/assertion helpers.
 */
export class BaseApiClient {
  constructor(
    protected readonly request: APIRequestContext,
    protected readonly recorder?: HttpRecorder,
    protected readonly token?: string,
  ) {}

  async send<T>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<ApiResult<T>> {
    const token = options.token === undefined ? this.token : options.token;
    const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;

    const started = performance.now();
    const response = await this.request.fetch(path, {
      method,
      headers,
      params: options.params,
      data: options.data as string | Buffer | object | undefined,
      failOnStatusCode: false,
      timeout: env.TEST_TIMEOUT_MS,
    });
    const durationMs = Math.round(performance.now() - started);
    const rawText = await response.text();
    const body = parseJson(rawText);

    const exchange: HttpExchange = {
      method,
      url: response.url(),
      requestHeaders: sanitizeHeaders(headers),
      requestBody: sanitize(options.data),
      status: response.status(),
      responseHeaders: sanitizeHeaders(response.headers()),
      responseBody: sanitize(body),
      durationMs,
    };
    this.recorder?.record(exchange);
    logger.debug('http', { method, url: exchange.url, status: exchange.status, durationMs });

    return {
      method,
      url: response.url(),
      status: response.status(),
      headers: response.headers(),
      body: body as T,
      error: body as ErrorResponse,
      rawText,
      durationMs,
    };
  }
}

function parseJson(text: string): unknown {
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
