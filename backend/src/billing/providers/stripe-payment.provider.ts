import { Injectable } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { BillingDevOutcomeService } from '../billing-dev-outcome.service.js';
import {
  CheckoutSessionCreateInput,
  CheckoutSessionCreateResult,
  CheckoutSessionResolveInput,
  CheckoutSessionResolveResult,
  PaymentProviderAdapter,
} from '../payment-provider.interface.js';

@Injectable()
export class StripePaymentProvider implements PaymentProviderAdapter {
  readonly provider: PaymentProvider = 'STRIPE';

  constructor(private readonly devOutcome: BillingDevOutcomeService) {}

  async createCheckoutSession(
    input: CheckoutSessionCreateInput,
  ): Promise<CheckoutSessionCreateResult> {
    const nonce = Math.random().toString(36).slice(2, 10);
    const checkoutSessionId = `cs_test_${nonce}_${input.paymentId.slice(0, 8)}`;
    const providerPaymentId = `pi_test_${nonce}_${input.paymentId.slice(0, 8)}`;

    return {
      provider: 'STRIPE',
      checkoutSessionId,
      checkoutUrl: `https://checkout.stripe.com/c/pay/${checkoutSessionId}`,
      providerPaymentId,
      mode: 'SIMULATED',
    };
  }

  async resolveCheckoutSession(
    input: CheckoutSessionResolveInput,
  ): Promise<CheckoutSessionResolveResult> {
    return this.devOutcome.resolveOutcome(
      input.checkoutSessionId,
      input.forcedOutcome,
    );
  }
}

