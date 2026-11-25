import jwt from 'jsonwebtoken';
import { env } from '@src/config/env';
import type { AccessTokenClaims } from '@src/models';

/**
 * Token crafting helpers for negative authentication tests.
 * They rely on the *local* AUT secret and are only meaningful in the
 * locally controlled environment.
 */
export function decodeClaims(token: string): AccessTokenClaims {
  const decoded = jwt.decode(token, { json: true });
  if (!decoded) throw new Error('Token is not a decodable JWT');
  return decoded as unknown as AccessTokenClaims;
}

export function decodeHeader(token: string): Record<string, unknown> {
  const [header] = token.split('.');
  return JSON.parse(Buffer.from(header ?? '', 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

/** Validly-signed token whose `exp` lies in the past. */
export function signExpiredToken(
  claims: Pick<AccessTokenClaims, 'sub' | 'email' | 'role'>,
): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ ...claims, iat: now - 7200, exp: now - 3600 }, env.JWT_SECRET, {
    algorithm: 'HS256',
  });
}

/** Correctly-structured token signed with a secret the AUT does not know. */
export function signWithForeignSecret(
  claims: Pick<AccessTokenClaims, 'sub' | 'email' | 'role'>,
): string {
  return jwt.sign(claims, 'attacker-controlled-secret-0123456789', {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

/** Unsigned token using `alg: none` (classic JWT bypass attempt). */
export function unsignedToken(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ ...claims, iat: now, exp: now + 3600 })}.`;
}

/** Keeps header + signature but swaps the payload (e.g. privilege escalation to ADMIN). */
export function tamperPayload(token: string, overrides: Record<string, unknown>): string {
  const [header, payload, signature] = token.split('.');
  const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as object;
  const forged = Buffer.from(JSON.stringify({ ...claims, ...overrides })).toString('base64url');
  return `${header}.${forged}.${signature}`;
}

/** Flips one character in the signature segment. */
export function corruptSignature(token: string): string {
  const [header, payload, signature = ''] = token.split('.');
  const flipped = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  return `${header}.${payload}.${flipped}`;
}
