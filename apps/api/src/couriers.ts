import type { DeliveryQuote } from '@ninted/domain';

export interface CourierParty {
  recipient: string;
  phone: string;
  line1: string;
  city: string;
  state: string;
}

export interface CourierParcel {
  weightGrams: number;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
}

export interface CourierBooking {
  providerBookingId: string;
  trackingNumber: string;
  waybill: string;
}

/**
 * Couriers integrate through this contract. Ninted does not invent a
 * provider's private API. A courier or middleware implements these paths.
 */
export class ContractCourier {
  constructor(
    readonly code: string,
    readonly displayName: string,
    private baseUrl: string,
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async request(pathname: string, init?: RequestInit) {
    const response = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${pathname}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) {
      throw new Error(`${this.displayName} returned ${response.status}`);
    }
    return response.json() as Promise<Record<string, unknown>>;
  }

  async quote(input: { pickup: CourierParty; dropoff: CourierParty; parcel: CourierParcel }): Promise<DeliveryQuote[]> {
    const body = await this.request('/ninted/quotes', { method: 'POST', body: JSON.stringify(input) });
    const quotes = Array.isArray(body.quotes) ? body.quotes : [];
    return quotes.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const quote = entry as { serviceCode?: unknown; label?: unknown; feeKobo?: unknown; etaDays?: unknown };
      if (typeof quote.serviceCode !== 'string' || typeof quote.label !== 'string' || typeof quote.feeKobo !== 'number') {
        return [];
      }
      return [
        {
          code: `${this.code}:${quote.serviceCode}`,
          label: `${this.displayName} · ${quote.label}`,
          kind: 'COURIER' as const,
          feeKobo: quote.feeKobo,
          subsidyKobo: 0,
          buyerPaysKobo: quote.feeKobo,
          etaDays: typeof quote.etaDays === 'number' ? quote.etaDays : null,
          riderShareBps: null,
          serviceCode: quote.serviceCode,
        },
      ];
    });
  }

  async book(input: {
    orderId: string;
    serviceCode: string;
    pickup: CourierParty;
    dropoff: CourierParty;
    parcel: CourierParcel;
  }): Promise<CourierBooking> {
    const body = await this.request('/ninted/bookings', { method: 'POST', body: JSON.stringify(input) });
    const booking = body.booking as { providerBookingId?: unknown; trackingNumber?: unknown; waybill?: unknown } | undefined;
    if (!booking || typeof booking.providerBookingId !== 'string' || typeof booking.trackingNumber !== 'string') {
      throw new Error(`${this.displayName} did not return a booking`);
    }
    return {
      providerBookingId: booking.providerBookingId,
      trackingNumber: booking.trackingNumber,
      waybill: typeof booking.waybill === 'string' ? booking.waybill : booking.trackingNumber,
    };
  }

  async cancel(providerBookingId: string): Promise<void> {
    await this.request('/ninted/cancel', {
      method: 'POST',
      body: JSON.stringify({ providerBookingId }),
    });
  }
}
