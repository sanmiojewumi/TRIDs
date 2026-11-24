import { applyBps, assertKobo } from './money.js';

export interface RateLane {
  from: string;
  to: string;
  baseKobo: number;
  perKgKobo: number;
  etaDays: number;
  riderShareBps?: number;
}

export interface RateCard {
  subsidyKobo?: number;
  subsidyBps?: number;
  lanes: RateLane[];
}

export interface DeliveryQuote {
  code: string;
  label: string;
  kind: 'SELLER' | 'PLATFORM_RATE' | 'COURIER' | 'RIDER';
  feeKobo: number;
  subsidyKobo: number;
  buyerPaysKobo: number;
  etaDays: number | null;
  riderShareBps: number | null;
  serviceCode?: string;
}

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function findLane(card: RateCard, from: string, to: string): RateLane | null {
  const origin = normalise(from);
  const dest = normalise(to);
  const lanes = card.lanes;
  return (
    lanes.find((lane) => normalise(lane.from) === origin && normalise(lane.to) === dest) ??
    lanes.find((lane) => normalise(lane.from) === origin && lane.to === '*') ??
    lanes.find((lane) => lane.from === '*' && normalise(lane.to) === dest) ??
    lanes.find((lane) => lane.from === '*' && lane.to === '*') ??
    null
  );
}

export function quoteRateCard(
  card: RateCard,
  input: { from: string; to: string; weightGrams: number; code: string; label: string; kind: DeliveryQuote['kind'] },
): DeliveryQuote | null {
  if (!card || !Array.isArray(card.lanes)) return null;
  const lane = findLane(card, input.from, input.to);
  if (!lane) return null;
  const weightKg = Math.max(0, input.weightGrams) / 1000;
  const raw = assertKobo(lane.baseKobo + Math.round(weightKg * lane.perKgKobo), 'Delivery fee');
  const subsidy = Math.min(raw, (card.subsidyKobo ?? 0) + applyBps(raw, card.subsidyBps ?? 0));
  return {
    code: input.code,
    label: input.label,
    kind: input.kind,
    feeKobo: raw,
    subsidyKobo: subsidy,
    buyerPaysKobo: raw - subsidy,
    etaDays: lane.etaDays,
    riderShareBps: lane.riderShareBps ?? null,
  };
}

export function sellerArrangedOption(): DeliveryQuote {
  return {
    code: 'SELLER_ARRANGED',
    label: 'Arrange delivery with the seller',
    kind: 'SELLER',
    feeKobo: 0,
    subsidyKobo: 0,
    buyerPaysKobo: 0,
    etaDays: null,
    riderShareBps: null,
  };
}

export function rankDeliveryOptions<T extends { feeKobo: number; etaDays: number | null }>(
  options: readonly T[],
  priority: 'COST' | 'SPEED' = 'COST',
): T[] {
  const eta = (option: T) => option.etaDays ?? Number.MAX_SAFE_INTEGER;
  return [...options].sort((a, b) => {
    if (priority === 'SPEED') return eta(a) - eta(b) || a.feeKobo - b.feeKobo;
    return a.feeKobo - b.feeKobo || eta(a) - eta(b);
  });
}

export function parseRateCard(value: unknown): RateCard | null {
  if (!value || typeof value !== 'object') return null;
  const lanes = (value as { lanes?: unknown }).lanes;
  if (!Array.isArray(lanes)) return null;
  return value as RateCard;
}
