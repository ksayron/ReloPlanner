import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  PaymentStatus,
  PlanCode,
  Prisma,
  Role,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { BILLING_DEFAULTS } from './billing.constants.js';
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';
import {
  CheckoutSessionResolveResult,
  ForcedCheckoutOutcome,
} from './payment-provider.interface.js';
import { PaymentProviderRegistry } from './payment-provider.registry.js';
import { StripePaymentProvider } from './providers/stripe-payment.provider.js';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly webhookVerbose: boolean;
  private readonly processedStripeEvents = new Map<string, number>();
  private readonly currencyRatesToUsd: Record<string, number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: PaymentProviderRegistry,
    private readonly stripeProvider: StripePaymentProvider,
    private readonly config: ConfigService,
  ) {
    const verbose = String(
      this.config.get<string>('BILLING_WEBHOOK_VERBOSE') ?? 'false',
    )
      .trim()
      .toLowerCase();
    this.webhookVerbose = verbose === 'true' || verbose === '1';
    this.currencyRatesToUsd = this.getCurrencyRatesToUsd();
  }

  async startCheckout(userId: string, dto: CreateCheckoutDto) {
    const planCode = dto.planCode as PlanCode;
    if (planCode !== 'PREMIUM') {
      throw new BadRequestException('Only PREMIUM checkout is supported.');
    }

    await this.ensureCorePlans();
    const plan = await this.requirePlanByCode(planCode);
    const current = await this.getCurrentSubscriptionForUser(userId);
    if (current.plan.code === 'PREMIUM' && current.status === 'ACTIVE') {
      throw new BadRequestException('Premium subscription is already active.');
    }

    const provider = this.providerRegistry.resolveActiveProvider();
    const placeholderSessionId = `pending_${randomUUID().replaceAll('-', '')}`;
    const amountNumber = Number(plan.price);

    const payment = await this.prisma.payment.create({
      data: {
        userId,
        planId: plan.id,
        provider: provider.provider,
        providerCheckoutSessionId: placeholderSessionId,
        providerPaymentId: null,
        amount: this.toMoney(amountNumber),
        currency: plan.currency,
        status: 'PENDING',
        metadata: {
          successUrl: dto.successUrl ?? null,
          cancelUrl: dto.cancelUrl ?? null,
        },
      },
    });

    try {
      const created = await provider.createCheckoutSession({
        paymentId: payment.id,
        userId,
        planCode: plan.code,
        amount: amountNumber,
        currency: plan.currency,
        successUrl: dto.successUrl ?? null,
        cancelUrl: dto.cancelUrl ?? null,
      });

      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerCheckoutSessionId: created.checkoutSessionId,
          providerPaymentId: created.providerPaymentId,
          metadata: {
            ...(payment.metadata as Record<string, unknown> | null),
            providerMode: created.mode,
            checkoutUrl: created.checkoutUrl,
          },
        },
      });

      return {
        paymentId: updatedPayment.id,
        provider: created.provider,
        mode: created.mode,
        checkoutSessionId: created.checkoutSessionId,
        checkoutUrl: created.checkoutUrl,
        status: updatedPayment.status,
        amount: Number(updatedPayment.amount),
        currency: updatedPayment.currency,
      };
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureCode: 'checkout_session_creation_failed',
          failureMessage:
            error instanceof Error ? error.message : 'Unknown error',
        },
      });
      throw error;
    }
  }

  async resolveCheckoutSession(
    userId: string,
    checkoutSessionId: string,
    forcedOutcome?: ForcedCheckoutOutcome,
  ) {
    await this.ensureCorePlans();
    const payment = await this.prisma.payment.findFirst({
      where: {
        userId,
        providerCheckoutSessionId: checkoutSessionId,
      },
      include: { plan: true },
    });
    if (!payment) {
      throw new NotFoundException('Checkout session not found');
    }

    if (payment.status === 'SUCCEEDED') {
      const current = await this.getCurrentSubscriptionForUser(userId);
      return {
        checkoutSessionId: payment.providerCheckoutSessionId,
        paymentStatus: payment.status,
        subscriptionStatus: current.status,
        planCode: current.plan.code,
      };
    }

    if (this.stripeProvider.isLiveMode()) {
      if (forcedOutcome) {
        throw new BadRequestException(
          'Forced checkout outcomes are available only in simulated billing mode.',
        );
      }
      const current = await this.getCurrentSubscriptionForUser(userId);
      return {
        checkoutSessionId,
        paymentStatus: payment.status,
        subscriptionStatus: current.status,
        planCode: current.plan.code,
        errorCode: payment.failureCode,
        errorMessage:
          payment.status === 'PENDING'
            ? 'Awaiting Stripe webhook confirmation.'
            : payment.failureMessage,
      };
    }

    const provider = this.providerRegistry.resolveActiveProvider();
    const resolution = await provider.resolveCheckoutSession({
      checkoutSessionId,
      forcedOutcome,
    });

    const outcome = await this.applyResolutionToPayment({
      paymentId: payment.id,
      checkoutSessionId,
      userId,
      planId: payment.planId,
      resolution,
    });
    if (outcome) {
      return outcome;
    }

    const refreshedPayment = await this.prisma.payment.findUnique({
      where: { id: payment.id },
    });
    const current = await this.getCurrentSubscriptionForUser(userId);
    return {
      checkoutSessionId,
      paymentStatus: refreshedPayment?.status ?? payment.status,
      subscriptionStatus: current.status,
      planCode: current.plan.code,
      errorCode: refreshedPayment?.failureCode ?? payment.failureCode,
      errorMessage: refreshedPayment?.failureMessage ?? payment.failureMessage,
    };
  }

  async getCurrentSubscriptionForUser(userId: string) {
    await this.ensureCorePlans();
    await this.expireStaleSubscriptions(userId);
    let subscription = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { plan: true },
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (!subscription) {
      const freePlan = await this.requirePlanByCode('FREE');
      subscription = await this.prisma.subscription.create({
        data: {
          userId,
          planId: freePlan.id,
          status: 'ACTIVE',
          provider: 'STRIPE',
        },
        include: { plan: true },
      });
    }

    await this.syncUserRoleToPlan(userId, subscription.plan.code);
    return subscription;
  }

  async getBillingStatus(userId: string) {
    const subscription = await this.getCurrentSubscriptionForUser(userId);
    const recentPayments = await this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { plan: true },
    });

    return {
      plan: {
        code: subscription.plan.code,
        name: subscription.plan.name,
      },
      subscription: {
        id: subscription.id,
        status: subscription.status,
        startedAt: subscription.startedAt,
        expiresAt: subscription.expiresAt,
        provider: subscription.provider,
      },
      payments: recentPayments.map((payment) => ({
        id: payment.id,
        status: payment.status,
        amount: payment.providerCheckoutSessionId.startsWith('invoice_')
          ? Number(payment.plan.price)
          : Number(payment.amount),
        currency: payment.providerCheckoutSessionId.startsWith('invoice_')
          ? payment.plan.currency
          : payment.currency,
        planCode: payment.plan.code,
        createdAt: payment.createdAt,
        errorCode: payment.failureCode,
        errorMessage: payment.failureMessage,
      })),
    };
  }

  async getPlanSummary(userId: string) {
    await this.ensureCorePlans();
    const [status, currentSubscription, premiumPlan, preferences] =
      await Promise.all([
        this.getBillingStatus(userId),
        this.getCurrentSubscriptionForUser(userId),
        this.requirePlanByCode('PREMIUM'),
        this.prisma.userPreference.findUnique({
          where: { userId },
          select: { preferredCurrency: true },
        }),
      ]);

    const preferredCurrency = (preferences?.preferredCurrency ?? 'USD') as
      | 'USD'
      | 'EUR'
      | 'GBP'
      | 'CAD'
      | 'PLN'
      | 'UAH';

    const premiumPriceUsd = this.convertToUsd(
      Number(premiumPlan.price),
      premiumPlan.currency,
    );
    const premiumPricePreferred = this.convertUsdToCurrency(
      premiumPriceUsd,
      preferredCurrency,
    );

    let stripeSubscription: Record<string, unknown> | null = null;
    if (
      this.stripeProvider.isLiveMode() &&
      currentSubscription.providerSubscriptionId
    ) {
      const stripeSub = await this.stripeProvider.retrieveSubscription(
        currentSubscription.providerSubscriptionId,
      );
      if (stripeSub) {
        const latestInvoice =
          typeof stripeSub.latest_invoice === 'string'
            ? { id: stripeSub.latest_invoice }
            : stripeSub.latest_invoice
              ? {
                  id: stripeSub.latest_invoice.id,
                  status: stripeSub.latest_invoice.status,
                  hostedInvoiceUrl: stripeSub.latest_invoice.hosted_invoice_url,
                }
              : null;
        const currentPeriodEnd =
          this.resolveSubscriptionCurrentPeriodEnd(stripeSub);

        stripeSubscription = {
          id: stripeSub.id,
          status: stripeSub.status,
          cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
          currentPeriodEnd: currentPeriodEnd
            ? new Date(currentPeriodEnd * 1000).toISOString()
            : null,
          canceledAt: stripeSub.canceled_at
            ? new Date(stripeSub.canceled_at * 1000).toISOString()
            : null,
          latestInvoice,
        };
      }
    }

    return {
      plan: status.plan,
      subscription: status.subscription,
      payments: status.payments,
      preferredCurrency,
      premiumPricing: {
        stripePriceId: this.stripeProvider.getPremiumPriceId(),
        basePriceUsd: this.roundCurrency(premiumPriceUsd),
        convertedPrice: this.roundCurrency(premiumPricePreferred),
        convertedCurrency: preferredCurrency,
      },
      stripe: {
        mode: this.stripeProvider.getMode(),
        subscription: stripeSubscription,
      },
    };
  }

  getStripeHealth() {
    const providerHealth = this.stripeProvider.getHealth();
    return {
      provider: 'STRIPE',
      ...providerHealth,
      webhookEndpoint: '/api/billing/webhooks/stripe',
    };
  }

  async processStripeWebhook(rawBody: Buffer, signature: string) {
    if (!this.stripeProvider.isLiveMode()) {
      return { received: true, mode: 'SIMULATED', ignored: true };
    }

    const event = this.stripeProvider.constructWebhookEvent(rawBody, signature);
    const eventType = event.type;
    const eventId = event.id;

    if (!this.shouldProcessStripeEvent(eventId)) {
      return { received: true, duplicate: true, eventType };
    }

    if (eventType === 'checkout.session.completed') {
      const session = event.data.object as {
        id: string;
        payment_intent?: string | null;
        subscription?: string | null;
        payment_status?: string | null;
        status?: string | null;
      };
      await this.resolveFromCheckoutSessionEvent({
        checkoutSessionId: session.id,
        providerPaymentId:
          session.subscription ?? session.payment_intent ?? null,
        status:
          session.status === 'complete' &&
          (session.payment_status === 'paid' ||
            session.payment_status === 'no_payment_required')
            ? 'SUCCEEDED'
            : 'PENDING',
      });
      return { received: true, eventType };
    }

    if (eventType === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as {
        id: string;
        payment_intent?: string | null;
      };
      await this.resolveFromCheckoutSessionEvent({
        checkoutSessionId: session.id,
        providerPaymentId: session.payment_intent ?? null,
        status: 'SUCCEEDED',
      });
      return { received: true, eventType };
    }

    if (eventType === 'checkout.session.async_payment_failed') {
      const session = event.data.object as {
        id: string;
        payment_intent?: string | null;
      };
      await this.resolveFromCheckoutSessionEvent({
        checkoutSessionId: session.id,
        providerPaymentId: session.payment_intent ?? null,
        status: 'FAILED',
        errorCode: 'async_payment_failed',
        errorMessage: 'Stripe reported asynchronous payment failure.',
      });
      return { received: true, eventType };
    }

    if (eventType === 'checkout.session.expired') {
      const session = event.data.object as { id: string };
      await this.resolveFromCheckoutSessionEvent({
        checkoutSessionId: session.id,
        providerPaymentId: null,
        status: 'CANCELED',
        errorCode: 'checkout_session_expired',
        errorMessage: 'Stripe checkout session expired before completion.',
      });
      return { received: true, eventType };
    }

    if (eventType === 'customer.subscription.updated') {
      const stripeSubscription = event.data.object as {
        id: string;
        status?: string | null;
        current_period_end?: number | null;
        cancel_at_period_end?: boolean | null;
        canceled_at?: number | null;
      };
      await this.syncLocalSubscriptionFromStripe(stripeSubscription);
      return { received: true, eventType };
    }

    if (eventType === 'customer.subscription.deleted') {
      const stripeSubscription = event.data.object as {
        id: string;
        status?: string | null;
        current_period_end?: number | null;
        cancel_at_period_end?: boolean | null;
        canceled_at?: number | null;
      };
      await this.syncLocalSubscriptionFromStripe({
        ...stripeSubscription,
        status: stripeSubscription.status ?? 'canceled',
      });
      return { received: true, eventType };
    }

    if (
      eventType === 'invoice.paid' ||
      eventType === 'invoice.payment_succeeded' ||
      eventType === 'invoice_payment.paid'
    ) {
      await this.handleInvoiceSuccessEvent(
        event.data.object as unknown as Record<string, unknown>,
      );
      return { received: true, eventType };
    }

    if (eventType === 'invoice.payment_failed') {
      await this.handleInvoiceFailureEvent(
        event.data.object as unknown as Record<string, unknown>,
      );
      return { received: true, eventType };
    }

    if (eventType === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as {
        id: string;
        last_payment_error?: {
          code?: string | null;
          message?: string | null;
        } | null;
      };
      await this.resolveFromPaymentIntentFailure(
        paymentIntent.id,
        paymentIntent.last_payment_error?.code ?? 'payment_intent_failed',
        paymentIntent.last_payment_error?.message ??
          'Stripe payment intent failed.',
      );
      return { received: true, eventType };
    }

    this.logIgnoredStripeEvent(eventType);
    return { received: true, eventType, ignored: true };
  }

  private shouldProcessStripeEvent(eventId: string): boolean {
    const now = Date.now();
    const expiryMs = 1000 * 60 * 60;

    for (const [id, processedAt] of this.processedStripeEvents) {
      if (now - processedAt > expiryMs) {
        this.processedStripeEvents.delete(id);
      }
    }

    if (this.processedStripeEvents.has(eventId)) {
      return false;
    }
    this.processedStripeEvents.set(eventId, now);
    return true;
  }

  private logIgnoredStripeEvent(eventType: string) {
    if (this.webhookVerbose) {
      this.logger.debug(`Ignored Stripe webhook event: ${eventType}`);
    }
  }

  private async syncLocalSubscriptionFromStripe(input: {
    id: string;
    status?: string | null;
    current_period_end?: number | null;
    cancel_at_period_end?: boolean | null;
    canceled_at?: number | null;
  }) {
    const local = await this.prisma.subscription.findFirst({
      where: { providerSubscriptionId: input.id },
    });
    if (!local) {
      this.logger.warn(
        `Stripe webhook referenced unknown subscription: ${input.id}`,
      );
      return;
    }

    const mappedStatus = this.mapStripeSubscriptionStatus(input.status);
    const periodEnd = input.current_period_end
      ? new Date(input.current_period_end * 1000)
      : local.expiresAt;
    const canceledAt = input.canceled_at
      ? new Date(input.canceled_at * 1000)
      : input.cancel_at_period_end && periodEnd
        ? periodEnd
        : mappedStatus === 'ACTIVE'
          ? null
          : local.canceledAt;

    await this.prisma.subscription.update({
      where: { id: local.id },
      data: {
        status: mappedStatus,
        expiresAt: periodEnd,
        canceledAt,
      },
    });

    if (mappedStatus !== 'ACTIVE') {
      await this.getCurrentSubscriptionForUser(local.userId);
    }
  }

  private mapStripeSubscriptionStatus(
    status: string | null | undefined,
  ): SubscriptionStatus {
    const normalized = String(status ?? '').toLowerCase();
    if (normalized === 'active' || normalized === 'trialing') {
      return 'ACTIVE';
    }
    if (normalized === 'canceled') {
      return 'CANCELED';
    }
    if (normalized === 'incomplete_expired') {
      return 'EXPIRED';
    }
    return 'INACTIVE';
  }

  private async handleInvoiceSuccessEvent(
    invoicePayload: Record<string, unknown>,
  ) {
    const normalized = await this.normalizeInvoicePayload(invoicePayload);
    if (!normalized) {
      return;
    }
    await this.upsertInvoicePayment({
      invoiceId: normalized.invoiceId,
      subscriptionId: normalized.subscriptionId,
      amountMinor: normalized.amountPaidMinor,
      currency: normalized.currency,
      status: 'SUCCEEDED',
      failureCode: null,
      failureMessage: null,
    });
  }

  private async handleInvoiceFailureEvent(
    invoicePayload: Record<string, unknown>,
  ) {
    const normalized = await this.normalizeInvoicePayload(invoicePayload);
    if (!normalized) {
      return;
    }
    await this.upsertInvoicePayment({
      invoiceId: normalized.invoiceId,
      subscriptionId: normalized.subscriptionId,
      amountMinor: normalized.amountDueMinor,
      currency: normalized.currency,
      status: 'FAILED',
      failureCode: 'invoice_payment_failed',
      failureMessage: 'Stripe invoice payment failed.',
    });
  }

  private async normalizeInvoicePayload(payload: Record<string, unknown>) {
    const payloadObject = String(payload.object ?? '');
    let invoice = payload;

    if (payloadObject !== 'invoice') {
      const nested = payload.invoice;
      if (nested && typeof nested === 'object') {
        invoice = nested as Record<string, unknown>;
      } else if (typeof nested === 'string') {
        const fetched = await this.stripeProvider.retrieveInvoice(nested);
        if (!fetched) {
          this.logger.warn(
            `Stripe webhook referenced unknown invoice: ${nested}`,
          );
          return null;
        }
        invoice = fetched as unknown as Record<string, unknown>;
      }
    }

    const invoiceId = String(invoice.id ?? '').trim();
    const subscriptionId = String(invoice.subscription ?? '').trim();
    if (!invoiceId || !subscriptionId) {
      return null;
    }

    const amountPaidMinor = Number(invoice.amount_paid ?? 0);
    const amountDueMinor = Number(invoice.amount_due ?? amountPaidMinor);
    const currency = String(invoice.currency ?? 'usd').toUpperCase();

    return {
      invoiceId,
      subscriptionId,
      amountPaidMinor: Number.isFinite(amountPaidMinor) ? amountPaidMinor : 0,
      amountDueMinor: Number.isFinite(amountDueMinor) ? amountDueMinor : 0,
      currency,
    };
  }

  private async upsertInvoicePayment(input: {
    invoiceId: string;
    subscriptionId: string;
    amountMinor: number;
    currency: string;
    status: PaymentStatus;
    failureCode: string | null;
    failureMessage: string | null;
  }) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { providerSubscriptionId: input.subscriptionId },
      include: {
        plan: {
          select: {
            price: true,
            currency: true,
          },
        },
      },
    });
    if (!subscription) {
      this.logger.warn(
        `Stripe invoice event referenced unknown subscription: ${input.subscriptionId}`,
      );
      return;
    }

    await this.syncLocalSubscriptionFromStripe({
      id: input.subscriptionId,
      status: input.status === 'SUCCEEDED' ? 'active' : 'past_due',
    });

    const syntheticCheckoutSessionId = `invoice_${input.invoiceId}`;
    const providerAmount = this.toMoney(Math.max(0, input.amountMinor) / 100);
    const providerCurrency = this.normalizeCurrencyCode(
      input.currency,
      subscription.plan.currency,
    );
    const localAmount = this.toMoney(Number(subscription.plan.price));
    const localCurrency = subscription.plan.currency;
    const hasAmountDrift = !providerAmount.equals(localAmount);
    const hasCurrencyDrift = providerCurrency !== localCurrency;
    const hasPriceDrift = hasAmountDrift || hasCurrencyDrift;

    if (hasPriceDrift) {
      this.logger.warn(
        `Stripe invoice/local price drift for ${input.invoiceId}: provider=${providerAmount.toFixed(
          2,
        )} ${providerCurrency}, local=${localAmount.toFixed(2)} ${localCurrency}`,
      );
    }

    const existing = await this.prisma.payment.findFirst({
      where: { providerCheckoutSessionId: syntheticCheckoutSessionId },
    });

    const metadataBase = existing?.metadata as Record<string, unknown> | null;
    const nextMetadata = {
      ...(metadataBase ?? {}),
      source: 'stripe_invoice',
      stripeInvoiceId: input.invoiceId,
      stripeSubscriptionId: input.subscriptionId,
      stripeAmount: {
        amount: Number(providerAmount),
        currency: providerCurrency,
      },
      localAmount: {
        amount: Number(localAmount),
        currency: localCurrency,
      },
      hasPriceDrift,
    };

    if (existing) {
      await this.prisma.payment.update({
        where: { id: existing.id },
        data: {
          providerPaymentId: input.subscriptionId,
          subscriptionId: subscription.id,
          amount: localAmount,
          currency: localCurrency,
          status: input.status,
          failureCode: input.failureCode,
          failureMessage: input.failureMessage,
          metadata: nextMetadata,
        },
      });
      return;
    }

    await this.prisma.payment.create({
      data: {
        userId: subscription.userId,
        planId: subscription.planId,
        subscriptionId: subscription.id,
        provider: 'STRIPE',
        providerPaymentId: input.subscriptionId,
        providerCheckoutSessionId: syntheticCheckoutSessionId,
        amount: localAmount,
        currency: localCurrency,
        status: input.status,
        failureCode: input.failureCode,
        failureMessage: input.failureMessage,
        metadata: nextMetadata,
      },
    });
  }

  private async resolveFromCheckoutSessionEvent(input: {
    checkoutSessionId: string;
    providerPaymentId: string | null;
    status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
    errorCode?: string;
    errorMessage?: string;
  }) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerCheckoutSessionId: input.checkoutSessionId },
    });
    if (!payment) {
      this.logger.warn(
        `Stripe webhook referenced unknown checkout session: ${input.checkoutSessionId}`,
      );
      return;
    }

    await this.applyResolutionToPayment({
      paymentId: payment.id,
      checkoutSessionId: input.checkoutSessionId,
      userId: payment.userId,
      planId: payment.planId,
      resolution: {
        provider: 'STRIPE',
        status: input.status,
        providerPaymentId: input.providerPaymentId,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      },
    });
  }

  private async resolveFromPaymentIntentFailure(
    providerPaymentId: string,
    errorCode: string,
    errorMessage: string,
  ) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerPaymentId },
    });
    if (!payment) {
      this.logger.warn(
        `Stripe webhook referenced unknown payment intent: ${providerPaymentId}`,
      );
      return;
    }

    await this.applyResolutionToPayment({
      paymentId: payment.id,
      checkoutSessionId: payment.providerCheckoutSessionId,
      userId: payment.userId,
      planId: payment.planId,
      resolution: {
        provider: 'STRIPE',
        status: 'FAILED',
        providerPaymentId,
        errorCode,
        errorMessage,
      },
    });
  }

  private async applyResolutionToPayment(input: {
    paymentId: string;
    checkoutSessionId: string;
    userId: string;
    planId: string;
    resolution: CheckoutSessionResolveResult;
  }) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: input.paymentId },
    });
    if (!payment) {
      return null;
    }

    if (payment.status === 'SUCCEEDED') {
      const current = await this.getCurrentSubscriptionForUser(input.userId);
      return {
        checkoutSessionId: input.checkoutSessionId,
        paymentStatus: payment.status,
        subscriptionStatus: current.status,
        planCode: current.plan.code,
      };
    }

    if (input.resolution.status === 'PENDING') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId:
            input.resolution.providerPaymentId ?? payment.providerPaymentId,
        },
      });
      return null;
    }

    const nextPaymentStatus: PaymentStatus =
      input.resolution.status === 'SUCCEEDED'
        ? 'SUCCEEDED'
        : input.resolution.status === 'CANCELED'
          ? 'CANCELED'
          : 'FAILED';

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId:
          input.resolution.providerPaymentId ?? payment.providerPaymentId,
        status: nextPaymentStatus,
        failureCode:
          nextPaymentStatus === 'SUCCEEDED'
            ? null
            : (input.resolution.errorCode ?? 'checkout_failed'),
        failureMessage:
          nextPaymentStatus === 'SUCCEEDED'
            ? null
            : (input.resolution.errorMessage ?? 'Checkout failed.'),
      },
    });

    if (nextPaymentStatus !== 'SUCCEEDED') {
      return null;
    }

    const subscription = await this.activatePremiumSubscription(
      input.userId,
      input.planId,
      {
        provider: updatedPayment.provider,
        providerSubscriptionId: updatedPayment.providerPaymentId ?? undefined,
      },
    );

    await this.prisma.payment.update({
      where: { id: updatedPayment.id },
      data: { subscriptionId: subscription.id },
    });

    return {
      checkoutSessionId: input.checkoutSessionId,
      paymentStatus: 'SUCCEEDED' as const,
      subscriptionStatus: subscription.status,
      planCode: subscription.plan.code,
    };
  }

  private async activatePremiumSubscription(
    userId: string,
    planId: string,
    input: {
      provider: 'STRIPE';
      providerSubscriptionId?: string;
    },
  ) {
    await this.expireStaleSubscriptions(userId);
    await this.prisma.subscription.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      data: {
        status: 'INACTIVE',
        canceledAt: new Date(),
      },
    });

    const startedAt = new Date();
    const expiresAt = new Date(
      startedAt.getTime() +
        BILLING_DEFAULTS.PREMIUM_BILLING_DAYS * 24 * 60 * 60 * 1000,
    );

    const created = await this.prisma.subscription.create({
      data: {
        userId,
        planId,
        status: 'ACTIVE',
        startedAt,
        expiresAt,
        provider: input.provider,
        providerSubscriptionId:
          input.providerSubscriptionId ?? `stripe_sub_${randomUUID()}`,
      },
      include: { plan: true },
    });

    await this.syncUserRoleToPlan(userId, created.plan.code);
    return created;
  }

  private async expireStaleSubscriptions(userId: string) {
    await this.prisma.subscription.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: {
          not: null,
          lte: new Date(),
        },
      },
      data: {
        status: 'EXPIRED',
      },
    });
  }

  private async syncUserRoleToPlan(userId: string, planCode: PlanCode) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) return;
    if (user.role === 'ADMIN' || user.role === 'SPECIALIST') return;

    const nextRole: Role = planCode === 'PREMIUM' ? 'PREMIUM' : 'USER';
    if (user.role !== nextRole) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { role: nextRole },
      });
    }
  }

  private async ensureCorePlans() {
    const free = await this.prisma.plan.findUnique({
      where: { code: 'FREE' },
      select: { id: true },
    });
    if (!free) {
      await this.prisma.plan.create({
        data: {
          code: 'FREE',
          name: 'Free',
          price: this.toMoney(0),
          currency: 'USD',
          billingPeriod: 'MONTHLY',
          isActive: true,
        },
      });
    }

    const premium = await this.prisma.plan.findUnique({
      where: { code: 'PREMIUM' },
      select: { id: true },
    });
    if (!premium) {
      await this.prisma.plan.create({
        data: {
          code: 'PREMIUM',
          name: 'Premium',
          price: this.toMoney(19.99),
          currency: 'USD',
          billingPeriod: 'MONTHLY',
          isActive: true,
        },
      });
    }
  }

  private async requirePlanByCode(code: PlanCode) {
    const plan = await this.prisma.plan.findUnique({
      where: { code },
    });
    if (!plan) {
      throw new NotFoundException(`Plan ${code} is not configured.`);
    }
    if (!plan.isActive) {
      throw new BadRequestException(`Plan ${code} is not active.`);
    }
    return plan;
  }

  private resolveSubscriptionCurrentPeriodEnd(subscription: {
    items?: { data?: Array<{ current_period_end?: number | null }> } | null;
  }) {
    const items = subscription.items?.data ?? [];
    const candidate = items
      .map((item) => Number(item.current_period_end ?? 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (candidate.length === 0) {
      return null;
    }
    return Math.min(...candidate);
  }

  private getCurrencyRatesToUsd() {
    const defaults: Record<string, number> = {
      USD: 1,
      EUR: 1.08,
      GBP: 1.27,
      CAD: 0.74,
      PLN: 0.26,
      UAH: 0.025,
    };

    const raw = this.config.get<string>('FINANCIAL_CURRENCY_RATES_TO_USD');
    if (!raw) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, number>;
      const merged = { ...defaults };
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          merged[key.toUpperCase()] = value;
        }
      }
      return merged;
    } catch {
      return defaults;
    }
  }

  private normalizeCurrencyCode(candidate: string, fallback: string) {
    const normalized = String(candidate).trim().toUpperCase();
    if (this.currencyRatesToUsd[normalized]) {
      return normalized as 'USD' | 'EUR' | 'GBP' | 'CAD' | 'PLN' | 'UAH';
    }
    const fallbackNormalized = String(fallback).trim().toUpperCase();
    if (this.currencyRatesToUsd[fallbackNormalized]) {
      return fallbackNormalized as
        | 'USD'
        | 'EUR'
        | 'GBP'
        | 'CAD'
        | 'PLN'
        | 'UAH';
    }
    return 'USD';
  }

  private convertToUsd(amount: number, currency: string) {
    const normalized = this.normalizeCurrencyCode(currency, 'USD');
    const rate = this.currencyRatesToUsd[normalized] ?? 1;
    return amount * rate;
  }

  private convertUsdToCurrency(amountUsd: number, currency: string) {
    const normalized = this.normalizeCurrencyCode(currency, 'USD');
    const rate = this.currencyRatesToUsd[normalized] ?? 1;
    return rate > 0 ? amountUsd / rate : amountUsd;
  }

  private roundCurrency(value: number) {
    return Math.round(value * 100) / 100;
  }

  private toMoney(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value.toFixed(2));
  }
}
