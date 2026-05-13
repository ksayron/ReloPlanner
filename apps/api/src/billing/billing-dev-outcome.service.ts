import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CheckoutSessionResolveResult,
  ForcedCheckoutOutcome,
} from './payment-provider.interface.js';

type SimulatedOutcome = CheckoutSessionResolveResult & { weight: number };

@Injectable()
export class BillingDevOutcomeService {
  private readonly isDevelopment: boolean;
  private readonly randomSimulationEnabled: boolean;

  constructor(private readonly config: ConfigService) {
    const nodeEnv = String(
      this.config.get<string>('NODE_ENV') ?? '',
    ).toLowerCase();
    this.isDevelopment = nodeEnv !== 'production';
    const configured = String(
      this.config.get<string>('BILLING_DEV_RANDOM_OUTCOME') ??
        (this.isDevelopment ? 'true' : 'false'),
    )
      .trim()
      .toLowerCase();
    this.randomSimulationEnabled = configured === 'true' || configured === '1';
  }

  resolveOutcome(
    checkoutSessionId: string,
    forcedOutcome?: ForcedCheckoutOutcome,
  ): CheckoutSessionResolveResult {
    if (forcedOutcome) {
      return this.resolveForcedOutcome(checkoutSessionId, forcedOutcome);
    }

    if (this.isDevelopment && this.randomSimulationEnabled) {
      return this.resolveWeightedRandom(checkoutSessionId);
    }

    return {
      provider: 'STRIPE',
      status: 'FAILED',
      providerPaymentId: `pi_live_pending_${checkoutSessionId}`,
      errorCode: 'stripe_live_resolution_not_implemented',
      errorMessage:
        'Live resolution is not implemented yet. Use webhooks/confirm integration for production.',
    };
  }

  private resolveForcedOutcome(
    checkoutSessionId: string,
    forcedOutcome: ForcedCheckoutOutcome,
  ): CheckoutSessionResolveResult {
    switch (forcedOutcome) {
      case 'SUCCESS':
        return {
          provider: 'STRIPE',
          status: 'SUCCEEDED',
          providerPaymentId: `pi_${checkoutSessionId}`,
        };
      case 'CANCELED':
        return {
          provider: 'STRIPE',
          status: 'CANCELED',
          providerPaymentId: `pi_${checkoutSessionId}`,
          errorCode: 'checkout_canceled',
          errorMessage: 'Checkout was canceled by the user.',
        };
      case 'FAIL_PROVIDER_ERROR':
        return {
          provider: 'STRIPE',
          status: 'FAILED',
          providerPaymentId: `pi_${checkoutSessionId}`,
          errorCode: 'provider_timeout',
          errorMessage:
            'Stripe provider timeout simulated in development mode.',
        };
      case 'FAIL_CARD_DECLINED':
      default:
        return {
          provider: 'STRIPE',
          status: 'FAILED',
          providerPaymentId: `pi_${checkoutSessionId}`,
          errorCode: 'card_declined',
          errorMessage: 'Card was declined by Stripe (simulated).',
        };
    }
  }

  private resolveWeightedRandom(
    checkoutSessionId: string,
  ): CheckoutSessionResolveResult {
    const outcomes: SimulatedOutcome[] = [
      {
        provider: 'STRIPE',
        status: 'SUCCEEDED',
        providerPaymentId: `pi_${checkoutSessionId}`,
        weight: 60,
      },
      {
        provider: 'STRIPE',
        status: 'FAILED',
        providerPaymentId: `pi_${checkoutSessionId}`,
        errorCode: 'card_declined',
        errorMessage: 'Card was declined by Stripe (simulated).',
        weight: 20,
      },
      {
        provider: 'STRIPE',
        status: 'FAILED',
        providerPaymentId: `pi_${checkoutSessionId}`,
        errorCode: 'provider_timeout',
        errorMessage: 'Stripe provider timeout simulated in development mode.',
        weight: 10,
      },
      {
        provider: 'STRIPE',
        status: 'CANCELED',
        providerPaymentId: `pi_${checkoutSessionId}`,
        errorCode: 'checkout_canceled',
        errorMessage: 'Checkout was canceled by the user.',
        weight: 10,
      },
    ];

    const totalWeight = outcomes.reduce((sum, item) => sum + item.weight, 0);
    let threshold = Math.random() * totalWeight;
    for (const outcome of outcomes) {
      threshold -= outcome.weight;
      if (threshold <= 0) {
        const { weight: _ignoredWeight, ...resolved } = outcome;
        return resolved;
      }
    }

    const fallback = outcomes[0];
    const { weight: _ignoredWeight, ...resolved } = fallback;
    return resolved;
  }
}
