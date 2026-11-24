import type { VerifiedCharge } from '@ninted/domain';

export interface GatewayInit {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
}

export interface PaymentGateway {
  provider: 'PAYSTACK' | 'FLUTTERWAVE';
  initialize(input: GatewayInit): Promise<{ authorizationUrl: string; reference: string }>;
  verify(reference: string): Promise<VerifiedCharge | null>;
  refund(input: {
    reference: string;
    providerTransactionId?: string | null;
    amountKobo: number;
  }): Promise<{ providerRefundId: string; status: string }>;
}

type FetchLike = typeof fetch;

export class PaystackGateway implements PaymentGateway {
  provider = 'PAYSTACK' as const;
  constructor(
    private secret: string,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async initialize(input: GatewayInit) {
    const response = await this.fetchImpl('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: 'NGN',
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    });
    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url?: string; reference?: string };
    };
    if (!response.ok || !body.status || !body.data?.authorization_url || !body.data.reference) {
      throw new Error(body.message || 'Paystack could not start this payment');
    }
    return { authorizationUrl: body.data.authorization_url, reference: body.data.reference };
  }

  async verify(reference: string): Promise<VerifiedCharge | null> {
    const response = await this.fetchImpl(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secret}` } },
    );
    const body = (await response.json()) as {
      status?: boolean;
      data?: { reference?: string; amount?: number; currency?: string; status?: string; id?: number | string };
    };
    if (!response.ok || !body.status || !body.data?.reference || body.data.amount === undefined || !body.data.status) {
      return null;
    }
    return {
      reference: body.data.reference,
      amountKobo: body.data.amount,
      currency: body.data.currency || 'NGN',
      status: body.data.status,
      providerTransactionId: String(body.data.id ?? ''),
    };
  }

  async refund(input: { reference: string; providerTransactionId?: string | null; amountKobo: number }) {
    const response = await this.fetchImpl('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transaction: input.providerTransactionId || input.reference,
        amount: input.amountKobo,
      }),
    });
    const body = (await response.json()) as {
      status?: boolean;
      message?: string;
      data?: { id?: number | string; status?: string };
    };
    if (!response.ok || !body.status || !body.data?.id) {
      throw new Error(body.message || 'Paystack refund was not accepted');
    }
    return { providerRefundId: String(body.data.id), status: body.data.status || 'pending' };
  }
}

export class FlutterwaveGateway implements PaymentGateway {
  provider = 'FLUTTERWAVE' as const;
  constructor(
    private secret: string,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async initialize(input: GatewayInit) {
    const response = await this.fetchImpl('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: input.reference,
        amount: input.amountKobo / 100,
        currency: 'NGN',
        redirect_url: input.callbackUrl,
        customer: { email: input.email },
        meta: input.metadata,
        customizations: { title: 'Ninted 9ja', description: 'Marketplace payment' },
      }),
    });
    const body = (await response.json()) as {
      status?: string;
      message?: string;
      data?: { link?: string };
    };
    if (!response.ok || body.status !== 'success' || !body.data?.link) {
      throw new Error(body.message || 'Flutterwave could not start this payment');
    }
    return { authorizationUrl: body.data.link, reference: input.reference };
  }

  async verify(reference: string): Promise<VerifiedCharge | null> {
    const response = await this.fetchImpl(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${this.secret}` } },
    );
    const body = (await response.json()) as {
      status?: string;
      data?: { tx_ref?: string; amount?: number; currency?: string; status?: string; id?: number | string };
    };
    if (!response.ok || body.status !== 'success' || !body.data?.tx_ref || body.data.amount === undefined || !body.data.status) {
      return null;
    }
    return {
      reference: body.data.tx_ref,
      amountKobo: Math.round(Number(body.data.amount) * 100),
      currency: body.data.currency || 'NGN',
      status: body.data.status === 'successful' ? 'success' : body.data.status,
      providerTransactionId: String(body.data.id ?? ''),
    };
  }

  async refund(input: { reference: string; providerTransactionId?: string | null; amountKobo: number }) {
    if (!input.providerTransactionId) throw new Error('Flutterwave refund needs the provider transaction id');
    const response = await this.fetchImpl(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(input.providerTransactionId)}/refund`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: input.amountKobo / 100 }),
      },
    );
    const body = (await response.json()) as {
      status?: string;
      message?: string;
      data?: { id?: number | string; status?: string };
    };
    if (!response.ok || body.status !== 'success' || !body.data?.id) {
      throw new Error(body.message || 'Flutterwave refund was not accepted');
    }
    return { providerRefundId: String(body.data.id), status: body.data.status || 'pending' };
  }
}

export function gatewayFromEnv(input: {
  provider: 'PAYSTACK' | 'FLUTTERWAVE';
  paystackSecret: string;
  flutterwaveSecret: string;
}): PaymentGateway | null {
  if (input.provider === 'FLUTTERWAVE') {
    return input.flutterwaveSecret ? new FlutterwaveGateway(input.flutterwaveSecret) : null;
  }
  return input.paystackSecret ? new PaystackGateway(input.paystackSecret) : null;
}

export function providerRefundSettled(status: string): boolean {
  return ['processed', 'completed', 'success', 'successful'].includes(status.toLowerCase());
}
