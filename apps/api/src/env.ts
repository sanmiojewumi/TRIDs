import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function loadDotEnv() {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadDotEnv();

function required(name: string, min = 1): string {
  const value = process.env[name]?.trim() ?? '';
  if (value.length < min) throw new Error(`${name} is required`);
  return value;
}

export interface Env {
  databaseUrl: string;
  accessTokenSecret: string;
  encryptionKey: Buffer;
  webOrigin: string;
  publicWebUrl: string;
  apiPublicUrl: string;
  paymentProvider: 'PAYSTACK' | 'FLUTTERWAVE';
  paystackSecret: string;
  flutterwaveSecret: string;
  flutterwaveWebhookHash: string;
  transfersEnabled: boolean;
  phase2: boolean;
  smtpUrl: string;
  smsHttpUrl: string;
  smsApiKey: string;
  pushHttpUrl: string;
  pushApiKey: string;
  port: number;
  nodeEnv: string;
}

export function readEnv(overrides: Partial<Record<string, string>> = {}): Env {
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) process.env[key] = value;
  }
  const encryptionHex = required('SECRET_ENCRYPTION_KEY', 64);
  if (!/^[0-9a-fA-F]{64}$/.test(encryptionHex)) {
    throw new Error('SECRET_ENCRYPTION_KEY must be 64 hex characters');
  }
  const provider = (process.env.PAYMENT_PROVIDER || 'paystack').toLowerCase();
  if (provider !== 'paystack' && provider !== 'flutterwave') {
    throw new Error('PAYMENT_PROVIDER must be paystack or flutterwave');
  }
  return {
    databaseUrl: required('DATABASE_URL'),
    accessTokenSecret: required('ACCESS_TOKEN_SECRET', 32),
    encryptionKey: Buffer.from(encryptionHex, 'hex'),
    webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3000',
    publicWebUrl: process.env.PUBLIC_WEB_URL || 'http://localhost:3000',
    apiPublicUrl: process.env.API_PUBLIC_URL || 'http://127.0.0.1:4000',
    paymentProvider: provider === 'flutterwave' ? 'FLUTTERWAVE' : 'PAYSTACK',
    paystackSecret: process.env.PAYSTACK_SECRET_KEY?.trim() || '',
    flutterwaveSecret: process.env.FLUTTERWAVE_SECRET_KEY?.trim() || '',
    flutterwaveWebhookHash: process.env.FLUTTERWAVE_WEBHOOK_HASH?.trim() || '',
    transfersEnabled: process.env.PAYSTACK_TRANSFERS_ENABLED === 'true',
    phase2: process.env.PHASE2_LOGISTICS === 'true',
    smtpUrl: process.env.SMTP_URL?.trim() || '',
    smsHttpUrl: process.env.SMS_HTTP_URL?.trim() || '',
    smsApiKey: process.env.SMS_API_KEY?.trim() || '',
    pushHttpUrl: process.env.PUSH_HTTP_URL?.trim() || '',
    pushApiKey: process.env.PUSH_API_KEY?.trim() || '',
    port: Number(process.env.PORT || 4000),
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}
