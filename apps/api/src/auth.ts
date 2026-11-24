import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hex] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const hash = (await scryptAsync(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  if (hash.length !== expected.length) return false;
  return timingSafeEqual(hash, expected);
}

export function signAccess(userId: string, secret: string): string {
  return jwt.sign({ sub: userId }, secret, { expiresIn: '15m' });
}

export function readAccessSubject(token: string, secret: string): string | null {
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === 'string' || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}

export function createTotp(email: string, secret: OTPAuth.Secret) {
  return new OTPAuth.TOTP({
    issuer: 'Ninted 9ja',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });
}

export function verifyTotp(email: string, secretBase32: string, token: string): boolean {
  const totp = createTotp(email, OTPAuth.Secret.fromBase32(secretBase32));
  return totp.validate({ token, window: 1 }) !== null;
}

export function newMfaSecret(): OTPAuth.Secret {
  return new OTPAuth.Secret({ size: 20 });
}
