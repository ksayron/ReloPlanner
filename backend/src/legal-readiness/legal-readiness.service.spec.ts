import { NotFoundException } from '@nestjs/common';
import { LegalReadinessService } from './legal-readiness.service.js';

describe('LegalReadinessService', () => {
  it('uses persisted legal profile answers when evaluating by profile', async () => {
    const prisma = {
      relocationProfile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'p1',
          userId: 'u1',
          currentCountry: 'UA',
          targetCountry: 'DE',
          targetCity: 'Berlin',
          desiredRole: 'DevOps Engineer',
          hasExistingWorkAuthorization: true,
          hasJobOffer: true,
          hasRecognizedDegree: false,
          hasFormalEducation: true,
          relocationWithFamily: false,
        }),
      },
    } as any;

    const engine = {
      evaluate: jest.fn().mockReturnValue({ overallRisk: 'MODERATE' }),
    } as any;

    const service = new LegalReadinessService(prisma, engine);
    await service.evaluateForProfile('p1', 'u1');

    expect(engine.evaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceCountry: 'UA',
        targetCountry: 'DE',
        hasExistingWorkAuthorization: true,
        hasJobOffer: true,
        hasRecognizedDegree: false,
        hasFormalEducation: true,
        relocationWithFamily: false,
      }),
    );
  });

  it('throws not found for missing profile', async () => {
    const prisma = {
      relocationProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as any;

    const engine = { evaluate: jest.fn() } as any;
    const service = new LegalReadinessService(prisma, engine);

    await expect(service.evaluateForProfile('p1', 'u1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
