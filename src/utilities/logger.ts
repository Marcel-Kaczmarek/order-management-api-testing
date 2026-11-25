import { env } from '@src/config/env';
import { sanitize } from './sanitizer';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Minimal structured (JSON lines) logger. Every payload is sanitized so that
 * logs are safe to keep as CI artifacts.
 */
function log(level: Level, message: string, context: Record<string, unknown> = {}): void {
  if (ORDER[level] < ORDER[env.LOG_LEVEL]) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...(sanitize(context) as Record<string, unknown>),
  });
  // stderr keeps Playwright's list reporter output readable.
  process.stderr.write(`${line}\n`);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => log('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => log('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => log('error', message, context),
};
