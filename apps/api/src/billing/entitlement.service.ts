import { ForbiddenException, Injectable } from '@nestjs/common';
import { PlanCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { FEATURE_CODES, FeatureCode } from './billing.constants.js';
import { BillingService } from './billing.service.js';

type EntitlementRow = {
  featureCode: string;
  isEnabled: boolean;
  limitValue: number | null;
};

const DEFAULT_ENTITLEMENTS: Record<PlanCode, EntitlementRow[]> = {
  FREE: [
    {
      featureCode: FEATURE_CODES.BASIC_ANALYSIS,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.EXPANDED_JOB_MATCHING,
      isEnabled: false,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.JOB_SPECIFIC_ANALYSIS,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.AI_CV_RECOMMENDATIONS,
      isEnabled: false,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.AI_DETAILED_REPORT,
      isEnabled: false,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.PDF_EXPORT,
      isEnabled: false,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.FULL_KNOWLEDGE_BASE,
      isEnabled: false,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.ANALYSIS_HISTORY,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.SUPPORT_CHAT,
      isEnabled: false,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.JOB_MATCH_LIMIT,
      isEnabled: true,
      limitValue: 3,
    },
  ],
  PREMIUM: [
    {
      featureCode: FEATURE_CODES.BASIC_ANALYSIS,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.EXPANDED_JOB_MATCHING,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.JOB_SPECIFIC_ANALYSIS,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.AI_CV_RECOMMENDATIONS,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.AI_DETAILED_REPORT,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.PDF_EXPORT,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.FULL_KNOWLEDGE_BASE,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.ANALYSIS_HISTORY,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.SUPPORT_CHAT,
      isEnabled: true,
      limitValue: null,
    },
    {
      featureCode: FEATURE_CODES.JOB_MATCH_LIMIT,
      isEnabled: true,
      limitValue: 20,
    },
  ],
};

@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingService: BillingService,
  ) {}

  async canUse(userId: string, featureCode: FeatureCode) {
    const { planCode, entitlement } = await this.resolveFeature(
      userId,
      featureCode,
    );
    if (!entitlement?.isEnabled) {
      return {
        allowed: false,
        featureCode,
        planCode,
        reason: `Feature ${featureCode} requires PREMIUM plan.`,
        requiredPlan: 'PREMIUM' as const,
      };
    }

    return {
      allowed: true,
      featureCode,
      planCode,
      reason: null,
      requiredPlan: null,
    };
  }

  async getLimit(
    userId: string,
    featureCode: FeatureCode,
  ): Promise<number | null> {
    const { entitlement } = await this.resolveFeature(userId, featureCode);
    return entitlement?.limitValue ?? null;
  }

  async assertFeatureAccess(userId: string, featureCode: FeatureCode) {
    const decision = await this.canUse(userId, featureCode);
    if (!decision.allowed) {
      throw new ForbiddenException({
        code: 'UPGRADE_REQUIRED',
        message: decision.reason,
        featureCode,
        currentPlan: decision.planCode,
        requiredPlan: decision.requiredPlan,
      });
    }
  }

  async getEntitlementsSnapshot(userId: string) {
    const subscription =
      await this.billingService.getCurrentSubscriptionForUser(userId);
    const planCode = subscription.plan.code;
    const rows = await this.getEntitlementsForPlan(
      subscription.plan.id,
      planCode,
    );
    const byFeature = Object.fromEntries(
      rows.map((row) => [
        row.featureCode,
        {
          enabled: row.isEnabled,
          limit: row.limitValue,
        },
      ]),
    );

    return {
      planCode,
      features: byFeature,
    };
  }

  private async resolveFeature(userId: string, featureCode: FeatureCode) {
    const subscription =
      await this.billingService.getCurrentSubscriptionForUser(userId);
    const planCode = subscription.plan.code;
    const rows = await this.getEntitlementsForPlan(
      subscription.plan.id,
      planCode,
    );
    const entitlement =
      rows.find((row) => row.featureCode === featureCode) ?? null;
    return {
      planCode,
      entitlement,
    };
  }

  private async getEntitlementsForPlan(planId: string, planCode: PlanCode) {
    const rows = await this.prisma.featureEntitlement.findMany({
      where: { planId },
      select: {
        featureCode: true,
        isEnabled: true,
        limitValue: true,
      },
    });
    if (rows.length > 0) {
      return rows;
    }
    return DEFAULT_ENTITLEMENTS[planCode];
  }
}
