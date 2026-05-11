import { CurrencyCode, PaymentProvider, PlanCode } from '@prisma/client';

export type CheckoutResolutionStatus = 'SUCCEEDED' | 'FAILED' | 'CANCELED';

export type ForcedCheckoutOutcome =
  | 'SUCCESS'
  | 'FAIL_CARD_DECLINED'
  | 'FAIL_PROVIDER_ERROR'
  | 'CANCELED';

export type CheckoutSessionCreateInput = {
  paymentId: string;
  userId: string;
  planCode: PlanCode;
  amount: number;
  currency: CurrencyCode;
  successUrl?: string | null;
  cancelUrl?: string | null;
};

export type CheckoutSessionCreateResult = {
  provider: PaymentProvider;
  checkoutSessionId: string;
  checkoutUrl: string | null;
  providerPaymentId: string | null;
  mode: 'SIMULATED' | 'LIVE';
};

export type CheckoutSessionResolveInput = {
  checkoutSessionId: string;
  forcedOutcome?: ForcedCheckoutOutcome;
};

export type CheckoutSessionResolveResult = {
  provider: PaymentProvider;
  status: CheckoutResolutionStatus;
  providerPaymentId: string | null;
  errorCode?: string;
  errorMessage?: string;
};

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  createCheckoutSession(
    input: CheckoutSessionCreateInput,
  ): Promise<CheckoutSessionCreateResult>;
  resolveCheckoutSession(
    input: CheckoutSessionResolveInput,
  ): Promise<CheckoutSessionResolveResult>;
}

