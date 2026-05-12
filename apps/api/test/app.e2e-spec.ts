import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { App } from 'supertest/types';
import { CompetencyType } from '@prisma/client';
import { PrismaModule } from './../src/prisma/prisma.module';
import { AuthModule } from './../src/auth/auth.module';
import { TaxonomyModule } from './../src/taxonomy/taxonomy.module';
import { ProfileModule } from './../src/profile/profile.module';
import { ScoringModule } from './../src/scoring/scoring.module';
import { ProgressModule } from './../src/progress/progress.module';

jest.setTimeout(120000);

const authHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

const competencyPayload = (competencyId: string, type: CompetencyType) => {
  if (type === 'LANGUAGE') {
    return { competencyId, languageLevel: 'A1' };
  }
  if (type === 'CERTIFICATION') {
    return { competencyId, certificationStatus: 'NONE' };
  }
  return { competencyId, hardSkillLevel: 'BASIC' };
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TaxonomyModule,
    ProfileModule,
    ScoringModule,
    ProgressModule,
  ],
})
class E2eCriticalFlowModule {}

describe('Critical Flow (e2e)', () => {
  let app: INestApplication<App>;
  let server: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [E2eCriticalFlowModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthorized access to protected route', async () => {
    await request(server).get('/api/profiles').expect(401);
  });

  it('covers auth -> profile -> analysis -> roadmap -> gap status with ownership guard', async () => {
    const uid = Date.now().toString();
    const primaryEmail = `e2e.primary.${uid}@example.com`;
    const secondaryEmail = `e2e.secondary.${uid}@example.com`;
    const password = 'secret123';

    const primaryRegister = await request(server)
      .post('/api/auth/register')
      .send({ email: primaryEmail, password })
      .expect(201);
    const primaryToken = primaryRegister.body.accessToken as string;

    const secondaryRegister = await request(server)
      .post('/api/auth/register')
      .send({ email: secondaryEmail, password })
      .expect(201);
    const secondaryToken = secondaryRegister.body.accessToken as string;

    const competenciesResponse = await request(server)
      .get('/api/competencies')
      .set(authHeader(primaryToken))
      .expect(200);

    expect(Array.isArray(competenciesResponse.body)).toBe(true);
    expect(competenciesResponse.body.length).toBeGreaterThan(0);

    const selectedCompetencies = competenciesResponse.body
      .slice(0, 6)
      .map((competency: { id: string; type: CompetencyType }) =>
        competencyPayload(competency.id, competency.type),
      );

    const profileResponse = await request(server)
      .post('/api/profiles')
      .set(authHeader(primaryToken))
      .send({
        currentCountry: 'UA',
        yearsExperience: 3,
        desiredRole: 'DevOps Engineer',
        targetCountry: 'DE',
        targetCity: 'Berlin',
        competencies: selectedCompetencies,
      })
      .expect(201);

    const profileId = profileResponse.body.id as string;
    expect(profileId).toBeTruthy();

    const analysisResponse = await request(server)
      .post(`/api/profiles/${profileId}/analyze`)
      .set(authHeader(primaryToken))
      .expect(201);

    expect(analysisResponse.body.id).toBeTruthy();
    expect(Array.isArray(analysisResponse.body.roadmapSteps)).toBe(true);
    expect(analysisResponse.body.roadmapSteps.length).toBeGreaterThan(0);

    const roadmapResponse = await request(server)
      .get(`/api/profiles/${profileId}/roadmap`)
      .set(authHeader(primaryToken))
      .expect(200);

    expect(Array.isArray(roadmapResponse.body.steps)).toBe(true);
    expect(roadmapResponse.body.steps.length).toBeGreaterThan(0);

    const firstGap = roadmapResponse.body.steps[0];
    const patchResponse = await request(server)
      .patch(`/api/gaps/${firstGap.id}/status`)
      .set(authHeader(primaryToken))
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    expect(patchResponse.body.status).toBe('IN_PROGRESS');

    await request(server)
      .patch(`/api/gaps/${firstGap.id}/status`)
      .set(authHeader(secondaryToken))
      .send({ status: 'COMPLETED' })
      .expect(403);
  });
});
