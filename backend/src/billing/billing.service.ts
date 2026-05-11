import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
import { ForcedCheckoutOutcome } from './payment-provider.interface.js';
import { PaymentProviderRegistry } from './payment-provider.registry.js';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: PaymentProviderRegistry,
  ) {}

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
          failureMessage: error instanceof Error ? error.message : 'Unknown error',
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

    const provider = this.providerRegistry.resolveActiveProvider();
    const resolution = await provider.resolveCheckoutSession({
      checkoutSessionId,
      forcedOutcome,
    });

    const nextPaymentStatus: PaymentStatus =
      resolution.status === 'SUCCEEDED'
        ? 'SUCCEEDED'
        : resolution.status === 'CANCELED'
          ? 'CANCELED'
          : 'FAILED';

    const updatedPayment = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: resolution.providerPaymentId ?? payment.providerPaymentId,
        status: nextPaymentStatus,
        failureCode:
          nextPaymentStatus === 'SUCCEEDED' ? null : (resolution.errorCode ?? 'checkout_failed'),
        failureMessage:
          nextPaymentStatus === 'SUCCEEDED'
            ? null
            : (resolution.errorMessage ?? 'Checkout failed.'),
      },
    });

    if (resolution.status === 'SUCCEEDED') {
      const subscription = await this.activatePremiumSubscription(userId, payment.planId, {
        provider: updatedPayment.provider,
        providerSubscriptionId:
          resolution.providerPaymentId ?? updatedPayment.providerPaymentId ?? undefined,
      });

      await this.prisma.payment.update({
        where: { id: updatedPayment.id },
        data: { subscriptionId: subscription.id },
      });

      return {
        checkoutSessionId,
        paymentStatus: 'SUCCEEDED',
        subscriptionStatus: subscription.status,
        planCode: subscription.plan.code,
      };
    }

    const current = await this.getCurrentSubscriptionForUser(userId);
    return {
      checkoutSessionId,
      paymentStatus: updatedPayment.status,
      subscriptionStatus: current.status,
      planCode: current.plan.code,
      errorCode: updatedPayment.failureCode,
      errorMessage: updatedPayment.failureMessage,
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
        amount: Number(payment.amount),
        currency: payment.currency,
        planCode: payment.plan.code,
        createdAt: payment.createdAt,
        errorCode: payment.failureCode,
        errorMessage: payment.failureMessage,
      })),
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
      startedAt.getTime() + BILLING_DEFAULTS.PREMIUM_BILLING_DAYS * 24 * 60 * 60 * 1000,
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
    if (user.role === 'ADMIN') return;

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

  private toMoney(value: number): Prisma.Decimal {
    return new Prisma.Decimal(value.toFixed(2));
  }
}
