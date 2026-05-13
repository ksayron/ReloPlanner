import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from '@prisma/client';
import Stripe from 'stripe';
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
  private readonly billingMode: 'LIVE' | 'SIMULATED';
  private readonly stripe: Stripe.Stripe | null;
  private readonly webhookSecret: string | null;
  private readonly premiumPriceId: string | null;
  private readonly appBaseUrl: string;
  private validatedPriceFingerprint: string | null = null;

  constructor(
    private readonly devOutcome: BillingDevOutcomeService,
    private readonly config: ConfigService,
  ) {
    const configuredMode = String(
      this.config.get<string>('BILLING_MODE') ?? 'live',
    )
      .trim()
      .toLowerCase();
    this.billingMode = configuredMode === 'simulated' ? 'SIMULATED' : 'LIVE';

    const secretKey = String(
      this.config.get<string>('STRIPE_SECRET_KEY') ?? '',
    ).trim();
    this.stripe = secretKey ? new Stripe(secretKey) : null;
    this.webhookSecret =
      String(this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? '').trim() ||
      null;
    this.premiumPriceId =
      String(
        this.config.get<string>('STRIPE_PRICE_ID_PREMIUM_MONTHLY') ?? '',
      ).trim() || null;
    this.appBaseUrl = String(
      this.config.get<string>('APP_BASE_URL') ??
        this.config.get<string>('FRONTEND_BASE_URL') ??
        'http://localhost:5173',
    )
      .trim()
      .replace(/\/+$/, '');
  }

  getMode(): 'LIVE' | 'SIMULATED' {
    return this.billingMode;
  }

  isLiveMode(): boolean {
    return this.billingMode === 'LIVE';
  }

  getHealth() {
    const stripeSecretConfigured = Boolean(this.stripe);
    const webhookSecretConfigured = Boolean(this.webhookSecret);
    const priceConfigured = Boolean(this.premiumPriceId);
    const appBaseUrlConfigured = Boolean(this.appBaseUrl);

    const missingEnv: string[] = [];
    if (this.billingMode === 'LIVE') {
      if (!stripeSecretConfigured) missingEnv.push('STRIPE_SECRET_KEY');
      if (!webhookSecretConfigured) missingEnv.push('STRIPE_WEBHOOK_SECRET');
      if (!priceConfigured) missingEnv.push('STRIPE_PRICE_ID_PREMIUM_MONTHLY');
      if (!appBaseUrlConfigured) missingEnv.push('APP_BASE_URL');
    }

    return {
      mode: this.billingMode,
      liveMode: this.billingMode === 'LIVE',
      stripeSecretConfigured,
      webhookSecretConfigured,
      priceConfigured,
      appBaseUrl: this.appBaseUrl || null,
      ready: missingEnv.length === 0,
      missingEnv,
    };
  }

  constructWebhookEvent(payload: Buffer, signature: string) {
    if (!this.stripe) {
      throw new Error(
        'STRIPE_SECRET_KEY is required for live Stripe webhook verification.',
      );
    }
    if (!this.webhookSecret) {
      throw new Error(
        'STRIPE_WEBHOOK_SECRET is required for live Stripe webhook verification.',
      );
    }
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }

  async retrieveSubscription(subscriptionId: string) {
    if (!this.stripe) return null;
    const id = subscriptionId.trim();
    if (!id) return null;
    return this.stripe.subscriptions.retrieve(id, {
      expand: ['latest_invoice'],
    });
  }

  async retrieveInvoice(invoiceId: string) {
    if (!this.stripe) return null;
    const id = invoiceId.trim();
    if (!id) return null;
    return this.stripe.invoices.retrieve(id, {
      expand: ['payment_intent'],
    });
  }

  getPremiumPriceId(): string | null {
    return this.premiumPriceId;
  }

  async createCheckoutSession(
    input: CheckoutSessionCreateInput,
  ): Promise<CheckoutSessionCreateResult> {
    if (this.billingMode === 'SIMULATED') {
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

    if (!this.stripe) {
      throw new Error(
        'BILLING_MODE=live but STRIPE_SECRET_KEY is missing. Set key or switch BILLING_MODE=simulated.',
      );
    }
    if (!this.premiumPriceId) {
      throw new Error(
        'BILLING_MODE=live requires STRIPE_PRICE_ID_PREMIUM_MONTHLY for hosted checkout sessions.',
      );
    }

    await this.validateLivePriceConfig(input);

    const successUrl =
      input.successUrl ??
      `${this.appBaseUrl}/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      input.cancelUrl ??
      `${this.appBaseUrl}/settings?checkout=cancel&session_id={CHECKOUT_SESSION_ID}`;

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: this.premiumPriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: input.paymentId,
      metadata: {
        paymentId: input.paymentId,
        userId: input.userId,
        planCode: input.planCode,
        expectedAmount: input.amount.toFixed(2),
        expectedCurrency: input.currency,
      },
    });

    const providerPaymentId =
      typeof session.subscription === 'string'
        ? session.subscription
        : typeof session.payment_intent === 'string'
          ? session.payment_intent
          : null;

    return {
      provider: 'STRIPE',
      checkoutSessionId: session.id,
      checkoutUrl: session.url ?? null,
      providerPaymentId,
      mode: 'LIVE',
    };
  }

  async resolveCheckoutSession(
    input: CheckoutSessionResolveInput,
  ): Promise<CheckoutSessionResolveResult> {
    if (this.billingMode === 'SIMULATED') {
      return this.devOutcome.resolveOutcome(
        input.checkoutSessionId,
        input.forcedOutcome,
      );
    }

    const nonce = Math.random().toString(36).slice(2, 10);
    return {
      provider: 'STRIPE',
      status: 'PENDING',
      providerPaymentId: `pi_pending_${nonce}_${input.checkoutSessionId.slice(0, 8)}`,
      errorCode: 'awaiting_webhook_confirmation',
      errorMessage:
        'Stripe checkout is pending webhook confirmation. Retry status refresh shortly.',
    };
  }

  private async validateLivePriceConfig(input: CheckoutSessionCreateInput) {
    if (!this.stripe || !this.premiumPriceId) {
      return;
    }

    const expectedCurrency = String(input.currency).toLowerCase();
    const expectedUnitAmount = Math.round(input.amount * 100);
    const fingerprint = `${this.premiumPriceId}:${expectedCurrency}:${expectedUnitAmount}`;
    if (this.validatedPriceFingerprint === fingerprint) {
      return;
    }

    const price = await this.stripe.prices.retrieve(this.premiumPriceId);
    if (price.deleted) {
      throw new Error(
        `Stripe price ${this.premiumPriceId} is deleted. Configure an active recurring price id.`,
      );
    }
    if (!price.active) {
      throw new Error(
        `Stripe price ${this.premiumPriceId} is not active. Activate it or set a different price id.`,
      );
    }
    if (!price.recurring) {
      throw new Error(
        `Stripe price ${this.premiumPriceId} is not recurring. PREMIUM checkout requires a recurring monthly price.`,
      );
    }
    if (price.unit_amount == null) {
      throw new Error(
        `Stripe price ${this.premiumPriceId} has no fixed unit_amount. Use a fixed recurring price for PREMIUM.`,
      );
    }

    const providerCurrency = String(price.currency ?? '').toLowerCase();
    const providerUnitAmount = Number(price.unit_amount);
    if (
      providerCurrency !== expectedCurrency ||
      providerUnitAmount !== expectedUnitAmount
    ) {
      throw new Error(
        `Stripe price mismatch for PREMIUM. Local=${input.amount.toFixed(2)} ${String(
          input.currency,
        ).toUpperCase()}, Stripe=${(providerUnitAmount / 100).toFixed(
          2,
        )} ${providerCurrency.toUpperCase()} (price id ${this.premiumPriceId}).`,
      );
    }

    this.validatedPriceFingerprint = fingerprint;
  }
}
