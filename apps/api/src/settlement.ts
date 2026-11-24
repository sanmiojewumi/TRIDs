import { Prisma, type PrismaClient } from '@prisma/client';
import {
  assertTransition,
  chargeSatisfiesExpectation,
  ledgerForCapturedPayment,
  reverseLedger,
  type FeeSnapshot,
  type VerifiedCharge,
} from '@ninted/domain';
import type { Env } from './env.js';
import { notifyUser } from './notify.js';
import { ContractCourier } from './couriers.js';
import { decryptString, hashPin, randomPin } from './secrets.js';

type Db = PrismaClient | Prisma.TransactionClient;

async function consumeStock(tx: Prisma.TransactionClient, productId: string, quantity: number) {
  const moved = await tx.$executeRaw`
    UPDATE "Product"
    SET quantity = quantity - ${quantity},
        reserved = GREATEST(reserved - ${quantity}, 0),
        status = CASE WHEN quantity - ${quantity} <= 0 THEN 'SOLD'::"ProductStatus" ELSE status END
    WHERE id = ${productId} AND reserved >= ${quantity} AND quantity >= ${quantity}
  `;
  return moved === 1;
}

export async function settleSuccessfulCharge(
  prisma: PrismaClient,
  env: Env,
  input: { reference: string; charge: VerifiedCharge },
): Promise<{ status: 'settled' | 'duplicate' | 'rejected'; reason?: string; orderId?: string; pins?: { pickup: string; dropoff: string } }> {
  const existing = await prisma.payment.findUnique({ where: { reference: input.reference }, include: { order: true } });
  if (!existing) return { status: 'rejected', reason: 'Unknown payment reference' };
  if (existing.status === 'SUCCESS') return { status: 'duplicate', orderId: existing.orderId ?? undefined };

  const decision = chargeSatisfiesExpectation(input.charge, {
    reference: existing.reference,
    amountKobo: existing.amountKobo,
    currency: existing.currency,
  });

  if (!decision.ok) {
    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { id: existing.id, status: { in: ['INITIATED', 'PENDING'] } },
        data: { status: 'FAILED', failureReason: decision.reason },
      });
      await tx.fraudFlag.create({
        data: {
          userId: existing.userId,
          paymentId: existing.id,
          code: 'PAYMENT_MISMATCH',
          detail: decision.reason,
        },
      });
    });
    return { status: 'rejected', reason: decision.reason };
  }

  const pins = { pickup: randomPin(), dropoff: randomPin() };
  let createdPins = false;
  let didSettle = false;

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.payment.updateMany({
      where: { id: existing.id, status: { in: ['INITIATED', 'PENDING'] } },
      data: {
        status: 'SUCCESS',
        verifiedAt: new Date(),
        providerTransactionId: input.charge.providerTransactionId,
        failureReason: null,
      },
    });
    if (claimed.count !== 1) return;
    didSettle = true;

    const snapshot = existing.order?.feeSnapshot as FeeSnapshot | undefined;
    if (existing.purpose === 'ORDER' && existing.order && snapshot) {
      assertTransition(existing.order.status, 'PAID');
      assertTransition('PAID', 'AWAITING_DISPATCH');
      const items = await tx.orderItem.findMany({ where: { orderId: existing.order.id } });
      for (const item of items) {
        const ok = await consumeStock(tx, item.productId, item.quantity);
        if (!ok) {
          await tx.fraudFlag.create({
            data: {
              userId: existing.userId,
              paymentId: existing.id,
              code: 'STOCK_RESERVATION_BROKEN',
              detail: `Could not consume stock for product ${item.productId}`,
            },
          });
        }
      }
      await tx.order.update({
        where: { id: existing.order.id },
        data: { status: 'AWAITING_DISPATCH', paidAt: new Date() },
      });
      await tx.orderEvent.createMany({
        data: [
          { orderId: existing.order.id, status: 'PAID', note: 'Payment verified with the provider' },
          { orderId: existing.order.id, status: 'AWAITING_DISPATCH', note: 'Waiting for the seller to hand the parcel over' },
        ],
      });
      for (const line of ledgerForCapturedPayment(snapshot)) {
        await tx.ledgerEntry.create({
          data: {
            ...line,
            userId: line.account === 'SELLER_PAYABLE' ? existing.order.sellerId : existing.userId,
            orderId: existing.order.id,
            paymentId: existing.id,
          },
        });
      }
      const shipment = await tx.shipment.findUnique({ where: { orderId: existing.order.id } });
      if (shipment?.courierCode.startsWith('NINTED_RIDER')) {
        await tx.deliveryJob.create({
          data: {
            shipmentId: shipment.id,
            pickupPinHash: hashPin(pins.pickup, env.accessTokenSecret),
            dropoffPinHash: hashPin(pins.dropoff, env.accessTokenSecret),
            earningsKobo: 0,
          },
        });
        createdPins = true;
      }
    } else if (existing.purpose === 'FEATURED_LISTING') {
      const metadata = existing.metadata as { productId?: string; days?: number } | null;
      if (metadata?.productId) {
        const days = metadata.days ?? 7;
        const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        await tx.product.update({ where: { id: metadata.productId }, data: { featuredUntil: until } });
      }
    } else if (existing.purpose === 'SUBSCRIPTION') {
      const metadata = existing.metadata as { sellerType?: 'INDIVIDUAL' | 'BUSINESS' } | null;
      const seller = await tx.sellerProfile.findUnique({ where: { userId: existing.userId } });
      if (seller) {
        const starts = new Date();
        const ends = new Date(starts.getTime() + 30 * 24 * 60 * 60 * 1000);
        await tx.subscription.create({
          data: {
            sellerId: seller.userId,
            sellerType: metadata?.sellerType || seller.type,
            amountKobo: existing.amountKobo,
            startsAt: starts,
            endsAt: ends,
            paymentId: existing.id,
          },
        });
      }
    }
  });

  if (!didSettle) return { status: 'duplicate', orderId: existing.orderId ?? undefined };

  if (existing.purpose === 'ORDER' && existing.orderId) {
    const order = await prisma.order.findUnique({
      where: { id: existing.orderId },
      include: { buyer: true, seller: { include: { user: true } }, shipment: true },
    });
    if (order) {
      await notifyUser(prisma, env, order.buyer, {
        title: 'Payment confirmed',
        body: createdPins
          ? `Order ${order.id} is paid. Pickup PIN ${pins.pickup}. Delivery PIN ${pins.dropoff}.`
          : `Order ${order.id} is paid. The seller can now dispatch it.`,
        linkUrl: `/orders/${order.id}`,
      });
      await notifyUser(prisma, env, order.seller.user, {
        title: 'You made a sale',
        body: `Order ${order.id} is paid. Dispatch it from your seller dashboard.`,
        linkUrl: `/sell/orders`,
      });
      if (order.shipment && order.shipment.courierCode.includes(':')) {
        await bookExternalCourier(prisma, env, order.shipment.id);
      }
    }
  }

  return {
    status: 'settled',
    orderId: existing.orderId ?? undefined,
    pins: createdPins ? pins : undefined,
  };
}

async function bookExternalCourier(prisma: PrismaClient, env: Env, shipmentId: string) {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId }, include: { order: { include: { items: true } } } });
  if (!shipment || shipment.providerBookingId) return;
  const [code, serviceCode] = shipment.courierCode.split(':');
  if (!code || !serviceCode) return;
  const provider = await prisma.courierProvider.findUnique({ where: { code } });
  if (!provider?.enabled || !provider.baseUrl || !provider.apiKeyEnc) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { failureReason: 'Courier is not configured, so the booking was not sent' },
    });
    return;
  }
  try {
    const courier = new ContractCourier(provider.code, provider.displayName, provider.baseUrl, decryptString(provider.apiKeyEnc, env.encryptionKey));
    const booking = await courier.book({
      orderId: shipment.orderId,
      serviceCode,
      pickup: shipment.pickupAddress as never,
      dropoff: shipment.deliveryAddress as never,
      parcel: { weightGrams: shipment.weightGrams || 0 },
    });
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'BOOKED',
        providerBookingId: booking.providerBookingId,
        trackingNumber: booking.trackingNumber,
        waybill: booking.waybill,
        failureReason: null,
      },
    });
    await prisma.shipmentEvent.create({
      data: { shipmentId: shipment.id, status: 'BOOKED', source: 'COURIER', note: 'Booking accepted by the courier' },
    });
  } catch (error) {
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { failureReason: error instanceof Error ? error.message : 'Courier booking failed' },
    });
  }
}

export async function reverseOrderLedger(tx: Db, input: { orderId: string; paymentId: string; refundId: string; snapshot: FeeSnapshot }) {
  for (const line of reverseLedger(ledgerForCapturedPayment(input.snapshot), 'Refund')) {
    await tx.ledgerEntry.create({
      data: {
        ...line,
        orderId: input.orderId,
        paymentId: input.paymentId,
        refundId: input.refundId,
      },
    });
  }
}

export async function sellerPayableBalance(prisma: PrismaClient, sellerId: string): Promise<number> {
  const rows = await prisma.ledgerEntry.findMany({
    where: { account: 'SELLER_PAYABLE', userId: sellerId },
    select: { direction: true, amountKobo: true },
  });
  return rows.reduce((sum, row) => sum + (row.direction === 'CREDIT' ? row.amountKobo : -row.amountKobo), 0);
}
