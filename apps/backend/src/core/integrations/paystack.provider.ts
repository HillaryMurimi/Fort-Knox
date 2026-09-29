import { integrationConfig } from './config.js';
import { moneyFromMajorUnits } from '../money/money.js';
import { requestJson } from './http.js';
import type {
  PaymentInitiationInput,
  PaymentInitiationResult,
  PaymentProvider,
  PaymentProviderKey,
  RefundProvider,
  RefundResult,
  RefundStatus,
} from './provider.types.js';

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

interface InitializedTransaction {
  authorization_url: string;
  access_code: string;
  reference: string;
}

interface VerifiedTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at?: string | null;
  gateway_response?: string | null;
}

interface PaystackSubaccount {
  subaccount_code: string;
  business_name: string;
  account_name?: string | null;
  account_number: string;
  settlement_bank: string;
  currency: string;
  active: boolean;
  is_verified?: boolean;
}

interface PaystackRefund {
  id: number;
  transaction?: number | { id?: number };
  amount: number;
  currency: string;
  status: string;
}

function refundStatus(status: string): RefundStatus {
  const normalized = status.toLowerCase().replace('-', '_');
  if (normalized === 'pending' || normalized === 'processing' || normalized === 'needs_attention' || normalized === 'failed' || normalized === 'processed') return normalized.toUpperCase() as RefundStatus;
  throw new Error('PAYSTACK_REFUND_STATUS_UNKNOWN');
}

function refundResult(data: PaystackRefund): RefundResult {
  if (!Number.isSafeInteger(data.id) || data.id <= 0 || !Number.isSafeInteger(data.amount) || data.amount <= 0) throw new Error('PAYSTACK_REFUND_INVALID_RESPONSE');
  const transactionId = typeof data.transaction === 'number' ? data.transaction : data.transaction?.id;
  return { providerRefundId: data.id, ...(transactionId ? { transactionId } : {}), amountMinorUnits: data.amount, currency: data.currency.toUpperCase(), status: refundStatus(data.status) };
}

export interface CreatePaystackSubaccountInput {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  percentageCharge?: number;
  description?: string;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  metadata?: Record<string, unknown>;
}

export function toPaystackMinorUnits(amount: number, currency = 'KES'): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('PAYSTACK_INVALID_AMOUNT');
  try {
    return moneyFromMajorUnits(amount, currency).minorUnits;
  } catch {
    throw new Error('PAYSTACK_INVALID_AMOUNT');
  }
}

function normalizeStatus(status: string): PaymentInitiationResult['status'] {
  if (status === 'success') return 'CONFIRMED';
  if (['abandoned', 'failed', 'reversed'].includes(status)) return 'FAILED';
  return 'PENDING';
}

export class PaystackProvider implements PaymentProvider, RefundProvider {
  readonly key: PaymentProviderKey = 'PAYSTACK';

  private headers() {
    const secretKey = integrationConfig.paystack.secretKey;
    if (!integrationConfig.paystack.enabled || !secretKey) {
      throw new Error('PAYSTACK_NOT_CONFIGURED');
    }
    return { authorization: `Bearer ${secretKey}` };
  }

  async initiate(input: PaymentInitiationInput): Promise<PaymentInitiationResult> {
    if (!input.email) throw new Error('PAYSTACK_EMAIL_REQUIRED');

    const response = await requestJson<PaystackEnvelope<InitializedTransaction>>(
      `${integrationConfig.paystack.baseUrl}/transaction/initialize`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          email: input.email,
          amount: String(toPaystackMinorUnits(input.amount, input.currency)),
          currency: input.currency.toUpperCase(),
          reference: input.reference,
          ...(input.paystackChannels?.length ? { channels: input.paystackChannels } : {}),
          ...(input.paystackSubaccountCode ? { subaccount: input.paystackSubaccountCode } : {}),
          callback_url: input.callbackUrl ?? integrationConfig.paystack.callbackUrl,
          metadata: {
            organizationId: input.organizationId,
            paymentId: input.paymentId,
            ...input.metadata,
          },
        }),
      },
    );

    if (!response.status || !response.data.reference) {
      throw new Error(`PAYSTACK_INITIALIZATION_FAILED:${response.message}`);
    }

    return {
      provider: 'PAYSTACK',
      providerTransactionId: response.data.reference,
      status: 'PENDING',
      checkoutUrl: response.data.authorization_url,
      accessCode: response.data.access_code,
      customerMessage: response.message,
      raw: response.data,
    };
  }

  async createSubaccount(input: CreatePaystackSubaccountInput): Promise<PaystackSubaccount> {
    const response = await requestJson<PaystackEnvelope<PaystackSubaccount>>(
      `${integrationConfig.paystack.baseUrl}/subaccount`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          business_name: input.businessName,
          settlement_bank: input.bankCode,
          account_number: input.accountNumber,
          percentage_charge: input.percentageCharge ?? 0,
          description: input.description,
          primary_contact_email: input.primaryContactEmail,
          primary_contact_phone: input.primaryContactPhone,
          metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
        }),
      },
    );
    if (!response.status || !response.data.subaccount_code) {
      throw new Error(`PAYSTACK_SUBACCOUNT_CREATION_FAILED:${response.message}`);
    }
    return response.data;
  }

  async query(reference: string): Promise<PaymentInitiationResult> {
    const response = await requestJson<PaystackEnvelope<VerifiedTransaction>>(
      `${integrationConfig.paystack.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: this.headers() },
    );

    if (!response.status || !response.data.reference) {
      throw new Error(`PAYSTACK_VERIFICATION_FAILED:${response.message}`);
    }

    return {
      provider: 'PAYSTACK',
      providerTransactionId: response.data.reference,
      status: normalizeStatus(response.data.status),
      amountMinorUnits: response.data.amount,
      currency: response.data.currency.toUpperCase(),
      paidAt: response.data.paid_at ? new Date(response.data.paid_at) : undefined,
      customerMessage: response.data.gateway_response ?? response.message,
      raw: response.data,
    };
  }

  async createRefund(transactionReference: string, reason: string): Promise<RefundResult> {
    const response = await requestJson<PaystackEnvelope<PaystackRefund>>(`${integrationConfig.paystack.baseUrl}/refund`, {
      method: 'POST', headers: this.headers(),
      body: JSON.stringify({ transaction: transactionReference, merchant_note: reason }),
    });
    if (!response.status || !response.data) throw new Error('PAYSTACK_REFUND_SUBMISSION_FAILED');
    return refundResult(response.data);
  }

  async getRefund(providerRefundId: number): Promise<RefundResult> {
    const response = await requestJson<PaystackEnvelope<PaystackRefund>>(`${integrationConfig.paystack.baseUrl}/refund/${providerRefundId}`, { headers: this.headers() });
    if (!response.status || !response.data) throw new Error('PAYSTACK_REFUND_LOOKUP_FAILED');
    return refundResult(response.data);
  }
}
