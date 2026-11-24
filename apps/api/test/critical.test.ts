import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import * as OTPAuth from 'otpauth';
import { paystackSignature } from '@ninted/domain';
import { buildApp } from '../src/build-app.js';
import { readEnv } from '../src/env.js';
import type { PaymentGateway } from '../src/gateways.js';
import { encryptString } from '../src/secrets.js';
import { LocalStorage } from '../src/storage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://ninted:ninted@127.0.0.1:5432/ninted_test?schema=public';
process.env.ACCESS_TOKEN_SECRET = 'test-access-token-secret-with-32-chars';
process.env.SECRET_ENCRYPTION_KEY = 'ab'.repeat(32);
process.env.PAYMENT_PROVIDER = 'paystack';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_ninted';
process.env.PHASE2_LOGISTICS = 'false';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.PUBLIC_WEB_URL = 'http://localhost:3000';
process.env.NODE_ENV = 'test';

const env = readEnv();
const prisma = new PrismaClient({ datasourceUrl: env.databaseUrl });
const charges = new Map<string, { amountKobo: number; status: string }>();
const gateway: PaymentGateway = {
  provider: 'PAYSTACK',
  async initialize(input) {
    return { authorizationUrl: `https://pay.example/${input.reference}`, reference: input.reference };
  },
  async verify(reference) {
    const charge = charges.get(reference);
    if (!charge) return null;
    return {
      reference,
      amountKobo: charge.amountKobo,
      currency: 'NGN',
      status: charge.status,
      providerTransactionId: `tx_${reference}`,
    };
  },
  async refund() {
    return { providerRefundId: 'rf_1', status: 'processed' };
  },
};

let app: Awaited<ReturnType<typeof buildApp>>;

async function reset() {
  await prisma.$executeRawUnsafe(`
    DO $$ DECLARE r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `);
}

beforeAll(async () => {
  execSync('pnpm exec prisma db push --skip-generate --accept-data-loss', {
    cwd: root,
    env: process.env,
    stdio: 'pipe',
  });
  await reset();
  app = await buildApp({
    prisma,
    env,
    gateway,
    storage: new LocalStorage(path.join(root, 'uploads'), 'http://localhost:4000'),
  });
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe('marketplace critical paths', () => {
  it('snapshots commercial terms, verifies payment once, and keeps the ledger balanced', async () => {
    const category = await prisma.category.create({ data: { slug: 'shoes', name: 'Shoes' } });
    const sellerRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'seller@example.com',
        password: 'Correct-horse-1',
        displayName: 'Ada Seller',
        intent: 'SELL_INDIVIDUAL',
        storeName: 'Ada Closet',
        state: 'Lagos',
        city: 'Yaba',
      },
    });
    expect(sellerRes.statusCode).toBe(201);
    const seller = sellerRes.json().user;
    const { hashPassword } = await import('../src/auth.js');
    const secret = new OTPAuth.Secret({ size: 20 });
    const admin = await prisma.user.create({
      data: {
        email: 'owner@example.com',
        displayName: 'Owner',
        passwordHash: await hashPassword('Owner-pass-1'),
        mfaEnabled: true,
        mfaSecretEnc: encryptString(secret.base32, env.encryptionKey),
        roles: { create: { role: 'SUPER_ADMIN' } },
      },
    });
    expect(admin.id).toBeTruthy();
    const otp = new OTPAuth.TOTP({ issuer: 'Ninted 9ja', label: 'owner@example.com', secret, digits: 6, period: 30 }).generate();
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'owner@example.com', password: 'Owner-pass-1', otp },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminToken = adminLogin.json().accessToken as string;

    const verifySeller = await app.inject({
      method: 'POST',
      url: `/admin/sellers/${seller.id}/verification`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'VERIFIED' },
    });
    expect(verifySeller.statusCode).toBe(200);

    const fee = await app.inject({
      method: 'POST',
      url: '/admin/commercial-settings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        key: 'SELLER_COMMISSION_BPS',
        valueType: 'BPS',
        valueNumber: 1000,
        effectiveFrom: new Date().toISOString(),
        reason: 'Owner approved a 10% starting commission',
      },
    });
    expect(fee.statusCode).toBe(201);

    const created = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${sellerRes.json().accessToken}` },
      payload: {
        title: 'Leather loafers',
        description: 'Worn twice, clean soles and original box.',
        categoryId: category.id,
        condition: 'VERY_GOOD',
        priceNaira: 10000,
        state: 'Lagos',
        city: 'Yaba',
        weightGrams: 800,
        publish: true,
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().product.status).toBe('ACTIVE');
    const productId = created.json().product.id as string;

    const blocked = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${sellerRes.json().accessToken}` },
      payload: {
        title: 'Item',
        description: 'A normal description that is long enough.',
        categoryId: category.id,
        priceNaira: 5000,
        state: 'Lagos',
        city: 'Yaba',
      },
    });
    expect(blocked.statusCode).toBe(201);
    await prisma.prohibitedTerm.create({ data: { term: 'firearm' } });
    const held = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${sellerRes.json().accessToken}` },
      payload: {
        title: 'Firearm case',
        description: 'This description is long enough to submit.',
        categoryId: category.id,
        priceNaira: 5000,
        state: 'Lagos',
        city: 'Yaba',
      },
    });
    expect(held.json().product.status).toBe('PENDING_REVIEW');

    const buyerRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'buyer@example.com', password: 'Correct-horse-1', displayName: 'Tunde Buyer', state: 'Lagos' },
    });
    const buyerToken = buyerRes.json().accessToken as string;
    const address = await app.inject({
      method: 'POST',
      url: '/addresses',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { recipient: 'Tunde Buyer', phone: '08030000000', line1: '12 Allen Avenue', city: 'Ikeja', state: 'Lagos' },
    });
    const orderRes = await app.inject({
      method: 'POST',
      url: '/checkout',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        sellerId: seller.id,
        lines: [{ productId, quantity: 1 }],
        handover: 'SELLER_ARRANGED',
        addressId: address.json().address.id,
        idempotencyKey: 'checkout-1',
      },
    });
    expect(orderRes.statusCode).toBe(201);
    const order = orderRes.json().order;
    expect(order.commissionKobo).toBe(100_000);
    expect(order.buyerTotalKobo).toBe(1_000_000);
    expect(order.sellerNetKobo).toBe(900_000);

    const again = await app.inject({
      method: 'POST',
      url: '/checkout',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: {
        sellerId: seller.id,
        lines: [{ productId, quantity: 1 }],
        handover: 'SELLER_ARRANGED',
        idempotencyKey: 'checkout-1',
      },
    });
    expect(again.json().order.id).toBe(order.id);

    const raised = await app.inject({
      method: 'POST',
      url: '/admin/commercial-settings',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        key: 'SELLER_COMMISSION_BPS',
        valueType: 'BPS',
        valueNumber: 2000,
        effectiveFrom: new Date(Date.now() + 1000).toISOString(),
        reason: 'Owner raised commission; existing orders stay on the old terms',
      },
    });
    expect(raised.statusCode).toBe(201);
    const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect((stored.feeSnapshot as { commissionKobo: number }).commissionKobo).toBe(100_000);

    const unconfigured = await buildApp({
      prisma,
      env: { ...env, paystackSecret: '' },
      gateway: null,
      storage: new LocalStorage(path.join(root, 'uploads'), 'http://localhost:4000'),
    });
    const refused = await unconfigured.inject({
      method: 'POST',
      url: '/payments/initiate',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { orderId: order.id },
    });
    expect(refused.statusCode).toBe(503);
    expect(refused.json().code).toBe('PAYMENT_UNCONFIGURED');
    await unconfigured.close();

    const initiated = await app.inject({
      method: 'POST',
      url: '/payments/initiate',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { orderId: order.id },
    });
    expect(initiated.statusCode).toBe(200);
    const reference = initiated.json().reference as string;
    charges.set(reference, { amountKobo: 50, status: 'success' });
    const badAmount = await app.inject({
      method: 'POST',
      url: '/payments/verify',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { reference },
    });
    expect(badAmount.json().status).toBe('FAILED');

    await prisma.payment.update({ where: { reference }, data: { status: 'PENDING', failureReason: null } });
    charges.set(reference, { amountKobo: 1_000_000, status: 'success' });
    const raw = JSON.stringify({ event: 'charge.success', data: { id: 99, reference } });
    const badHook = await app.inject({
      method: 'POST',
      url: '/payments/webhooks/paystack',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': 'deadbeef' },
      payload: raw,
    });
    expect(badHook.statusCode).toBe(401);
    const goodHook = await app.inject({
      method: 'POST',
      url: '/payments/webhooks/paystack',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': paystackSignature(raw, env.paystackSecret) },
      payload: raw,
    });
    expect(goodHook.statusCode).toBe(200);
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe('AWAITING_DISPATCH');
    const ledgerCount = await prisma.ledgerEntry.count({ where: { orderId: order.id } });
    expect(ledgerCount).toBeGreaterThan(0);
    const replay = await app.inject({
      method: 'POST',
      url: '/payments/webhooks/paystack',
      headers: { 'content-type': 'application/json', 'x-paystack-signature': paystackSignature(raw, env.paystackSecret) },
      payload: raw,
    });
    expect(replay.statusCode).toBe(200);
    expect(await prisma.ledgerEntry.count({ where: { orderId: order.id } })).toBe(ledgerCount);

    const soldOut = await app.inject({
      method: 'POST',
      url: '/checkout',
      headers: { authorization: `Bearer ${buyerToken}` },
      payload: { sellerId: seller.id, lines: [{ productId, quantity: 1 }], handover: 'SELLER_ARRANGED', idempotencyKey: 'checkout-2' },
    });
    expect(soldOut.statusCode).toBe(409);

    const report = await app.inject({
      method: 'GET',
      url: '/admin/reconciliation',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(report.json().ok).toBe(true);

    const visitor = await app.inject({ method: 'GET', url: '/admin/commercial-settings', headers: { authorization: `Bearer ${buyerToken}` } });
    expect(visitor.statusCode).toBe(403);
  });

  it('creates an account and saves profile, settings, and a new password', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'member@example.com', password: 'Correct-horse-1', displayName: 'New Member', phone: '08031112222', intent: 'BUY' },
    });
    expect(created.statusCode).toBe(201);
    const token = created.json().accessToken as string;
    const headers = { authorization: `Bearer ${token}` };
    const profile = await app.inject({
      method: 'PATCH',
      url: '/account',
      headers,
      payload: { displayName: 'Updated Member', phone: '08039998888', smsNotifications: true },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().user.displayName).toBe('Updated Member');
    expect(profile.json().user.phone).toBe('08039998888');
    expect(profile.json().user.smsNotifications).toBe(true);
    const seller = await app.inject({
      method: 'POST',
      url: '/seller/profile',
      headers,
      payload: { type: 'INDIVIDUAL', storeName: 'Member Closet', state: 'Lagos', city: 'Ikeja' },
    });
    expect(seller.statusCode).toBe(201);
    const edited = await app.inject({
      method: 'PATCH',
      url: '/seller/profile',
      headers,
      payload: { bio: 'Lagos wardrobe', city: 'Yaba' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().user.seller.bio).toBe('Lagos wardrobe');
    expect(edited.json().user.seller.city).toBe('Yaba');
    const rejected = await app.inject({
      method: 'POST',
      url: '/auth/password',
      headers,
      payload: { currentPassword: 'wrong-password', newPassword: 'Correct-horse-2' },
    });
    expect(rejected.statusCode).toBe(401);
    const changed = await app.inject({
      method: 'POST',
      url: '/auth/password',
      headers,
      payload: { currentPassword: 'Correct-horse-1', newPassword: 'Correct-horse-2' },
    });
    expect(changed.statusCode).toBe(200);
    const relog = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'member@example.com', password: 'Correct-horse-2' },
    });
    expect(relog.statusCode).toBe(200);
  });
});
