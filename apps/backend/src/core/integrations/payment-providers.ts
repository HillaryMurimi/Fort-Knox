import type { PaymentProvider, PaymentInitiationInput, PaymentInitiationResult, PaymentProviderKey } from './provider.types.js';
import { MpesaProvider } from './mpesa.provider.js';
import { PaystackProvider } from './paystack.provider.js';

class UnconfiguredPaymentProvider implements PaymentProvider {
  constructor(public readonly key: PaymentProviderKey) {}
  async initiate(_input: PaymentInitiationInput): Promise<PaymentInitiationResult> { throw new Error(`${this.key}_NOT_CONFIGURED`); }
  async query(_providerTransactionId: string): Promise<PaymentInitiationResult> { throw new Error(`${this.key}_NOT_CONFIGURED`); }
}

export function getPaymentProvider(key: PaymentProviderKey): PaymentProvider {
  if (key === 'MPESA') return new MpesaProvider();
  if (key === 'PAYSTACK') return new PaystackProvider();
  return new UnconfiguredPaymentProvider(key);
}
