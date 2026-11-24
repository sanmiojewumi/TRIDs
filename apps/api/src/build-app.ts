import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { Prisma, type PrismaClient, type Product, type User } from '@prisma/client';
import {
  can,
  COMMERCIAL_KEYS,
  formatNaira,
  isNigerianState,
  isStaffRole,
  isValidEmail,
  nairaToKobo,
  NIGERIAN_STATES,
  passwordIssues,
  type Permission,
} from '@ninted/domain';
import { createTotp, hashPassword, newMfaSecret, readAccessSubject, signAccess, verifyPassword, verifyTotp } from './auth.js';
import { activeCoupon, createOrder, deliveryOptions, expireUnpaidOrders, loadRules, priceSelection, releaseReservation } from './commerce.js';
import { ContractCourier } from './couriers.js';
import type { Env } from './env.js';
import type { PaymentGateway } from './gateways.js';
import { providerRefundSettled } from './gateways.js';
import { HttpError } from './http.js';
import { notifyUser } from './notify.js';
import { decryptString, encryptString, hashPin, pinsMatch, randomPin, randomReference, sha256 } from './secrets.js';
import { reverseOrderLedger, sellerPayableBalance, settleSuccessfulCharge } from './settlement.js';
import { contentTypeFor, type ObjectStorage } from './storage.js';
import { paystackSignature, safeEqualText, type FeeSnapshot } from '@ninted/domain';

export interface AppDeps {
  prisma: PrismaClient;
  env: Env;
  gateway: PaymentGateway | null;
  storage: ObjectStorage;
}

const userInclude = { roles: true, seller: true } satisfies Prisma.UserInclude;
type SessionUser = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function shopName(displayName: string) {
  const name = displayName.trim() || 'Member';
  return /shop$/i.test(name) ? name : `${name}'s shop`;
}

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues.map((issue) => issue.message).join(' '));
  return result.data;
}

export function serializeProduct(product: Product & { images?: { url: string; sortOrder: number }[]; seller?: { storeName: string; type: string; verification: string; ratingAvg: number; ratingCount: number; city: string | null; state: string | null }; category?: { slug: string; name: string } }) {
  return {
    id: product.id,
    title: product.title,
    description: product.description,
    brand: product.brand,
    size: product.size,
    colour: product.colour,
    condition: product.condition,
    priceKobo: product.priceKobo,
    price: formatNaira(product.priceKobo),
    quantity: product.quantity,
    available: product.quantity - product.reserved,
    status: product.status,
    state: product.state,
    city: product.city,
    deliveryEligible: product.deliveryEligible,
    weightGrams: product.weightGrams,
    offersEnabled: product.offersEnabled,
    viewCount: product.viewCount,
    favoriteCount: product.favoriteCount,
    featured: Boolean(product.featuredUntil && product.featuredUntil > new Date()),
    moderationNote: product.moderationNote,
    createdAt: product.createdAt,
    images: product.images ?? [],
    category: product.category ?? null,
    seller: product.seller
      ? {
          id: product.sellerId,
          storeName: product.seller.storeName,
          type: product.seller.type,
          verification: product.seller.verification,
          ratingAvg: product.seller.ratingAvg,
          ratingCount: product.seller.ratingCount,
          city: product.seller.city,
          state: product.seller.state,
        }
      : { id: product.sellerId },
  };
}

function publicUser(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    emailNotifications: user.emailNotifications,
    smsNotifications: user.smsNotifications,
    pushNotifications: user.pushNotifications,
    promotionNotifications: user.promotionNotifications,
    roles: user.roles.map((role) => role.role),
    seller: user.seller
      ? {
          type: user.seller.type,
          storeName: user.seller.storeName,
          bio: user.seller.bio,
          city: user.seller.city,
          state: user.seller.state,
          verification: user.seller.verification,
          businessName: user.seller.businessName,
          ratingAvg: user.seller.ratingAvg,
          ratingCount: user.seller.ratingCount,
        }
      : null,
  };
}

export async function buildApp(deps: AppDeps) {
  const { prisma, env, gateway, storage } = deps;
  const app = Fastify({ logger: false, bodyLimit: 1_000_000, trustProxy: true });
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    try {
      const text = typeof body === 'string' ? body : body.toString();
      request.rawBody = text;
      done(null, text ? JSON.parse(text) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, _body, done) => {
    done(null, {});
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.webOrigin, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 5_000_000, files: 6 } });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.status).send({ message: error.message, code: error.code });
    }
    const err = error as { statusCode?: number; message?: string };
    const status = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (status >= 500) request.log.error(error);
    return reply.code(status).send({ message: status >= 500 ? 'Something went wrong' : err.message || 'Request failed' });
  });

  function cookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
    const secure = env.nodeEnv === 'production';
    reply.setCookie('n9_access', accessToken, { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: 60 * 15 });
    reply.setCookie('n9_refresh', refreshToken, { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: 60 * 60 * 24 * 30 });
  }

  async function issue(reply: FastifyReply, user: SessionUser) {
    const accessToken = signAccess(user.id, env.accessTokenSecret);
    const refreshToken = randomReference('refresh');
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    cookies(reply, accessToken, refreshToken);
    return { user: publicUser(user), accessToken, refreshToken };
  }

  async function requireUser(request: FastifyRequest, options?: { permission?: Permission; seller?: boolean }) {
    const header = request.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    const cookieToken = request.cookies.n9_access;
    if (!bearer && cookieToken && !['GET', 'HEAD'].includes(request.method) && request.headers['x-ninted-client'] !== 'web') {
      throw new HttpError(403, 'Refresh the page and try again', 'CSRF');
    }
    const subject = readAccessSubject(bearer || cookieToken || '', env.accessTokenSecret);
    if (!subject) throw new HttpError(401, 'Sign in to continue');
    const user = await prisma.user.findUnique({ where: { id: subject }, include: userInclude });
    if (!user || user.status !== 'ACTIVE') throw new HttpError(403, 'This account cannot sign in');
    if (options?.permission) {
      if (!can(user.roles.map((role) => role.role), options.permission)) {
        throw new HttpError(403, 'You do not have permission for that');
      }
      if (!user.mfaEnabled) throw new HttpError(403, 'Turn on multi-factor authentication before using admin tools', 'MFA_REQUIRED');
    }
    if (options?.seller && !user.seller) throw new HttpError(403, 'Open a seller profile first');
    return user;
  }

  async function audit(actorId: string | null, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonValue, request: FastifyRequest) {
    await prisma.auditLog.create({
      data: { actorId, action, entityType, entityId, metadata, ip: request.ip },
    });
  }

  async function listingBlocked(title: string, description: string) {
    const terms = await prisma.prohibitedTerm.findMany();
    const haystack = `${title}\n${description}`;
    return terms.find((term) => new RegExp(`\\b${term.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack));
  }

  app.get('/health', async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { ok: true, service: 'ninted9ja-api' };
  });

  app.get('/config/public', async () => ({
    brand: 'Ninted 9ja',
    paymentConfigured: Boolean(gateway),
    paymentProvider: env.paymentProvider,
    phase2: env.phase2,
    transfersEnabled: env.transfersEnabled,
    settlementNote:
      'Successful payments are verified with the payment provider. Seller earnings stay on the Ninted ledger until finance records a payout. This ledger hold is not provider escrow or a split payment.',
  }));

  app.get('/states', async () => ({ states: NIGERIAN_STATES }));
  app.get('/categories', async () => {
    const categories = await prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], include: { children: true } });
    return { categories };
  });
  app.get('/policies', async () => ({ policies: await prisma.platformPolicy.findMany({ orderBy: { title: 'asc' } }) }));
  app.get('/policies/:slug', async (request) => {
    const policy = await prisma.platformPolicy.findUnique({ where: { slug: (request.params as { slug: string }).slug } });
    if (!policy) throw new HttpError(404, 'Policy not found');
    return { policy };
  });

  app.get('/home', async () => {
    const include = { images: { orderBy: { sortOrder: 'asc' as const } }, seller: true, category: true };
    const [featured, arrivals, trending, categories, sellers, promotions] = await Promise.all([
      prisma.product.findMany({ where: { status: 'ACTIVE', featuredUntil: { gt: new Date() } }, include, take: 8, orderBy: { featuredUntil: 'desc' } }),
      prisma.product.findMany({ where: { status: 'ACTIVE' }, include, take: 8, orderBy: { createdAt: 'desc' } }),
      prisma.product.findMany({ where: { status: 'ACTIVE' }, include, take: 8, orderBy: { viewCount: 'desc' } }),
      prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: 'asc' }, include: { children: true } }),
      prisma.sellerProfile.findMany({ where: { verification: 'VERIFIED' }, take: 6, orderBy: { ratingCount: 'desc' }, include: { user: true } }),
      prisma.promotion.findMany({ where: { active: true, startsAt: { lte: new Date() }, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }, take: 4 }),
    ]);
    return {
      featured: featured.map(serializeProduct),
      arrivals: arrivals.map(serializeProduct),
      trending: trending.map(serializeProduct),
      categories,
      sellers: sellers.map((seller) => ({
        id: seller.userId,
        storeName: seller.storeName,
        city: seller.city,
        state: seller.state,
        type: seller.type,
        ratingAvg: seller.ratingAvg,
        ratingCount: seller.ratingCount,
      })),
      promotions,
    };
  });

  app.get('/products', async (request) => {
    const query = request.query as Record<string, string | undefined>;
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
        { brand: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.category) where.category = { slug: query.category };
    if (query.brand) where.brand = { equals: query.brand, mode: 'insensitive' };
    if (query.size) where.size = query.size;
    if (query.condition) where.condition = query.condition as Product['condition'];
    if (query.state) where.state = query.state;
    if (query.colour) where.colour = { equals: query.colour, mode: 'insensitive' };
    if (query.min || query.max) {
      where.priceKobo = {
        ...(query.min ? { gte: nairaToKobo(Number(query.min)) } : {}),
        ...(query.max ? { lte: nairaToKobo(Number(query.max)) } : {}),
      };
    }
    const orderBy =
      query.sort === 'price_asc' ? { priceKobo: 'asc' as const } : query.sort === 'price_desc' ? { priceKobo: 'desc' as const } : { createdAt: 'desc' as const };
    const products = await prisma.product.findMany({
      where,
      include: { images: { orderBy: { sortOrder: 'asc' } }, seller: true, category: true },
      orderBy,
      take: 48,
    });
    return { products: products.map(serializeProduct) };
  });

  app.get('/products/:id', async (request) => {
    const id = (request.params as { id: string }).id;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { images: { orderBy: { sortOrder: 'asc' } }, seller: { include: { user: true } }, category: true },
    });
    if (!product || product.status === 'REMOVED') throw new HttpError(404, 'Listing not found');
    await prisma.product.update({ where: { id }, data: { viewCount: { increment: 1 } } });
    const reviews = await prisma.review.findMany({ where: { sellerId: product.sellerId }, take: 8, orderBy: { createdAt: 'desc' }, include: { reviewer: true } });
    return {
      product: serializeProduct(product),
      reviews: reviews.map((review) => ({
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
        reviewer: review.reviewer.displayName,
      })),
    };
  });

  app.get('/sellers/:id', async (request) => {
    const seller = await prisma.sellerProfile.findUnique({
      where: { userId: (request.params as { id: string }).id },
      include: { products: { where: { status: 'ACTIVE' }, include: { images: true, category: true, seller: true }, take: 24 } },
    });
    if (!seller) throw new HttpError(404, 'Seller not found');
    return {
      seller: {
        id: seller.userId,
        storeName: seller.storeName,
        bio: seller.bio,
        type: seller.type,
        city: seller.city,
        state: seller.state,
        verification: seller.verification,
        ratingAvg: seller.ratingAvg,
        ratingCount: seller.ratingCount,
        itemCount: seller.products.length,
        openedAt: seller.createdAt,
      },
      products: seller.products.map(serializeProduct),
    };
  });

  app.post('/auth/register', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as {
      email?: string;
      password?: string;
      displayName?: string;
      phone?: string;
      intent?: string;
      storeName?: string;
      city?: string;
      state?: string;
    };
    const email = (body.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) throw new HttpError(400, 'Enter a valid email');
    const issues = passwordIssues(body.password || '');
    if (issues.length) throw new HttpError(400, issues.join('. '));
    if (!body.displayName || body.displayName.trim().length < 2) throw new HttpError(400, 'Enter your name');
    if (body.state && !isNigerianState(body.state)) throw new HttpError(400, 'Choose a Nigerian state');
    const passwordHash = await hashPassword(body.password || '');
    try {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: body.displayName.trim(),
          phone: body.phone?.trim() || null,
          seller: {
            create: {
              type: body.intent === 'SELL_BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL',
              storeName: body.storeName?.trim() || shopName(body.displayName.trim()),
              city: body.city?.trim() || null,
              state: body.state?.trim() || null,
              businessName: body.intent === 'SELL_BUSINESS' ? body.storeName?.trim() || null : null,
            },
          },
        },
        include: userInclude,
      });
      await notifyUser(prisma, env, user, {
        title: 'Welcome to Ninted 9ja',
        body: 'Your account is ready. You can buy now, and sell once your profile is set up.',
        linkUrl: '/',
      });
      return reply.code(201).send(await issue(reply, user));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new HttpError(409, 'An account with that email already exists');
      }
      throw error;
    }
  });

  app.post('/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as { email?: string; password?: string; otp?: string };
    const user = await prisma.user.findUnique({ where: { email: (body.email || '').trim().toLowerCase() }, include: userInclude });
    if (!user || !(await verifyPassword(body.password || '', user.passwordHash))) {
      throw new HttpError(401, 'Email or password is incorrect');
    }
    if (user.status !== 'ACTIVE') throw new HttpError(403, 'This account is not active');
    if (user.mfaEnabled) {
      if (!body.otp) throw new HttpError(401, 'Enter the 6-digit authentication code', 'MFA_REQUIRED');
      const secret = user.mfaSecretEnc ? decryptString(user.mfaSecretEnc, env.encryptionKey) : '';
      if (!verifyTotp(user.email, secret, body.otp)) throw new HttpError(401, 'That authentication code is not valid');
    }
    return issue(reply, user);
  });

  app.post('/auth/refresh', async (request, reply) => {
    const token = (request.body as { refreshToken?: string }).refreshToken || request.cookies.n9_refresh;
    if (!token) throw new HttpError(401, 'Sign in again');
    const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) throw new HttpError(401, 'Sign in again');
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: stored.userId }, include: userInclude });
    return issue(reply, user);
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies.n9_refresh || (request.body as { refreshToken?: string }).refreshToken;
    if (token) {
      await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(token), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    reply.clearCookie('n9_access', { path: '/' });
    reply.clearCookie('n9_refresh', { path: '/' });
    return { ok: true };
  });

  async function ensureShop(user: SessionUser): Promise<SessionUser> {
    if (user.seller) return user;
    try {
      await prisma.sellerProfile.create({
        data: { userId: user.id, type: 'INDIVIDUAL', storeName: shopName(user.displayName) },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
    return prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
  }

  app.get('/auth/me', async (request) => {
    try {
      return { user: publicUser(await ensureShop(await requireUser(request))) };
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) return { user: null };
      throw error;
    }
  });

  app.post('/auth/mfa/setup', async (request) => {
    const user = await requireUser(request);
    const secret = newMfaSecret();
    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecretEnc: encryptString(secret.base32, env.encryptionKey), mfaEnabled: false },
    });
    return { secret: secret.base32, otpauth: createTotp(user.email, secret).toString() };
  });

  app.post('/auth/mfa/confirm', async (request) => {
    const user = await requireUser(request);
    const otp = (request.body as { otp?: string }).otp || '';
    if (!user.mfaSecretEnc) throw new HttpError(400, 'Start multi-factor setup first');
    const secret = decryptString(user.mfaSecretEnc, env.encryptionKey);
    if (!verifyTotp(user.email, secret, otp)) throw new HttpError(400, 'That code does not match');
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await audit(user.id, 'mfa.enabled', 'User', user.id, {}, request);
    return { mfaEnabled: true };
  });

  app.patch('/account', async (request) => {
    const user = await requireUser(request);
    const body = request.body as {
      displayName?: string;
      phone?: string | null;
      emailNotifications?: boolean;
      smsNotifications?: boolean;
      pushNotifications?: boolean;
      promotionNotifications?: boolean;
    };
    const data: Prisma.UserUpdateInput = {};
    if (body.displayName !== undefined) {
      const name = body.displayName.trim();
      if (name.length < 2) throw new HttpError(400, 'Enter your name');
      data.displayName = name;
    }
    if (body.phone !== undefined) {
      const phone = (body.phone || '').trim();
      if (phone && !/^\+?[0-9]{10,15}$/.test(phone)) throw new HttpError(400, 'Enter a valid phone number');
      data.phone = phone || null;
    }
    for (const key of ['emailNotifications', 'smsNotifications', 'pushNotifications', 'promotionNotifications'] as const) {
      if (typeof body[key] === 'boolean') data[key] = body[key];
    }
    if (!Object.keys(data).length) throw new HttpError(400, 'Nothing to update');
    await prisma.user.update({ where: { id: user.id }, data });
    await audit(user.id, 'account.updated', 'User', user.id, { fields: Object.keys(data) }, request);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
    return { user: publicUser(fresh) };
  });

  app.post('/auth/password', async (request) => {
    const user = await requireUser(request);
    const body = request.body as { currentPassword?: string; newPassword?: string };
    if (!(await verifyPassword(body.currentPassword || '', user.passwordHash))) {
      throw new HttpError(401, 'Current password is incorrect');
    }
    const issues = passwordIssues(body.newPassword || '');
    if (issues.length) throw new HttpError(400, issues.join('. '));
    if (body.newPassword === body.currentPassword) throw new HttpError(400, 'Choose a different password');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.newPassword || '') } });
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(user.id, 'password.changed', 'User', user.id, {}, request);
    await notifyUser(prisma, env, user, {
      category: 'security',
      title: 'Password changed',
      body: 'Your Ninted 9ja password was changed. If this was not you, reset it and contact support.',
      linkUrl: '/account/settings',
    });
    return { ok: true };
  });

  app.post('/products', async (request, reply) => {
    const user = await requireUser(request, { seller: true });
    const body = request.body as {
      title?: string;
      description?: string;
      categoryId?: string;
      brand?: string;
      size?: string;
      colour?: string;
      condition?: Product['condition'];
      priceNaira?: number;
      quantity?: number;
      state?: string;
      city?: string;
      weightGrams?: number;
      offersEnabled?: boolean;
      publish?: boolean;
    };
    if (!body.title || body.title.trim().length < 3) throw new HttpError(400, 'Add a title');
    if (!body.description || body.description.trim().length < 10) throw new HttpError(400, 'Describe the item');
    if (!body.categoryId) throw new HttpError(400, 'Choose a category');
    if (!body.state || !isNigerianState(body.state)) throw new HttpError(400, 'Choose a Nigerian state');
    if (!body.city) throw new HttpError(400, 'Add a city');
    const priceKobo = nairaToKobo(Number(body.priceNaira));
    const blocked = await listingBlocked(body.title, body.description);
    let status: Product['status'] = body.publish === false ? 'DRAFT' : user.seller!.verification === 'VERIFIED' ? 'ACTIVE' : 'PENDING_REVIEW';
    if (blocked) status = 'PENDING_REVIEW';
    const product = await prisma.product.create({
      data: {
        sellerId: user.id,
        title: body.title.trim(),
        description: body.description.trim(),
        categoryId: body.categoryId,
        brand: body.brand?.trim() || null,
        size: body.size?.trim() || null,
        colour: body.colour?.trim() || null,
        condition: body.condition || 'GOOD',
        priceKobo,
        quantity: Math.max(1, Math.min(100, body.quantity || 1)),
        state: body.state,
        city: body.city.trim(),
        weightGrams: body.weightGrams,
        offersEnabled: body.offersEnabled !== false,
        status,
        moderationNote: blocked ? `Held for review because it matched “${blocked.term}”.` : null,
      },
      include: { images: true, seller: true, category: true },
    });
    return reply.code(201).send({ product: serializeProduct(product), needsReview: status === 'PENDING_REVIEW' });
  });

  app.post('/seller/profile', async (request, reply) => {
    const user = await ensureShop(await requireUser(request));
    const body = request.body as { type?: 'INDIVIDUAL' | 'BUSINESS'; storeName?: string; city?: string; state?: string };
    if (user.seller && (body.storeName || body.city || body.state || body.type)) {
      if (body.state && !isNigerianState(body.state)) throw new HttpError(400, 'Choose a Nigerian state');
      await prisma.sellerProfile.update({
        where: { userId: user.id },
        data: {
          ...(body.type ? { type: body.type === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL' } : {}),
          ...(body.storeName?.trim() ? { storeName: body.storeName.trim() } : {}),
          ...(body.city !== undefined ? { city: body.city } : {}),
          ...(body.state ? { state: body.state } : {}),
          ...(body.type === 'BUSINESS' && body.storeName ? { businessName: body.storeName.trim() } : {}),
        },
      });
      const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
      return { user: publicUser(fresh) };
    }
    if (user.seller) return { user: publicUser(user) };
    if (!body.storeName || !body.state || !isNigerianState(body.state)) throw new HttpError(400, 'Add a store name and a Nigerian state');
    await prisma.sellerProfile.create({
      data: {
        userId: user.id,
        type: body.type === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL',
        storeName: body.storeName.trim(),
        city: body.city,
        state: body.state,
        businessName: body.type === 'BUSINESS' ? body.storeName.trim() : null,
      },
    });
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
    return reply.code(201).send({ user: publicUser(fresh) });
  });

  app.patch('/seller/profile', async (request) => {
    const user = await requireUser(request, { seller: true });
    const body = request.body as { storeName?: string; bio?: string; city?: string; state?: string };
    if (body.state && !isNigerianState(body.state)) throw new HttpError(400, 'Choose a Nigerian state');
    const storeName = body.storeName?.trim();
    if (body.storeName !== undefined && (!storeName || storeName.length < 2)) throw new HttpError(400, 'Enter a store name');
    const bio = body.bio?.trim();
    if (bio && bio.length > 500) throw new HttpError(400, 'Keep the bio under 500 characters');
    await prisma.sellerProfile.update({
      where: { userId: user.id },
      data: {
        ...(storeName ? { storeName } : {}),
        ...(body.bio !== undefined ? { bio: bio || '' } : {}),
        ...(body.city !== undefined ? { city: body.city.trim() || null } : {}),
        ...(body.state ? { state: body.state } : {}),
      },
    });
    await audit(user.id, 'seller.profile.updated', 'SellerProfile', user.id, {}, request);
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: userInclude });
    return { user: publicUser(fresh) };
  });

  app.get('/seller/products', async (request) => {
    const user = await requireUser(request, { seller: true });
    const products = await prisma.product.findMany({
      where: { sellerId: user.id, status: { not: 'REMOVED' } },
      include: { images: true, category: true, seller: true },
      orderBy: { createdAt: 'desc' },
    });
    return { products: products.map(serializeProduct) };
  });

  app.patch('/products/:id', async (request) => {
    const user = await requireUser(request, { seller: true });
    const id = (request.params as { id: string }).id;
    const existing = await prisma.product.findFirst({ where: { id, sellerId: user.id } });
    if (!existing || existing.status === 'REMOVED') throw new HttpError(404, 'Listing not found');
    const body = request.body as Partial<{ title: string; description: string; priceNaira: number; quantity: number; statusNote: string }>;
    const title = body.title?.trim() || existing.title;
    const description = body.description?.trim() || existing.description;
    const blocked = await listingBlocked(title, description);
    const product = await prisma.product.update({
      where: { id },
      data: {
        title,
        description,
        ...(body.priceNaira !== undefined ? { priceKobo: nairaToKobo(Number(body.priceNaira)) } : {}),
        ...(body.quantity !== undefined ? { quantity: Math.max(0, body.quantity) } : {}),
        status: blocked ? 'PENDING_REVIEW' : existing.status === 'ACTIVE' && user.seller!.verification !== 'VERIFIED' ? 'PENDING_REVIEW' : existing.status,
        moderationNote: blocked ? `Held for review because it matched “${blocked.term}”.` : existing.moderationNote,
      },
      include: { images: true, seller: true, category: true },
    });
    return { product: serializeProduct(product) };
  });

  app.post('/products/:id/images', async (request) => {
    const user = await requireUser(request, { seller: true });
    const id = (request.params as { id: string }).id;
    const product = await prisma.product.findFirst({ where: { id, sellerId: user.id }, include: { images: true } });
    if (!product) throw new HttpError(404, 'Listing not found');
    if (product.images.length >= 6) throw new HttpError(400, 'A listing can have 6 images');
    const files = [];
    for await (const part of request.parts()) {
      if (part.type !== 'file') continue;
      const contentType = contentTypeFor(part.filename, part.mimetype);
      if (!contentType) throw new HttpError(400, 'Upload a JPEG, PNG, or WebP image');
      const stored = await storage.putImage({ bytes: await part.toBuffer(), contentType, visibility: 'public' });
      files.push(stored.url);
    }
    if (!files.length) throw new HttpError(400, 'Choose an image');
    await prisma.productImage.createMany({
      data: files.map((url, index) => ({ productId: id, url, sortOrder: product.images.length + index })),
    });
    return { urls: files };
  });

  app.post('/products/:id/pause', async (request) => {
    const user = await requireUser(request, { seller: true });
    const id = (request.params as { id: string }).id;
    await prisma.product.updateMany({ where: { id, sellerId: user.id, status: 'ACTIVE' }, data: { status: 'PAUSED' } });
    return { ok: true };
  });

  app.post('/products/:id/relist', async (request) => {
    const user = await requireUser(request, { seller: true });
    const id = (request.params as { id: string }).id;
    const product = await prisma.product.findFirst({ where: { id, sellerId: user.id } });
    if (!product) throw new HttpError(404, 'Listing not found');
    if (product.quantity - product.reserved < 1) throw new HttpError(409, 'Increase the quantity before relisting');
    const blocked = await listingBlocked(product.title, product.description);
    const status = blocked || user.seller!.verification !== 'VERIFIED' ? 'PENDING_REVIEW' : 'ACTIVE';
    await prisma.product.update({ where: { id }, data: { status, moderationNote: blocked ? `Held for review because it matched “${blocked.term}”.` : null } });
    return { status };
  });

  app.delete('/products/:id', async (request) => {
    const user = await requireUser(request, { seller: true });
    const id = (request.params as { id: string }).id;
    await prisma.product.updateMany({ where: { id, sellerId: user.id }, data: { status: 'REMOVED' } });
    await prisma.cartItem.deleteMany({ where: { productId: id } });
    return { ok: true };
  });

  app.get('/cart', async (request) => {
    const user = await requireUser(request);
    const items = await prisma.cartItem.findMany({
      where: { userId: user.id },
      include: { product: { include: { images: true, seller: true, category: true } } },
    });
    return {
      items: items.map((item) => ({ quantity: item.quantity, product: serializeProduct(item.product) })),
    };
  });

  app.post('/cart', async (request) => {
    const user = await requireUser(request);
    const body = request.body as { productId?: string; quantity?: number };
    const product = await prisma.product.findFirst({ where: { id: body.productId, status: 'ACTIVE' } });
    if (!product) throw new HttpError(404, 'Listing not found');
    if (product.sellerId === user.id) throw new HttpError(400, 'You cannot buy your own listing');
    await prisma.cartItem.upsert({
      where: { userId_productId: { userId: user.id, productId: product.id } },
      create: { userId: user.id, productId: product.id, quantity: body.quantity || 1 },
      update: { quantity: body.quantity || 1 },
    });
    return { ok: true };
  });

  app.delete('/cart/:productId', async (request) => {
    const user = await requireUser(request);
    await prisma.cartItem.deleteMany({ where: { userId: user.id, productId: (request.params as { productId: string }).productId } });
    return { ok: true };
  });

  app.get('/favorites', async (request) => {
    const user = await requireUser(request);
    const rows = await prisma.favorite.findMany({
      where: { userId: user.id },
      include: { product: { include: { images: true, seller: true, category: true } } },
    });
    return { products: rows.map((row) => serializeProduct(row.product)) };
  });

  app.post('/favorites/:productId', async (request) => {
    const user = await requireUser(request);
    const productId = (request.params as { productId: string }).productId;
    const existing = await prisma.favorite.findUnique({ where: { userId_productId: { userId: user.id, productId } } });
    if (!existing) {
      await prisma.favorite.create({ data: { userId: user.id, productId } });
      await prisma.product.update({ where: { id: productId }, data: { favoriteCount: { increment: 1 } } });
    }
    return { ok: true };
  });

  app.delete('/favorites/:productId', async (request) => {
    const user = await requireUser(request);
    const productId = (request.params as { productId: string }).productId;
    const removed = await prisma.favorite.deleteMany({ where: { userId: user.id, productId } });
    if (removed.count) await prisma.product.update({ where: { id: productId }, data: { favoriteCount: { decrement: 1 } } });
    return { ok: true };
  });

  app.get('/addresses', async (request) => ({ addresses: await prisma.address.findMany({ where: { userId: (await requireUser(request)).id } }) }));

  app.post('/addresses', async (request, reply) => {
    const user = await requireUser(request);
    const body = request.body as { label?: string; recipient?: string; phone?: string; line1?: string; city?: string; state?: string };
    if (!body.recipient || !body.phone || !body.line1 || !body.city || !body.state || !isNigerianState(body.state)) {
      throw new HttpError(400, 'Add the recipient, phone, street, city and state');
    }
    const address = await prisma.address.create({
      data: { userId: user.id, label: body.label || 'Home', recipient: body.recipient, phone: body.phone, line1: body.line1, city: body.city, state: body.state, isDefault: true },
    });
    return reply.code(201).send({ address });
  });

  app.post('/offers', async (request, reply) => {
    const user = await requireUser(request);
    const body = request.body as { productId?: string; amountNaira?: number };
    const product = await prisma.product.findFirst({ where: { id: body.productId, status: 'ACTIVE' } });
    if (!product || !product.offersEnabled) throw new HttpError(400, 'This seller is not taking offers');
    if (product.sellerId === user.id) throw new HttpError(400, 'You cannot offer on your own listing');
    const amountKobo = nairaToKobo(Number(body.amountNaira));
    if (amountKobo >= product.priceKobo) throw new HttpError(400, 'An offer should be below the listed price');
    const offer = await prisma.offer.create({
      data: { productId: product.id, buyerId: user.id, amountKobo, expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) },
    });
    const seller = await prisma.user.findUniqueOrThrow({ where: { id: product.sellerId } });
    await notifyUser(prisma, env, seller, {
      title: 'New offer',
      body: `${user.displayName} offered ${formatNaira(amountKobo)} for ${product.title}`,
      linkUrl: '/sell',
    });
    return reply.code(201).send({ offer });
  });

  app.post('/offers/:id/respond', async (request) => {
    const user = await requireUser(request, { seller: true });
    const offer = await prisma.offer.findUnique({ where: { id: (request.params as { id: string }).id }, include: { product: true, buyer: true } });
    if (!offer || offer.product.sellerId !== user.id) throw new HttpError(404, 'Offer not found');
    const action = (request.body as { action?: string; counterNaira?: number }).action;
    if (action === 'accept') {
      await prisma.offer.update({ where: { id: offer.id }, data: { status: 'ACCEPTED', expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) } });
    } else if (action === 'decline') {
      await prisma.offer.update({ where: { id: offer.id }, data: { status: 'DECLINED' } });
    } else if (action === 'counter') {
      const counterKobo = nairaToKobo(Number((request.body as { counterNaira?: number }).counterNaira));
      await prisma.offer.update({ where: { id: offer.id }, data: { status: 'COUNTERED', counterKobo } });
    } else {
      throw new HttpError(400, 'Choose accept, decline or counter');
    }
    await notifyUser(prisma, env, offer.buyer, {
      title: 'Offer updated',
      body: `${user.seller!.storeName} responded to your offer on ${offer.product.title}`,
      linkUrl: `/product/${offer.productId}`,
    });
    return { ok: true };
  });

  app.post('/checkout/quotes', async (request) => {
    const user = await requireUser(request);
    const body = request.body as { sellerId?: string; productIds?: string[]; state?: string };
    const products = await prisma.product.findMany({ where: { id: { in: body.productIds || [] }, sellerId: body.sellerId, status: 'ACTIVE' } });
    if (!products.length) throw new HttpError(400, 'Choose items from one seller');
    const rules = await loadRules(prisma);
    return deliveryOptions({
      prisma,
      env,
      fromState: products[0]!.state,
      toState: body.state || products[0]!.state,
      weightGrams: products.every((product) => product.weightGrams) ? products.reduce((sum, product) => sum + (product.weightGrams || 0), 0) : null,
      rules,
      at: new Date(),
      sellerId: products[0]!.sellerId,
    });
  });

  app.post('/checkout/preview', async (request) => {
    const user = await requireUser(request);
    const body = request.body as { sellerId: string; lines: { productId: string; quantity: number; offerId?: string }[]; handover: string; addressId?: string; couponCode?: string };
    const priced = await priceSelection({ prisma, env, buyerId: user.id, ...body });
    return { snapshot: priced.snapshot, option: priced.option, lines: priced.pricedLines };
  });

  app.post('/checkout', async (request, reply) => {
    const user = await requireUser(request);
    const body = request.body as {
      sellerId: string;
      lines: { productId: string; quantity: number; offerId?: string }[];
      handover: string;
      addressId?: string;
      couponCode?: string;
      idempotencyKey?: string;
      buyerNote?: string;
    };
    const order = await createOrder({ prisma, env, buyerId: user.id, ...body });
    return reply.code(201).send({ order });
  });

  app.post('/payments/initiate', async (request) => {
    const user = await requireUser(request);
    if (!gateway) throw new HttpError(503, 'The payment provider is not configured, so no charge was created', 'PAYMENT_UNCONFIGURED');
    const orderId = (request.body as { orderId?: string }).orderId;
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order || order.buyerId !== user.id) throw new HttpError(404, 'Order not found');
    if (order.status !== 'PENDING_PAYMENT') throw new HttpError(409, 'This order is not waiting for payment');
    if (order.buyerTotalKobo < 100) throw new HttpError(400, 'Paystack and Flutterwave require a charge of at least ₦1');
    const reference = randomReference('pay');
    const payment = await prisma.payment.create({
      data: {
        purpose: 'ORDER',
        orderId: order.id,
        userId: user.id,
        provider: gateway.provider,
        reference,
        amountKobo: order.buyerTotalKobo,
        status: 'INITIATED',
      },
    });
    try {
      const started = await gateway.initialize({
        email: user.email,
        amountKobo: order.buyerTotalKobo,
        reference,
        callbackUrl: `${env.publicWebUrl}/payments/callback`,
        metadata: { orderId: order.id, paymentId: payment.id },
      });
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'PENDING', authorizationUrl: started.authorizationUrl, reference: started.reference } });
      return { authorizationUrl: started.authorizationUrl, reference: started.reference, amountKobo: order.buyerTotalKobo };
    } catch (error) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: error instanceof Error ? error.message : 'Provider error' },
      });
      throw new HttpError(502, error instanceof Error ? error.message : 'The payment provider rejected the charge');
    }
  });

  app.post('/payments/verify', async (request) => {
    const user = await requireUser(request);
    if (!gateway) throw new HttpError(503, 'The payment provider is not configured', 'PAYMENT_UNCONFIGURED');
    const reference = (request.body as { reference?: string }).reference || '';
    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (!payment || payment.userId !== user.id) throw new HttpError(404, 'Payment not found');
    const charge = await gateway.verify(reference);
    if (!charge) return { verified: false, status: payment.status };
    const result = await settleSuccessfulCharge(prisma, env, { reference, charge });
    const fresh = await prisma.payment.findUnique({ where: { reference } });
    return { verified: fresh?.status === 'SUCCESS', status: fresh?.status, result };
  });

  app.post('/payments/webhooks/paystack', async (request, reply) => {
    if (!env.paystackSecret || !gateway || gateway.provider !== 'PAYSTACK') {
      throw new HttpError(503, 'Paystack webhooks are not configured');
    }
    const signature = String(request.headers['x-paystack-signature'] || '');
    if (!request.rawBody || !safeEqualText(signature, paystackSignature(request.rawBody, env.paystackSecret))) {
      throw new HttpError(401, 'Invalid Paystack signature');
    }
    const event = request.body as { event?: string; data?: { id?: number; reference?: string } };
    const reference = event.data?.reference;
    if (event.event === 'charge.success' && reference) {
      const charge = await gateway.verify(reference);
      if (charge) await settleSuccessfulCharge(prisma, env, { reference, charge });
    }
    await prisma.webhookEvent.create({
      data: { provider: 'PAYSTACK', eventKey: `${event.event}:${event.data?.id || reference || randomReference('evt')}`, payload: event as Prisma.InputJsonValue },
    }).catch((error: unknown) => {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    });
    return reply.code(200).send({ received: true });
  });

  app.post('/payments/webhooks/flutterwave', async (request, reply) => {
    if (!env.flutterwaveWebhookHash || !gateway || gateway.provider !== 'FLUTTERWAVE') {
      throw new HttpError(503, 'Flutterwave webhooks are not configured');
    }
    const signature = String(request.headers['verif-hash'] || '');
    if (!safeEqualText(signature, env.flutterwaveWebhookHash)) throw new HttpError(401, 'Invalid Flutterwave signature');
    const event = request.body as { data?: { id?: number; tx_ref?: string } };
    if (event.data?.tx_ref) {
      const charge = await gateway.verify(event.data.tx_ref);
      if (charge) await settleSuccessfulCharge(prisma, env, { reference: event.data.tx_ref, charge });
    }
    return reply.send({ received: true });
  });

  app.get('/orders', async (request) => {
    const user = await requireUser(request);
    const orders = await prisma.order.findMany({ where: { buyerId: user.id }, include: { items: true, shipment: true }, orderBy: { createdAt: 'desc' } });
    return { orders };
  });

  app.get('/orders/:id', async (request) => {
    const user = await requireUser(request);
    const order = await prisma.order.findUnique({
      where: { id: (request.params as { id: string }).id },
      include: { items: true, shipment: { include: { events: true, job: { include: { pings: true } } } }, timeline: true, returnRequests: true, payments: true },
    });
    if (!order || (order.buyerId !== user.id && order.sellerId !== user.id && !can(user.roles.map((role) => role.role), 'orders.read'))) {
      throw new HttpError(404, 'Order not found');
    }
    return {
      order: {
        ...order,
        payments: order.payments.map((payment) => ({ id: payment.id, status: payment.status, amountKobo: payment.amountKobo, reference: payment.reference, provider: payment.provider })),
        feeSnapshot: order.feeSnapshot,
      },
    };
  });

  app.post('/orders/:id/cancel', async (request) => {
    const user = await requireUser(request);
    const order = await prisma.order.findUnique({ where: { id: (request.params as { id: string }).id }, include: { items: true, payments: true } });
    if (!order || order.buyerId !== user.id) throw new HttpError(404, 'Order not found');
    if (order.status !== 'PENDING_PAYMENT') throw new HttpError(409, 'Paid orders go through returns, not cancellation');
    if (order.payments.some((payment) => payment.status === 'SUCCESS' || payment.status === 'INITIATED' || payment.status === 'PENDING')) {
      throw new HttpError(409, 'A payment is already in progress');
    }
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
      for (const item of order.items) await releaseReservation(tx, item.productId, item.quantity);
      await tx.shipment.updateMany({ where: { orderId: order.id }, data: { status: 'CANCELLED' } });
      await tx.orderEvent.create({ data: { orderId: order.id, status: 'CANCELLED', actorId: user.id, note: 'Cancelled by the buyer' } });
    });
    return { ok: true };
  });

  app.get('/seller/offers', async (request) => {
    const user = await requireUser(request, { seller: true });
    const offers = await prisma.offer.findMany({
      where: { product: { sellerId: user.id } },
      include: { product: true, buyer: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      offers: offers.map((offer) => ({
        id: offer.id,
        amountKobo: offer.amountKobo,
        status: offer.status,
        counterKobo: offer.counterKobo,
        product: { title: offer.product.title },
        buyer: offer.buyer.displayName,
      })),
    };
  });

  app.get('/seller/orders', async (request) => {
    const user = await requireUser(request, { seller: true });
    return { orders: await prisma.order.findMany({ where: { sellerId: user.id }, include: { items: true, shipment: true }, orderBy: { createdAt: 'desc' } }) };
  });

  app.post('/orders/:id/dispatch', async (request) => {
    const user = await requireUser(request, { seller: true });
    const order = await prisma.order.findUnique({ where: { id: (request.params as { id: string }).id }, include: { shipment: true, buyer: true } });
    if (!order || order.sellerId !== user.id) throw new HttpError(404, 'Order not found');
    if (order.status !== 'AWAITING_DISPATCH') throw new HttpError(409, 'This order is not ready to dispatch');
    await prisma.order.update({ where: { id: order.id }, data: { status: 'DISPATCHED' } });
    await prisma.orderEvent.create({ data: { orderId: order.id, status: 'DISPATCHED', actorId: user.id, note: 'Seller confirmed handover' } });
    if (order.shipment) {
      await prisma.shipment.update({ where: { id: order.shipment.id }, data: { status: 'IN_TRANSIT' } });
      await prisma.shipmentEvent.create({ data: { shipmentId: order.shipment.id, status: 'IN_TRANSIT', source: 'SELLER', actorId: user.id, note: 'Seller handed the parcel over' } });
    }
    await notifyUser(prisma, env, order.buyer, { title: 'Your order is on the way', body: `The seller dispatched order ${order.id}`, linkUrl: `/orders/${order.id}` });
    return { ok: true };
  });

  app.post('/orders/:id/received', async (request) => {
    const user = await requireUser(request);
    const order = await prisma.order.findUnique({ where: { id: (request.params as { id: string }).id }, include: { shipment: true, seller: { include: { user: true } } } });
    if (!order || order.buyerId !== user.id) throw new HttpError(404, 'Order not found');
    if (order.status !== 'DISPATCHED') throw new HttpError(409, 'The seller has not marked this order dispatched');
    await prisma.order.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
    await prisma.orderEvent.create({ data: { orderId: order.id, status: 'DELIVERED', actorId: user.id, note: 'Buyer confirmed delivery' } });
    if (order.shipment) {
      await prisma.shipment.update({ where: { id: order.shipment.id }, data: { status: 'DELIVERED' } });
      await prisma.shipmentEvent.create({ data: { shipmentId: order.shipment.id, status: 'DELIVERED', source: 'BUYER', actorId: user.id } });
    }
    await notifyUser(prisma, env, order.seller.user, { title: 'Buyer confirmed delivery', body: `Order ${order.id} was marked delivered`, linkUrl: '/sell/orders' });
    return { ok: true };
  });

  app.post('/orders/:id/review', async (request, reply) => {
    const user = await requireUser(request);
    const order = await prisma.order.findUnique({ where: { id: (request.params as { id: string }).id } });
    if (!order || order.buyerId !== user.id) throw new HttpError(404, 'Order not found');
    if (!['DELIVERED', 'COMPLETED'].includes(order.status)) throw new HttpError(409, 'You can review after delivery');
    const body = request.body as { rating?: number; comment?: string };
    if (!body.rating || body.rating < 1 || body.rating > 5 || !body.comment) throw new HttpError(400, 'Add a rating from 1 to 5 and a comment');
    const review = await prisma.review.create({
      data: { orderId: order.id, reviewerId: user.id, sellerId: order.sellerId, rating: body.rating, comment: body.comment },
    });
    const aggregate = await prisma.review.aggregate({ where: { sellerId: order.sellerId }, _avg: { rating: true }, _count: true });
    await prisma.sellerProfile.update({
      where: { userId: order.sellerId },
      data: { ratingAvg: aggregate._avg.rating || 0, ratingCount: aggregate._count },
    });
    return reply.code(201).send({ review });
  });

  app.post('/orders/:id/returns', async (request, reply) => {
    const user = await requireUser(request);
    const order = await prisma.order.findUnique({ where: { id: (request.params as { id: string }).id }, include: { seller: { include: { user: true } } } });
    if (!order || order.buyerId !== user.id) throw new HttpError(404, 'Order not found');
    const body = request.body as { reason?: string; details?: string };
    const reasons = ['NOT_AS_DESCRIBED', 'WRONG_ITEM', 'DAMAGED', 'MISSING_COMPONENTS', 'SUSPECTED_COUNTERFEIT', 'OTHER'];
    if (!body.reason || !reasons.includes(body.reason) || !body.details) throw new HttpError(400, 'Choose a return reason and describe what happened');
    const requestRow = await prisma.returnRequest.create({
      data: { orderId: order.id, reason: body.reason as never, details: body.details, status: 'SELLER_REVIEW' },
    });
    if (['DELIVERED', 'COMPLETED', 'DISPATCHED', 'AWAITING_DISPATCH'].includes(order.status)) {
      await prisma.order.update({ where: { id: order.id }, data: { status: 'DISPUTED' } });
      await prisma.orderEvent.create({ data: { orderId: order.id, status: 'DISPUTED', actorId: user.id, note: body.reason } });
    }
    await notifyUser(prisma, env, order.seller.user, { title: 'Return request', body: body.details, linkUrl: '/sell/orders' });
    return reply.code(201).send({ returnRequest: requestRow });
  });

  app.post('/returns/:id/respond', async (request) => {
    const user = await requireUser(request, { seller: true });
    const row = await prisma.returnRequest.findUnique({ where: { id: (request.params as { id: string }).id }, include: { order: true } });
    if (!row || row.order.sellerId !== user.id) throw new HttpError(404, 'Return not found');
    const response = (request.body as { response?: string }).response || '';
    if (response.trim().length < 2) throw new HttpError(400, 'Write a response');
    await prisma.returnRequest.update({ where: { id: row.id }, data: { sellerResponse: response, status: 'ADMIN_REVIEW' } });
    await prisma.returnEvent.create({ data: { returnId: row.id, status: 'ADMIN_REVIEW', actorId: user.id, note: response } });
    return { ok: true };
  });

  app.get('/seller/earnings', async (request) => {
    const user = await requireUser(request, { seller: true });
    const [balance, entries, payouts] = await Promise.all([
      sellerPayableBalance(prisma, user.id),
      prisma.ledgerEntry.findMany({ where: { userId: user.id, account: 'SELLER_PAYABLE' }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.payout.findMany({ where: { sellerId: user.id }, orderBy: { requestedAt: 'desc' } }),
    ]);
    return { balanceKobo: balance, balance: formatNaira(balance), entries, payouts };
  });

  app.post('/seller/payouts', async (request, reply) => {
    const user = await requireUser(request, { seller: true });
    const amountKobo = nairaToKobo(Number((request.body as { amountNaira?: number }).amountNaira));
    const balance = await sellerPayableBalance(prisma, user.id);
    if (amountKobo > balance) throw new HttpError(400, 'That is more than the payable balance');
    const openDispute = await prisma.order.count({ where: { sellerId: user.id, status: 'DISPUTED' } });
    if (openDispute) throw new HttpError(409, 'Resolve open disputes before requesting a payout');
    const bank = await prisma.bankAccount.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    const payout = await prisma.payout.create({
      data: {
        sellerId: user.id,
        amountKobo,
        bankName: bank?.bankName,
        accountName: bank?.accountName,
        accountNumberLast4: bank?.last4,
        note: 'Requested by seller. Finance must record the bank transfer. This does not move money by itself.',
      },
    });
    return reply.code(201).send({ payout });
  });

  app.post('/seller/verification', async (request) => {
    const user = await requireUser(request, { seller: true });
    const body = request.body as { ninLast4?: string; businessName?: string; cacNumber?: string };
    if (!/^\d{4}$/.test(body.ninLast4 || '')) throw new HttpError(400, 'Enter only the last 4 digits of your NIN');
    await prisma.sellerProfile.update({
      where: { userId: user.id },
      data: {
        verification: 'PENDING',
        ninLast4: body.ninLast4,
        businessName: body.businessName,
        cacNumber: body.cacNumber,
      },
    });
    return { verification: 'PENDING' };
  });

  app.post('/seller/bank-account', async (request) => {
    const user = await requireUser(request, { seller: true });
    const body = request.body as { bankName?: string; accountName?: string; accountNumber?: string };
    if (!body.bankName || !body.accountName || !/^\d{10}$/.test(body.accountNumber || '')) {
      throw new HttpError(400, 'Enter the bank, account name and 10-digit NUBAN');
    }
    const account = await prisma.bankAccount.create({
      data: {
        userId: user.id,
        bankName: body.bankName,
        accountName: body.accountName,
        accountNumberEnc: encryptString(body.accountNumber!, env.encryptionKey),
        last4: body.accountNumber!.slice(-4),
      },
    });
    return { id: account.id, bankName: account.bankName, accountName: account.accountName, last4: account.last4 };
  });

  app.post('/conversations', async (request, reply) => {
    const user = await requireUser(request);
    const body = request.body as { sellerId?: string; productId?: string; body?: string };
    if (!body.sellerId || !body.body?.trim()) throw new HttpError(400, 'Write a message');
    if (body.sellerId === user.id) throw new HttpError(400, 'You cannot message yourself');
    const conversation = await prisma.conversation.upsert({
      where: { buyerId_sellerId_productId: { buyerId: user.id, sellerId: body.sellerId, productId: body.productId || '' } },
      create: { buyerId: user.id, sellerId: body.sellerId, productId: body.productId || '' },
      update: { updatedAt: new Date() },
    });
    const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: user.id, body: body.body.trim() } });
    const seller = await prisma.user.findUnique({ where: { id: body.sellerId } });
    if (seller) await notifyUser(prisma, env, seller, { title: 'New message', body: body.body.trim().slice(0, 140), linkUrl: '/messages' });
    return reply.code(201).send({ conversationId: conversation.id, message });
  });

  app.post('/conversations/:id/messages', async (request, reply) => {
    const user = await requireUser(request);
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: (request.params as { id: string }).id,
        OR: [{ buyerId: user.id }, { sellerId: user.id }],
      },
    });
    if (!conversation) throw new HttpError(404, 'Conversation not found');
    const body = (request.body as { body?: string }).body?.trim() || '';
    if (body.length < 1) throw new HttpError(400, 'Write a message');
    const message = await prisma.message.create({ data: { conversationId: conversation.id, senderId: user.id, body } });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    const recipientId = conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId;
    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (recipient) await notifyUser(prisma, env, recipient, { title: 'New message', body: body.slice(0, 140), linkUrl: '/messages' });
    return reply.code(201).send({ message });
  });

  app.get('/conversations', async (request) => {
    const user = await requireUser(request);
    const conversations = await prisma.conversation.findMany({
      where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 50 } },
      orderBy: { updatedAt: 'desc' },
    });
    return { conversations };
  });

  app.get('/notifications', async (request) => {
    const user = await requireUser(request);
    return { notifications: await prisma.notification.findMany({ where: { userId: user.id, channel: 'IN_APP' }, orderBy: { createdAt: 'desc' }, take: 40 }) };
  });

  app.post('/notifications/:id/read', async (request) => {
    const user = await requireUser(request);
    await prisma.notification.updateMany({ where: { id: (request.params as { id: string }).id, userId: user.id }, data: { readAt: new Date(), status: 'READ' } });
    return { ok: true };
  });

  app.get('/admin/summary', async (request) => {
    await requireUser(request, { permission: 'reports.read' });
    const [users, listings, orders, gmv] = await Promise.all([
      prisma.user.count(),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.order.count({ where: { status: { not: 'CANCELLED' } } }),
      prisma.order.aggregate({ where: { paidAt: { not: null } }, _sum: { buyerTotalKobo: true, commissionKobo: true } }),
    ]);
    return { users, activeListings: listings, orders, paidTotalKobo: gmv._sum.buyerTotalKobo || 0, commissionKobo: gmv._sum.commissionKobo || 0 };
  });

  app.get('/admin/commercial-settings', async (request) => {
    await requireUser(request, { permission: 'commerce.manage' });
    return { settings: await prisma.commercialSetting.findMany({ orderBy: { createdAt: 'desc' } }) };
  });

  app.post('/admin/commercial-settings', async (request, reply) => {
    const user = await requireUser(request, { permission: 'commerce.manage' });
    const body = request.body as {
      key?: string;
      sellerType?: 'INDIVIDUAL' | 'BUSINESS' | null;
      categoryId?: string | null;
      valueType?: 'BPS' | 'FIXED_KOBO' | 'JSON';
      valueNumber?: number | null;
      valueJson?: unknown;
      effectiveFrom?: string;
      reason?: string;
    };
    if (!body.key || !(COMMERCIAL_KEYS as readonly string[]).includes(body.key)) throw new HttpError(400, 'Unknown commercial setting');
    if (!body.reason || body.reason.trim().length < 4) throw new HttpError(400, 'Record why this charge is changing');
    if (!body.valueType) throw new HttpError(400, 'Choose a value type');
    const key = body.key;
    const valueType = body.valueType;
    const reason = body.reason.trim();
    const effectiveFrom = new Date(body.effectiveFrom || Date.now());
    if (Number.isNaN(effectiveFrom.getTime())) throw new HttpError(400, 'Effective date is invalid');
    if (effectiveFrom.getTime() < Date.now() - 5 * 60 * 1000) throw new HttpError(400, 'Effective dates cannot rewrite the past');
    if (valueType === 'BPS' && (!Number.isInteger(body.valueNumber) || (body.valueNumber ?? -1) < 0 || (body.valueNumber ?? 0) > 10_000)) {
      throw new HttpError(400, 'A percentage must be between 0 and 100');
    }
    if (valueType === 'FIXED_KOBO' && (!Number.isInteger(body.valueNumber) || (body.valueNumber ?? -1) < 0)) {
      throw new HttpError(400, 'A fixed charge must be zero or more kobo');
    }
    if (valueType === 'JSON' && (body.valueJson === undefined || body.valueJson === null)) throw new HttpError(400, 'Add the JSON value');
    const sellerType = body.sellerType ?? null;
    const categoryId = body.categoryId ?? null;
    const overlap = await prisma.commercialSetting.findFirst({
      where: { key, sellerType, categoryId, effectiveFrom: { gte: effectiveFrom } },
    });
    if (overlap) throw new HttpError(409, 'A later setting already exists for this charge. Add the next change after it.');
    const created = await prisma.$transaction(async (tx) => {
      await tx.commercialSetting.updateMany({
        where: { key, sellerType, categoryId, effectiveTo: null, effectiveFrom: { lte: effectiveFrom } },
        data: { effectiveTo: effectiveFrom },
      });
      return tx.commercialSetting.create({
        data: {
          key,
          sellerType,
          categoryId,
          valueType,
          valueNumber: valueType === 'JSON' ? null : (body.valueNumber ?? null),
          valueJson: valueType === 'JSON' ? (body.valueJson as Prisma.InputJsonValue) : Prisma.JsonNull,
          effectiveFrom,
          reason,
          createdById: user.id,
        },
      });
    });
    await audit(user.id, 'commerce.setting', 'CommercialSetting', created.id, { key, reason }, request);
    return reply.code(201).send({ setting: created });
  });

  app.post('/admin/coupons', async (request, reply) => {
    const user = await requireUser(request, { permission: 'commerce.manage' });
    const body = request.body as {
      code?: string;
      description?: string;
      bpsOff?: number;
      fixedOffKobo?: number;
      fundedBy?: 'PLATFORM' | 'SELLER';
      startsAt?: string;
    };
    if (!body.code || !body.description || !body.fundedBy) throw new HttpError(400, 'Code, description and who funds the discount are required');
    const coupon = await prisma.coupon.create({
      data: {
        code: body.code.trim().toUpperCase(),
        description: body.description,
        bpsOff: body.bpsOff || 0,
        fixedOffKobo: body.fixedOffKobo || 0,
        fundedBy: body.fundedBy,
        startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
        createdById: user.id,
      },
    });
    await audit(user.id, 'coupon.create', 'Coupon', coupon.id, { code: coupon.code, fundedBy: coupon.fundedBy }, request);
    return reply.code(201).send({ coupon });
  });

  app.post('/admin/promotions', async (request, reply) => {
    const user = await requireUser(request, { permission: 'commerce.manage' });
    const body = request.body as { title?: string; body?: string; priceKobo?: number; startsAt?: string };
    if (!body.title || !body.body) throw new HttpError(400, 'Add a title and message');
    const promotion = await prisma.promotion.create({
      data: {
        title: body.title,
        body: body.body,
        priceKoboSnapshot: body.priceKobo || 0,
        startsAt: body.startsAt ? new Date(body.startsAt) : new Date(),
      },
    });
    await audit(user.id, 'promotion.create', 'Promotion', promotion.id, { priceKobo: promotion.priceKoboSnapshot }, request);
    return reply.code(201).send({ promotion });
  });

  app.get('/admin/users', async (request) => {
    await requireUser(request, { permission: 'users.read' });
    const users = await prisma.user.findMany({ include: userInclude, orderBy: { createdAt: 'desc' }, take: 100 });
    return { users: users.map(publicUser) };
  });

  app.post('/admin/users/:id/status', async (request) => {
    const actor = await requireUser(request, { permission: 'users.suspend' });
    const status = (request.body as { status?: User['status'] }).status;
    if (!status || !['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(status)) throw new HttpError(400, 'Choose a status');
    const id = (request.params as { id: string }).id;
    await prisma.user.update({ where: { id }, data: { status } });
    await audit(actor.id, 'user.status', 'User', id, { status }, request);
    return { ok: true };
  });

  app.post('/admin/staff', async (request, reply) => {
    const actor = await requireUser(request, { permission: 'users.staff' });
    const body = request.body as { email?: string; password?: string; displayName?: string; role?: string };
    if (!body.role || !isStaffRole(body.role)) throw new HttpError(400, 'Choose a staff role');
    if (!body.email || !isValidEmail(body.email) || passwordIssues(body.password || '').length || !body.displayName) {
      throw new HttpError(400, 'Email, name and a strong password are required');
    }
    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        displayName: body.displayName,
        passwordHash: await hashPassword(body.password || ''),
        roles: { create: { role: body.role } },
      },
      include: userInclude,
    });
    await audit(actor.id, 'staff.create', 'User', user.id, { role: body.role }, request);
    return reply.code(201).send({ user: publicUser(user) });
  });

  app.post('/admin/sellers/:id/verification', async (request) => {
    const actor = await requireUser(request, { permission: 'listings.moderate' });
    const body = request.body as { status?: 'VERIFIED' | 'REJECTED'; note?: string };
    if (!body.status) throw new HttpError(400, 'Choose a decision');
    await prisma.sellerProfile.update({
      where: { userId: (request.params as { id: string }).id },
      data: { verification: body.status, verificationNote: body.note },
    });
    await audit(actor.id, 'seller.verification', 'SellerProfile', (request.params as { id: string }).id, { status: body.status }, request);
    return { ok: true };
  });

  app.get('/admin/listings', async (request) => {
    await requireUser(request, { permission: 'listings.moderate' });
    const products = await prisma.product.findMany({
      where: { status: { in: ['PENDING_REVIEW', 'ACTIVE', 'REJECTED'] } },
      include: { images: true, seller: true, category: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { products: products.map(serializeProduct) };
  });

  app.post('/admin/listings/:id/moderate', async (request) => {
    const actor = await requireUser(request, { permission: 'listings.moderate' });
    const body = request.body as { status?: 'ACTIVE' | 'REJECTED'; reason?: string };
    if (!body.status) throw new HttpError(400, 'Choose a decision');
    const id = (request.params as { id: string }).id;
    await prisma.product.update({
      where: { id },
      data: { status: body.status, rejectionReason: body.status === 'REJECTED' ? body.reason || 'Rejected' : null },
    });
    await audit(actor.id, 'listing.moderate', 'Product', id, { status: body.status }, request);
    return { ok: true };
  });

  app.get('/admin/orders', async (request) => {
    await requireUser(request, { permission: 'orders.read' });
    return { orders: await prisma.order.findMany({ include: { items: true, shipment: true }, orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.get('/admin/payments', async (request) => {
    await requireUser(request, { permission: 'payments.read' });
    return { payments: await prisma.payment.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.get('/admin/reconciliation', async (request) => {
    await requireUser(request, { permission: 'reports.read' });
    const [payments, refunds, payouts, debits, credits] = await Promise.all([
      prisma.payment.aggregate({ where: { status: 'SUCCESS' }, _sum: { amountKobo: true } }),
      prisma.refund.aggregate({ where: { status: 'PROCESSED' }, _sum: { amountKobo: true } }),
      prisma.payout.aggregate({ where: { status: 'PAID' }, _sum: { amountKobo: true } }),
      prisma.ledgerEntry.aggregate({ where: { account: 'PAYMENT_CLEARING', direction: 'DEBIT' }, _sum: { amountKobo: true } }),
      prisma.ledgerEntry.aggregate({ where: { account: 'PAYMENT_CLEARING', direction: 'CREDIT' }, _sum: { amountKobo: true } }),
    ]);
    const { reconcilePayments } = await import('@ninted/domain');
    return reconcilePayments({
      capturedPaymentsKobo: payments._sum.amountKobo || 0,
      processedRefundsKobo: refunds._sum.amountKobo || 0,
      paidPayoutsKobo: payouts._sum.amountKobo || 0,
      clearingDebitsKobo: debits._sum.amountKobo || 0,
      clearingCreditsKobo: credits._sum.amountKobo || 0,
    });
  });

  app.get('/admin/payouts', async (request) => {
    await requireUser(request, { permission: 'payouts.manage' });
    return { payouts: await prisma.payout.findMany({ orderBy: { requestedAt: 'desc' }, take: 100 }) };
  });

  app.post('/admin/payouts/:id/decision', async (request) => {
    const actor = await requireUser(request, { permission: 'payouts.manage' });
    const payout = await prisma.payout.findUnique({ where: { id: (request.params as { id: string }).id } });
    if (!payout) throw new HttpError(404, 'Payout not found');
    const body = request.body as { status?: 'APPROVED' | 'REJECTED' | 'PAID'; externalReference?: string; note?: string };
    if (body.status === 'PAID') {
      if (!body.externalReference) throw new HttpError(400, 'Record the bank transfer reference before marking a payout paid');
      const { ledgerForPayout } = await import('@ninted/domain');
      await prisma.$transaction(async (tx) => {
        const existing = await tx.ledgerEntry.count({ where: { payoutId: payout.id } });
        if (existing) return;
        await tx.payout.update({
          where: { id: payout.id },
          data: { status: 'PAID', externalReference: body.externalReference, paidAt: new Date(), decidedById: actor.id, note: body.note },
        });
        for (const line of ledgerForPayout(payout.amountKobo)) {
          await tx.ledgerEntry.create({ data: { ...line, userId: payout.sellerId, payoutId: payout.id } });
        }
      });
    } else if (body.status === 'REJECTED' || body.status === 'APPROVED') {
      await prisma.payout.update({ where: { id: payout.id }, data: { status: body.status, note: body.note, decidedById: actor.id } });
    } else {
      throw new HttpError(400, 'Choose approved, rejected or paid');
    }
    await audit(actor.id, 'payout.decision', 'Payout', payout.id, { status: body.status, externalReference: body.externalReference }, request);
    return { ok: true };
  });

  app.get('/admin/returns', async (request) => {
    await requireUser(request, { permission: 'disputes.manage' });
    return { returns: await prisma.returnRequest.findMany({ include: { order: true }, orderBy: { createdAt: 'desc' } }) };
  });

  app.post('/admin/returns/:id/decision', async (request) => {
    const actor = await requireUser(request, { permission: 'disputes.manage' });
    const row = await prisma.returnRequest.findUnique({ where: { id: (request.params as { id: string }).id }, include: { order: true } });
    if (!row) throw new HttpError(404, 'Return not found');
    const body = request.body as { status?: string; note?: string };
    const allowed = ['APPROVED', 'REJECTED', 'AWAITING_PICKUP', 'RECEIVED', 'INSPECTED', 'REFUND_APPROVED', 'CLOSED'];
    if (!body.status || !allowed.includes(body.status)) throw new HttpError(400, 'Choose a return decision');
    await prisma.returnRequest.update({ where: { id: row.id }, data: { status: body.status as never, adminNote: body.note, inspectionNote: body.status === 'INSPECTED' ? body.note : row.inspectionNote } });
    await prisma.returnEvent.create({ data: { returnId: row.id, status: body.status as never, actorId: actor.id, note: body.note } });
    if (body.status === 'REFUND_APPROVED') {
      await prisma.order.update({ where: { id: row.orderId }, data: { status: 'REFUND_PENDING' } });
    }
    if (body.status === 'REJECTED') {
      await prisma.order.update({ where: { id: row.orderId }, data: { status: 'COMPLETED' } });
    }
    await audit(actor.id, 'return.decision', 'ReturnRequest', row.id, { status: body.status }, request);
    return { ok: true };
  });

  app.post('/admin/refunds', async (request) => {
    const actor = await requireUser(request, { permission: 'refunds.manage' });
    if (!gateway) throw new HttpError(503, 'The payment provider is not configured, so the refund was not sent', 'PAYMENT_UNCONFIGURED');
    const orderId = (request.body as { orderId?: string; reason?: string }).orderId;
    const reason = (request.body as { reason?: string }).reason || 'Approved return';
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    if (!order) throw new HttpError(404, 'Order not found');
    const approved = await prisma.returnRequest.findFirst({ where: { orderId: order.id, status: 'REFUND_APPROVED' } });
    if (!approved) throw new HttpError(409, 'A return must be approved for refund before money is sent back');
    const payment = order.payments.find((item) => item.status === 'SUCCESS');
    if (!payment) throw new HttpError(409, 'There is no successful payment to refund');
    const refund = await prisma.refund.create({
      data: { paymentId: payment.id, amountKobo: payment.amountKobo, reason, requestedById: actor.id, status: 'PROCESSING' },
    });
    try {
      const provider = await gateway.refund({
        reference: payment.reference,
        providerTransactionId: payment.providerTransactionId,
        amountKobo: payment.amountKobo,
      });
      const processed = providerRefundSettled(provider.status);
      await prisma.refund.update({
        where: { id: refund.id },
        data: { providerRefundId: provider.providerRefundId, status: processed ? 'PROCESSED' : 'PROCESSING' },
      });
      if (processed) {
        await prisma.$transaction(async (tx) => {
          await reverseOrderLedger(tx, { orderId: order.id, paymentId: payment.id, refundId: refund.id, snapshot: order.feeSnapshot as unknown as FeeSnapshot });
          await tx.order.update({ where: { id: order.id }, data: { status: 'REFUNDED' } });
          await tx.returnRequest.update({ where: { id: approved.id }, data: { status: 'REFUNDED' } });
          await tx.orderEvent.create({ data: { orderId: order.id, status: 'REFUNDED', actorId: actor.id, note: 'Provider accepted the refund' } });
        });
      }
      await audit(actor.id, 'refund.submit', 'Refund', refund.id, { providerStatus: provider.status }, request);
      return { refundId: refund.id, providerStatus: provider.status, completed: processed };
    } catch (error) {
      await prisma.refund.update({
        where: { id: refund.id },
        data: { status: 'FAILED', failureReason: error instanceof Error ? error.message : 'Refund failed' },
      });
      throw new HttpError(502, error instanceof Error ? error.message : 'The provider did not accept the refund');
    }
  });

  app.get('/admin/couriers', async (request) => {
    await requireUser(request, { permission: 'couriers.manage' });
    const couriers = await prisma.courierProvider.findMany();
    return { couriers: couriers.map((courier) => ({ ...courier, apiKeyEnc: undefined, hasApiKey: Boolean(courier.apiKeyEnc) })) };
  });

  app.post('/admin/couriers', async (request, reply) => {
    const actor = await requireUser(request, { permission: 'couriers.manage' });
    const body = request.body as { code?: string; displayName?: string; baseUrl?: string; apiKey?: string; enabled?: boolean; coverageNote?: string };
    if (!body.code || !body.displayName) throw new HttpError(400, 'Code and name are required');
    const courier = await prisma.courierProvider.upsert({
      where: { code: body.code.toUpperCase() },
      create: {
        code: body.code.toUpperCase(),
        displayName: body.displayName,
        baseUrl: body.baseUrl,
        apiKeyEnc: body.apiKey ? encryptString(body.apiKey, env.encryptionKey) : null,
        enabled: Boolean(body.enabled && body.baseUrl && body.apiKey),
        coverageNote: body.coverageNote,
      },
      update: {
        displayName: body.displayName,
        baseUrl: body.baseUrl,
        ...(body.apiKey ? { apiKeyEnc: encryptString(body.apiKey, env.encryptionKey) } : {}),
        enabled: Boolean(body.enabled),
        coverageNote: body.coverageNote,
      },
    });
    await audit(actor.id, 'courier.save', 'CourierProvider', courier.id, { code: courier.code, enabled: courier.enabled }, request);
    return reply.code(201).send({ id: courier.id, code: courier.code, enabled: courier.enabled });
  });

  app.post('/admin/shipments/:id/status', async (request) => {
    const actor = await requireUser(request, { permission: 'shipments.manage' });
    const body = request.body as { status?: string; note?: string };
    if (!body.status || !body.note) throw new HttpError(400, 'Status and a note are required');
    const shipment = await prisma.shipment.update({
      where: { id: (request.params as { id: string }).id },
      data: { status: body.status as never, failureReason: body.status === 'FAILED' ? body.note : undefined },
    });
    await prisma.shipmentEvent.create({
      data: { shipmentId: shipment.id, status: body.status as never, note: body.note, source: 'ADMIN', actorId: actor.id },
    });
    await audit(actor.id, 'shipment.status', 'Shipment', shipment.id, { status: body.status, note: body.note }, request);
    return { ok: true };
  });

  app.post('/admin/policies', async (request) => {
    const actor = await requireUser(request, { permission: 'policies.manage' });
    const body = request.body as { slug?: string; title?: string; body?: string };
    if (!body.slug || !body.title || !body.body) throw new HttpError(400, 'Slug, title and body are required');
    const policy = await prisma.platformPolicy.upsert({
      where: { slug: body.slug },
      create: { slug: body.slug, title: body.title, body: body.body, updatedById: actor.id },
      update: { title: body.title, body: body.body, updatedById: actor.id },
    });
    await audit(actor.id, 'policy.save', 'PlatformPolicy', policy.slug, { title: policy.title }, request);
    return { policy };
  });

  app.get('/admin/audit', async (request) => {
    await requireUser(request, { permission: 'reports.read' });
    return { entries: await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.get('/admin/fraud', async (request) => {
    await requireUser(request, { permission: 'payments.read' });
    return { flags: await prisma.fraudFlag.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.post('/admin/prohibited-terms', async (request, reply) => {
    const actor = await requireUser(request, { permission: 'listings.moderate' });
    const term = (request.body as { term?: string }).term?.trim().toLowerCase();
    if (!term) throw new HttpError(400, 'Add a term');
    const saved = await prisma.prohibitedTerm.upsert({ where: { term }, create: { term }, update: {} });
    await audit(actor.id, 'prohibited.add', 'ProhibitedTerm', saved.id, { term }, request);
    return reply.code(201).send({ term: saved });
  });

  app.post('/seller/subscription', async (request) => {
    const user = await requireUser(request, { seller: true });
    if (!gateway) throw new HttpError(503, 'The payment provider is not configured', 'PAYMENT_UNCONFIGURED');
    const rules = await loadRules(prisma);
    const { resolveRule } = await import('@ninted/domain');
    const key = user.seller!.type === 'BUSINESS' ? 'BUSINESS_SUBSCRIPTION_MONTHLY_KOBO' : 'SELLER_SUBSCRIPTION_MONTHLY_KOBO';
    const rule = resolveRule(rules, key, { sellerType: user.seller!.type, categoryId: null, at: new Date() });
    const amount = rule?.valueNumber ?? 0;
    if (amount < 100) throw new HttpError(400, 'The owner has not set a subscription price');
    const reference = randomReference('sub');
    await prisma.payment.create({
      data: { purpose: 'SUBSCRIPTION', userId: user.id, provider: gateway.provider, reference, amountKobo: amount, metadata: { sellerType: user.seller!.type } },
    });
    const started = await gateway.initialize({
      email: user.email,
      amountKobo: amount,
      reference,
      callbackUrl: `${env.publicWebUrl}/payments/callback`,
      metadata: { purpose: 'SUBSCRIPTION' },
    });
    return { authorizationUrl: started.authorizationUrl, reference, amountKobo: amount };
  });

  app.post('/products/:id/feature', async (request) => {
    const user = await requireUser(request, { seller: true });
    if (!gateway) throw new HttpError(503, 'The payment provider is not configured', 'PAYMENT_UNCONFIGURED');
    const product = await prisma.product.findFirst({ where: { id: (request.params as { id: string }).id, sellerId: user.id, status: 'ACTIVE' } });
    if (!product) throw new HttpError(404, 'Active listing not found');
    const rules = await loadRules(prisma);
    const { resolveRule } = await import('@ninted/domain');
    const rule = resolveRule(rules, 'FEATURED_LISTING_FEE_KOBO', { sellerType: user.seller!.type, categoryId: null, at: new Date() });
    const amount = rule?.valueNumber ?? 0;
    if (amount < 100) throw new HttpError(400, 'The owner has not set a featured listing price');
    const reference = randomReference('feat');
    await prisma.payment.create({
      data: {
        purpose: 'FEATURED_LISTING',
        userId: user.id,
        provider: gateway.provider,
        reference,
        amountKobo: amount,
        metadata: { productId: product.id, days: 7 },
      },
    });
    const started = await gateway.initialize({
      email: user.email,
      amountKobo: amount,
      reference,
      callbackUrl: `${env.publicWebUrl}/payments/callback`,
      metadata: { productId: product.id },
    });
    return { authorizationUrl: started.authorizationUrl, reference, amountKobo: amount };
  });

  app.post('/riders/apply', async (request, reply) => {
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    const user = await requireUser(request);
    const body = request.body as { city?: string; state?: string; vehicleType?: string; plateNumber?: string; ninLast4?: string };
    if (!body.city || !body.state || !isNigerianState(body.state) || !/^\d{4}$/.test(body.ninLast4 || '')) {
      throw new HttpError(400, 'City, state and the last 4 digits of your NIN are required');
    }
    const rider = await prisma.rider.upsert({
      where: { userId: user.id },
      create: { userId: user.id, city: body.city, state: body.state, vehicleType: body.vehicleType, plateNumber: body.plateNumber, ninLast4: body.ninLast4, status: 'PENDING_REVIEW' },
      update: { city: body.city, state: body.state, vehicleType: body.vehicleType, plateNumber: body.plateNumber, ninLast4: body.ninLast4, status: 'PENDING_REVIEW' },
    });
    return reply.code(201).send({ rider: { ...rider, ninLast4: undefined } });
  });

  app.post('/riders/me/availability', async (request) => {
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    const user = await requireUser(request);
    const rider = await prisma.rider.findUnique({ where: { userId: user.id } });
    if (!rider || rider.status !== 'APPROVED') throw new HttpError(403, 'Only approved riders can go on duty');
    const available = Boolean((request.body as { available?: boolean }).available);
    await prisma.rider.update({ where: { userId: user.id }, data: { available } });
    return { available };
  });

  app.get('/riders/me/jobs', async (request) => {
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    const user = await requireUser(request);
    const rider = await prisma.rider.findUnique({ where: { userId: user.id } });
    if (!rider) throw new HttpError(404, 'Apply as a rider first');
    const offered = rider.status === 'APPROVED' && rider.available
      ? await prisma.deliveryJob.findMany({ where: { status: 'OFFERED', riderId: null, shipment: { pickupAddress: { path: ['state'], equals: rider.state } } }, include: { shipment: true } })
      : [];
    const mine = await prisma.deliveryJob.findMany({ where: { riderId: user.id }, include: { shipment: true, pings: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    return { offered, mine };
  });

  app.post('/riders/jobs/:id/accept', async (request) => {
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    const user = await requireUser(request);
    const claimed = await prisma.deliveryJob.updateMany({
      where: { id: (request.params as { id: string }).id, status: 'OFFERED', riderId: null },
      data: { riderId: user.id, status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (!claimed.count) throw new HttpError(409, 'That job is no longer available');
    return { ok: true };
  });

  app.post('/riders/jobs/:id/reject', async (request) => {
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    await requireUser(request);
    return { ok: true };
  });

  app.post('/riders/jobs/:id/pickup', async (request) => {
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    const user = await requireUser(request);
    const job = await prisma.deliveryJob.findFirst({ where: { id: (request.params as { id: string }).id, riderId: user.id } });
    if (!job) throw new HttpError(404, 'Job not found');
    const pin = (request.body as { pin?: string }).pin || '';
    if (!pinsMatch(pin, env.accessTokenSecret, job.pickupPinHash)) throw new HttpError(403, 'Pickup PIN does not match');
    await prisma.deliveryJob.update({ where: { id: job.id }, data: { status: 'PICKUP_CONFIRMED', pickedUpAt: new Date() } });
    return { ok: true };
  });

  app.post('/riders/jobs/:id/deliver', async (request) => {
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    const user = await requireUser(request);
    const job = await prisma.deliveryJob.findFirst({ where: { id: (request.params as { id: string }).id, riderId: user.id }, include: { shipment: true } });
    if (!job) throw new HttpError(404, 'Job not found');
    const pin = (request.body as { pin?: string }).pin || '';
    if (!pinsMatch(pin, env.accessTokenSecret, job.dropoffPinHash)) throw new HttpError(403, 'Delivery PIN does not match');
    await prisma.deliveryJob.update({ where: { id: job.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } });
    await prisma.shipment.update({ where: { id: job.shipmentId }, data: { status: 'DELIVERED' } });
    await prisma.order.updateMany({ where: { id: job.shipment.orderId, status: 'DISPATCHED' }, data: { status: 'DELIVERED' } });
    return { ok: true };
  });

  app.post('/riders/jobs/:id/location', async (request) => {
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    const user = await requireUser(request);
    const job = await prisma.deliveryJob.findFirst({ where: { id: (request.params as { id: string }).id, riderId: user.id } });
    if (!job) throw new HttpError(404, 'Job not found');
    const body = request.body as { lat?: number; lng?: number };
    if (typeof body.lat !== 'number' || typeof body.lng !== 'number') throw new HttpError(400, 'Latitude and longitude are required');
    await prisma.jobPing.create({ data: { jobId: job.id, lat: body.lat, lng: body.lng } });
    return { ok: true };
  });

  app.get('/orders/:id/tracking', async (request) => {
    const user = await requireUser(request);
    const order = await prisma.order.findUnique({
      where: { id: (request.params as { id: string }).id },
      include: { shipment: { include: { events: true, job: { include: { pings: { orderBy: { createdAt: 'desc' }, take: 20 } } } } } },
    });
    if (!order || (order.buyerId !== user.id && order.sellerId !== user.id)) throw new HttpError(404, 'Order not found');
    return {
      shipment: order.shipment
        ? {
            status: order.shipment.status,
            courierCode: order.shipment.courierCode,
            trackingNumber: order.shipment.trackingNumber,
            waybill: order.shipment.waybill,
            failureReason: order.shipment.failureReason,
            events: order.shipment.events,
            lastLocations: order.shipment.job?.pings ?? [],
          }
        : null,
    };
  });

  app.get('/admin/riders', async (request) => {
    await requireUser(request, { permission: 'riders.manage' });
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    return { riders: await prisma.rider.findMany({ include: { user: true, documents: true } }) };
  });

  app.post('/admin/riders/:id/decision', async (request) => {
    const actor = await requireUser(request, { permission: 'riders.manage' });
    if (!env.phase2) throw new HttpError(404, 'The Ninted rider network is not enabled');
    const status = (request.body as { status?: 'APPROVED' | 'REJECTED' | 'SUSPENDED'; note?: string }).status;
    if (!status) throw new HttpError(400, 'Choose a decision');
    await prisma.rider.update({ where: { userId: (request.params as { id: string }).id }, data: { status, approvalNote: (request.body as { note?: string }).note, available: false } });
    await audit(actor.id, 'rider.decision', 'Rider', (request.params as { id: string }).id, { status }, request);
    return { ok: true };
  });

  app.get('/media/*', async (request, reply) => {
    const key = (request.params as { '*': string })['*'];
    if (!key?.startsWith('public/')) throw new HttpError(404, 'Not found');
    const file = await storage.read(key);
    if (!file) throw new HttpError(404, 'Not found');
    return reply.type(file.contentType).send(file.bytes);
  });

  app.get('/admin/reports', async (request) => {
    await requireUser(request, { permission: 'reports.read' });
    const [commission, protection, delivery, returns, sellers] = await Promise.all([
      prisma.ledgerEntry.groupBy({ by: ['direction'], where: { account: 'COMMISSION_REVENUE' }, _sum: { amountKobo: true } }),
      prisma.ledgerEntry.groupBy({ by: ['direction'], where: { account: 'BUYER_PROTECTION_REVENUE' }, _sum: { amountKobo: true } }),
      prisma.shipment.groupBy({ by: ['status'], _count: true }),
      prisma.returnRequest.count(),
      prisma.sellerProfile.count(),
    ]);
    const net = (rows: { direction: string; _sum: { amountKobo: number | null } }[]) =>
      rows.reduce((sum, row) => sum + (row.direction === 'CREDIT' ? row._sum.amountKobo || 0 : -(row._sum.amountKobo || 0)), 0);
    return {
      commissionKobo: net(commission),
      buyerProtectionKobo: net(protection),
      shipments: delivery,
      returnRequests: returns,
      sellers,
    };
  });

  return app;
}

export { expireUnpaidOrders, activeCoupon };
