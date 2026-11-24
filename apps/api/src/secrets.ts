import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function encryptString(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptString(payload: string, key: Buffer): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashPin(pin: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:${pin}`).digest('hex');
}

export function pinsMatch(pin: string, pepper: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPin(pin, pepper));
  const expected = Buffer.from(expectedHash);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function randomReference(prefix = 'n9'): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

export function randomPin(): string {
  return String(randomBytes(4).readUInt32BE() % 1_000_000).padStart(6, '0');
}
