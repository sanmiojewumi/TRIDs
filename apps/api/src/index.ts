import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { buildApp } from './build-app.js';
import { expireUnpaidOrders } from './commerce.js';
import { readEnv } from './env.js';
import { gatewayFromEnv } from './gateways.js';
import { LocalStorage } from './storage.js';

const env = readEnv();
const prisma = new PrismaClient({ datasourceUrl: env.databaseUrl });
const storage = new LocalStorage(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads'), env.apiPublicUrl);
const app = await buildApp({
  prisma,
  env,
  gateway: gatewayFromEnv({
    provider: env.paymentProvider,
    paystackSecret: env.paystackSecret,
    flutterwaveSecret: env.flutterwaveSecret,
  }),
  storage,
});

const timer = setInterval(() => {
  expireUnpaidOrders(prisma).catch((error) => {
    app.log.error(error);
  });
}, 60_000);
timer.unref?.();

app.addHook('onClose', async () => {
  clearInterval(timer);
  await prisma.$disconnect();
});

await app.listen({ port: env.port, host: '0.0.0.0' });
console.log(`Ninted 9ja API listening on ${env.apiPublicUrl}`);
