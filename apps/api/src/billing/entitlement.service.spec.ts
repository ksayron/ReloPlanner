import { EntitlementService } from './entitlement.service.js';
import { FEATURE_CODES } from './billing.constants.js';

describe('EntitlementService', () => {
  let service: EntitlementService;
  let prisma: {
    featureEntitlement: {
      findMany: jest.Mock;
    };
  };
  let billingService: {
    getCurrentSubscriptionForUser: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      featureEntitlement: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    billingService = {
      getCurrentSubscriptionForUser: jest.fn(),
    };
    service = new EntitlementService(prisma as never, billingService as never);
  });

  it('uses fallback free-tier entitlements when db rows are missing', async () => {
    billingService.getCurrentSubscriptionForUser.mockResolvedValue({
      id: 'sub-free',
      status: 'ACTIVE',
      plan: {
        id: 'plan-free',
        code: 'FREE',
      },
    });

    const allowed = await service.canUse('user-1', FEATURE_CODES.BASIC_ANALYSIS);
    const denied = await service.canUse('user-1', FEATURE_CODES.PDF_EXPORT);
    const limit = await service.getLimit('user-1', FEATURE_CODES.JOB_MATCH_LIMIT);

    expect(allowed.allowed).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(limit).toBe(3);
  });

  it('uses fallback premium-tier entitlements when db rows are missing', async () => {
    billingService.getCurrentSubscriptionForUser.mockResolvedValue({
      id: 'sub-premium',
      status: 'ACTIVE',
      plan: {
        id: 'plan-premium',
        code: 'PREMIUM',
      },
    });

    const allowed = await service.canUse('user-2', FEATURE_CODES.PDF_EXPORT);
    const limit = await service.getLimit('user-2', FEATURE_CODES.JOB_MATCH_LIMIT);

    expect(allowed.allowed).toBe(true);
    expect(limit).toBe(20);
  });

  it('prefers database entitlements over fallback defaults', async () => {
    billingService.getCurrentSubscriptionForUser.mockResolvedValue({
      id: 'sub-free-db',
      status: 'ACTIVE',
      plan: {
        id: 'plan-free-db',
        code: 'FREE',
      },
    });
    prisma.featureEntitlement.findMany.mockResolvedValue([
      {
        featureCode: FEATURE_CODES.PDF_EXPORT,
        isEnabled: true,
        limitValue: null,
      },
      {
        featureCode: FEATURE_CODES.JOB_MATCH_LIMIT,
        isEnabled: true,
        limitValue: 8,
      },
    ]);

    const pdfDecision = await service.canUse('user-3', FEATURE_CODES.PDF_EXPORT);
    const limit = await service.getLimit('user-3', FEATURE_CODES.JOB_MATCH_LIMIT);

    expect(pdfDecision.allowed).toBe(true);
    expect(limit).toBe(8);
  });
});

