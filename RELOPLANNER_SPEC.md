# ReloPlanner — Claude Code Implementation Spec

## Overview

ReloPlanner is a web application for planning international relocation with focus on IT job market analysis. The system takes a user profile (skills, experience, target country), runs algorithmic analysis against market data, and produces a personalized preparation roadmap.

**This is a course project (semester work). Scope is MVP only.**

---

## Tech Stack

- **Backend**: NestJS + TypeScript + Prisma ORM
- **Database**: PostgreSQL 16
- **Frontend**: React + TypeScript + Vite
- **Infrastructure**: Docker Compose + Nginx reverse proxy
- **Testing**: Jest (unit tests for algorithmic core)

---

## Project Structure

```
reloplanner/
├── docker-compose.yml
├── nginx/
│   └── nginx.conf
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts              # taxonomy + test data
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── jwt.strategy.ts
│   │   │   ├── roles.guard.ts
│   │   │   └── dto/
│   │   ├── profile/
│   │   │   ├── profile.module.ts
│   │   │   ├── profile.controller.ts
│   │   │   ├── profile.service.ts
│   │   │   └── dto/
│   │   ├── taxonomy/
│   │   │   ├── taxonomy.module.ts
│   │   │   ├── taxonomy.controller.ts   # admin-only
│   │   │   ├── taxonomy.service.ts
│   │   │   └── dto/
│   │   ├── market/
│   │   │   ├── market.module.ts
│   │   │   ├── market.controller.ts     # admin-only
│   │   │   ├── market.service.ts
│   │   │   ├── adapters/
│   │   │   │   ├── market-data.adapter.ts   # IMarketDataAdapter interface
│   │   │   │   ├── adzuna.adapter.ts
│   │   │   │   └── manual.adapter.ts        # CSV/JSON import
│   │   │   └── dto/
│   │   ├── scoring/
│   │   │   ├── scoring.module.ts
│   │   │   ├── scoring.controller.ts
│   │   │   ├── scoring.service.ts       # Skill-Market Fit Engine
│   │   │   ├── gap-analysis.service.ts  # Gap identification + classification
│   │   │   ├── roadmap.service.ts       # DAG + topological sort
│   │   │   ├── scoring.types.ts         # pure type definitions
│   │   │   └── __tests__/
│   │   │       ├── scoring.service.spec.ts
│   │   │       ├── gap-analysis.service.spec.ts
│   │   │       └── roadmap.service.spec.ts
│   │   ├── cost-of-living/
│   │   │   ├── col.module.ts
│   │   │   ├── col.controller.ts
│   │   │   └── col.service.ts
│   │   ├── progress/
│   │   │   ├── progress.module.ts
│   │   │   ├── progress.controller.ts
│   │   │   └── progress.service.ts
│   │   └── prisma/
│   │       ├── prisma.module.ts
│   │       └── prisma.service.ts
│   └── test/
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── api/                  # axios client + hooks
│       ├── pages/
│       │   ├── Landing.tsx
│       │   ├── Login.tsx
│       │   ├── Register.tsx
│       │   ├── ProfileWizard.tsx
│       │   ├── Dashboard.tsx
│       │   ├── ProgressTracker.tsx
│       │   ├── CostOfLiving.tsx
│       │   └── admin/
│       │       ├── TaxonomyManager.tsx
│       │       ├── MarketImport.tsx
│       │       └── UserList.tsx
│       ├── components/
│       │   ├── FitScoreCard.tsx
│       │   ├── SkillBreakdown.tsx
│       │   ├── GapList.tsx
│       │   ├── RoadmapTimeline.tsx
│       │   └── Layout.tsx
│       └── types/
└── README.md
```

---

## Data Model (Prisma Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  USER
  PREMIUM
  ADMIN
}

enum SkillCategory {
  HARD_SKILL
  LANGUAGE
  CERTIFICATION
  SOFT_SKILL
}

enum GapType {
  HARD_SKILL
  LANGUAGE
  CERTIFICATION
  EXPERIENCE
}

enum Severity {
  CRITICAL
  MODERATE
  MINOR
}

enum GapStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

enum CostCategory {
  RENT
  FOOD
  TRANSPORT
  UTILITIES
  OTHER
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         Role     @default(USER)
  createdAt    DateTime @default(now()) @map("created_at")
  profiles     RelocationProfile[]
  @@map("users")
}

model RelocationProfile {
  id              String   @id @default(uuid())
  userId          String   @map("user_id")
  targetCountry   String   @map("target_country")
  targetCity      String?  @map("target_city")
  currentCountry  String   @map("current_country")
  yearsExperience Int      @map("years_experience") @db.SmallInt
  desiredRole     String   @map("desired_role")
  createdAt       DateTime @default(now()) @map("created_at")
  user            User     @relation(fields: [userId], references: [id])
  skills          UserSkill[]
  analyses        AnalysisResult[]
  @@map("relocation_profiles")
}

model Skill {
  id            String          @id @default(uuid())
  name          String          @unique
  category      SkillCategory
  parentId      String?         @map("parent_id")
  parent        Skill?          @relation("SkillHierarchy", fields: [parentId], references: [id])
  children      Skill[]         @relation("SkillHierarchy")
  aliases       SkillAlias[]
  userSkills    UserSkill[]
  marketDemands MarketSkillDemand[]
  gapItems      GapItem[]
  transfersFrom SkillTransferability[] @relation("TransferSource")
  transfersTo   SkillTransferability[] @relation("TransferTarget")
  @@map("skills")
}

model SkillAlias {
  id      String @id @default(uuid())
  alias   String @unique
  skillId String @map("skill_id")
  skill   Skill  @relation(fields: [skillId], references: [id])
  @@map("skill_aliases")
}

model SkillTransferability {
  sourceSkillId String @map("source_skill_id")
  targetSkillId String @map("target_skill_id")
  coefficient   Decimal @db.Decimal(3,2)
  sourceSkill   Skill   @relation("TransferSource", fields: [sourceSkillId], references: [id])
  targetSkill   Skill   @relation("TransferTarget", fields: [targetSkillId], references: [id])
  @@id([sourceSkillId, targetSkillId])
  @@map("skill_transferability")
}

model UserSkill {
  profileId   String            @map("profile_id")
  skillId     String            @map("skill_id")
  proficiency Decimal           @db.Decimal(3,2)
  profile     RelocationProfile @relation(fields: [profileId], references: [id])
  skill       Skill             @relation(fields: [skillId], references: [id])
  @@id([profileId, skillId])
  @@map("user_skills")
}

model MarketSnapshot {
  id             String   @id @default(uuid())
  country        String
  city           String?
  snapshotDate   DateTime @map("snapshot_date") @db.Date
  source         String
  totalVacancies Int      @map("total_vacancies")
  skillDemands   MarketSkillDemand[]
  analyses       AnalysisResult[]
  @@map("market_snapshots")
}

model MarketSkillDemand {
  snapshotId       String         @map("snapshot_id")
  skillId          String         @map("skill_id")
  frequency        Decimal        @db.Decimal(5,4)
  avgRequiredLevel Decimal        @map("avg_required_level") @db.Decimal(3,2)
  snapshot         MarketSnapshot @relation(fields: [snapshotId], references: [id])
  skill            Skill          @relation(fields: [skillId], references: [id])
  @@id([snapshotId, skillId])
  @@map("market_skill_demands")
}

model CostOfLivingData {
  id            String       @id @default(uuid())
  country       String
  city          String
  category      CostCategory
  avgMonthlyUsd Decimal      @map("avg_monthly_usd") @db.Decimal(10,2)
  updatedAt     DateTime     @updatedAt @map("updated_at")
  @@map("cost_of_living_data")
}

model AnalysisResult {
  id              String            @id @default(uuid())
  profileId       String            @map("profile_id")
  snapshotId      String            @map("snapshot_id")
  fitScore        Decimal           @map("fit_score") @db.Decimal(4,3)
  skillBreakdown  Json              @map("skill_breakdown")
  totalPrepMonths Decimal           @map("total_prep_months") @db.Decimal(4,1)
  createdAt       DateTime          @default(now()) @map("created_at")
  profile         RelocationProfile @relation(fields: [profileId], references: [id])
  snapshot        MarketSnapshot    @relation(fields: [snapshotId], references: [id])
  gaps            GapItem[]
  @@map("analysis_results")
}

model GapItem {
  id              String         @id @default(uuid())
  analysisId      String         @map("analysis_id")
  skillId         String         @map("skill_id")
  gapType         GapType        @map("gap_type")
  severity        Severity
  currentLevel    Decimal        @map("current_level") @db.Decimal(3,2)
  requiredLevel   Decimal        @map("required_level") @db.Decimal(3,2)
  estimatedMonths Decimal        @map("estimated_months") @db.Decimal(3,1)
  dependsOn       String[]       @map("depends_on")
  orderIndex      Int            @map("order_index") @db.SmallInt
  status          GapStatus      @default(PENDING)
  analysis        AnalysisResult @relation(fields: [analysisId], references: [id])
  skill           Skill          @relation(fields: [skillId], references: [id])
  @@map("gap_items")
}
```

---

## Algorithmic Core (ScoringModule)

This is the most important part. These services must be pure logic — no HTTP, no direct DB calls. They receive data as parameters and return results.

### ScoringService

**Input:**
- `userSkills: Map<string, number>` — skill_id -> proficiency (0-1)
- `marketDemand: Map<string, { frequency: number; requiredLevel: number }>` — skill_id -> demand
- `transferMatrix: Map<string, { targetId: string; coefficient: number }[]>` — source_id -> edges

**Step 1: Transferability Expansion**
```typescript
function expandSkillVector(
  userVec: Map<string, number>,
  transferMatrix: Map<string, { targetId: string; coefficient: number }[]>
): Map<string, number> {
  const expanded = new Map(userVec);
  for (const [sourceId, proficiency] of userVec) {
    const edges = transferMatrix.get(sourceId) || [];
    for (const edge of edges) {
      const derived = proficiency * edge.coefficient;
      const current = expanded.get(edge.targetId) ?? 0;
      if (derived > current) {
        expanded.set(edge.targetId, derived);
      }
    }
  }
  return expanded;
}
```

**Step 2: Fit Score Computation**
```typescript
function computeFitScore(
  expanded: Map<string, number>,
  demandVec: Map<string, { frequency: number; requiredLevel: number }>
): { score: number; breakdown: SkillMatchResult[] } {
  let totalWeighted = 0;
  let totalWeight = 0;
  const breakdown: SkillMatchResult[] = [];

  for (const [skillId, demand] of demandVec) {
    if (demand.frequency < 0.05) continue; // noise filter
    const userLevel = expanded.get(skillId) ?? 0;
    const match = Math.min(userLevel / demand.requiredLevel, 1.0);
    const w = demand.frequency;
    totalWeighted += match * w;
    totalWeight += w;
    breakdown.push({
      skillId,
      matchScore: match,
      weight: w,
      userLevel,
      requiredLevel: demand.requiredLevel,
      source: userLevel > 0 && !/* original user skill */ ? 'transferability' : 'direct',
    });
  }

  return {
    score: totalWeight > 0 ? totalWeighted / totalWeight : 0,
    breakdown: breakdown.sort((a, b) => b.weight - a.weight),
  };
}
```

### GapAnalysisService

**Input:** the breakdown from ScoringService + skill metadata

**Gap identification:** any skill where `matchScore < 0.7`

**Severity classification:**
- `CRITICAL`: matchScore < 0.3 AND frequency >= 0.3
- `MODERATE`: matchScore < 0.7 AND frequency >= 0.15
- `MINOR`: everything else

**Time estimation:**
```
estimatedMonths = (requiredLevel - currentLevel) * baseRate[gapType]
```
Base rates: HARD_SKILL=3, LANGUAGE=6, CERTIFICATION=2, EXPERIENCE=6

### RoadmapService

**Input:** list of GapItems + taxonomy hierarchy (to determine dependencies)

**Dependency resolution:** if skill A is parent/prerequisite of skill B in taxonomy, and both are gaps, then gap(B) depends on gap(A).

**Topological sort (Kahn's algorithm):**
```typescript
function topologicalSort(gaps: GapItem[]): GapItem[] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const gap of gaps) {
    inDegree.set(gap.id, gap.dependsOn.length);
    for (const depId of gap.dependsOn) {
      const list = dependents.get(depId) || [];
      list.push(gap.id);
      dependents.set(depId, list);
    }
  }

  const queue = gaps.filter(g => (inDegree.get(g.id) ?? 0) === 0);
  const result: GapItem[] = [];
  let idx = 0;

  while (queue.length > 0) {
    const cur = queue.shift()!;
    cur.orderIndex = idx++;
    result.push(cur);

    for (const depId of (dependents.get(cur.id) || [])) {
      const newDeg = (inDegree.get(depId) ?? 1) - 1;
      inDegree.set(depId, newDeg);
      if (newDeg === 0) {
        queue.push(gaps.find(g => g.id === depId)!);
      }
    }
  }

  if (result.length < gaps.length) {
    throw new Error('Cyclic dependency detected in gap items');
  }
  return result;
}
```

**Critical path:** `totalPrepTime = max path length through DAG (sum of estimatedMonths)`

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | - | Register user |
| POST | /auth/login | - | Login, return JWT |
| GET | /profiles | User | List user's profiles |
| POST | /profiles | User | Create profile |
| GET | /profiles/:id | User | Get profile detail |
| POST | /profiles/:id/analyze | User | Run scoring + gap analysis |
| GET | /profiles/:id/results | User | Get latest analysis results |
| GET | /profiles/:id/roadmap | User | Get roadmap with progress |
| PATCH | /gaps/:id/status | User | Update gap status (PENDING/IN_PROGRESS/COMPLETED) |
| GET | /cost-of-living/compare | User | Compare CoL between cities |
| POST | /admin/import/market | Admin | Trigger market data import |
| GET | /admin/taxonomy | Admin | List all skills |
| POST | /admin/taxonomy/skills | Admin | Create skill |
| PUT | /admin/taxonomy/skills/:id | Admin | Update skill |
| POST | /admin/taxonomy/transferability | Admin | Create/update transferability edge |
| GET | /admin/users | Admin | List users |

---

## Seed Data

The seed script (`prisma/seed.ts`) should populate:

### Skill Taxonomy (30-40 IT skills)
Categories:
- **HARD_SKILL**: JavaScript, TypeScript, Python, Java, C#, Go, React, Angular, Vue, Node.js, Express, NestJS, Django, Spring Boot, PostgreSQL, MySQL, MongoDB, Redis, Docker, Kubernetes, AWS, Azure, Git, CI/CD, REST API, GraphQL, Linux
- **LANGUAGE**: English, German, French, Polish, Spanish
- **CERTIFICATION**: AWS Certified, Azure Certified, IELTS, Goethe-Zertifikat

### Hierarchy examples
- JavaScript -> TypeScript (parent-child)
- Node.js -> Express -> NestJS (parent chain)
- Docker -> Kubernetes (prerequisite)

### Transferability edges (15-20 edges)
- C# -> Java: 0.7
- C# -> TypeScript: 0.4
- Java -> C#: 0.6
- JavaScript -> TypeScript: 0.8
- React -> Vue: 0.6
- React -> Angular: 0.4
- PostgreSQL -> MySQL: 0.7
- Express -> NestJS: 0.5
- Docker -> Kubernetes: 0.3
- AWS -> Azure: 0.6
- Python -> JavaScript: 0.3
- Django -> Spring Boot: 0.3
- Django -> NestJS: 0.3

### Market Snapshot (1-2 snapshots)
Example: Germany (DE), snapshot_date = 2025-01-01, source = "manual"
With MarketSkillDemand entries reflecting typical German IT market.

### Cost of Living Data
Seed 3-4 cities: Berlin, Warsaw, Toronto, Kyiv with approximate data for RENT, FOOD, TRANSPORT, UTILITIES.

---

## Docker Compose

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: reloplanner
      POSTGRES_PASSWORD: reloplanner_dev
      POSTGRES_DB: reloplanner
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build: ./backend
    environment:
      DATABASE_URL: postgresql://reloplanner:reloplanner_dev@postgres:5432/reloplanner
      JWT_SECRET: dev-secret-change-in-production
      PORT: 3000
    ports:
      - "3000:3000"
    depends_on:
      - postgres

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./frontend/dist:/usr/share/nginx/html
    depends_on:
      - api

volumes:
  pgdata:
```

---

## Frontend Pages

### Profile Wizard (multi-step form)
1. **Step 1**: Basic info — current country, years of experience, desired role
2. **Step 2**: Skills — searchable skill selector with proficiency slider (0-100%), autocomplete from taxonomy API
3. **Step 3**: Target — target country, optional city
4. **Step 4**: Review and submit

### Dashboard (after analysis)
- **Fit Score Card**: large number (0.00-1.00) with color indicator
- **Skill Breakdown**: list of skills with progress bars, color-coded (green/amber/red)
- **Gap List**: gaps sorted by severity, showing type badge and estimated months
- **Roadmap Timeline**: vertical timeline of preparation steps, ordered by dependency, with status toggles
- **Cost of Living**: side-by-side comparison (current city vs target city) by category

### Admin Panel
- **Taxonomy Manager**: tree view of skills, add/edit skills, manage transferability edges
- **Market Import**: upload CSV or trigger API import, view existing snapshots
- **User List**: table with role management

---

## Implementation Order

1. **Backend scaffolding**: `nest new backend`, install Prisma, configure DB connection
2. **Prisma schema + migration**: create all tables, run seed
3. **PrismaModule**: global module wrapping PrismaClient
4. **AuthModule**: register, login, JWT, roles guard
5. **TaxonomyModule**: CRUD for skills + transferability (admin endpoints)
6. **ProfileModule**: CRUD for profiles + user skills
7. **ScoringModule**: implement ScoringService, GapAnalysisService, RoadmapService with unit tests
8. **MarketModule**: import pipeline with manual adapter
9. **Scoring integration**: wire controller -> service -> DB, POST /profiles/:id/analyze
10. **CostOfLivingModule**: simple comparison endpoint
11. **ProgressModule**: gap status updates
12. **Frontend**: scaffold React app, build pages in order: Auth -> Wizard -> Dashboard -> Progress -> Admin
13. **Docker + Nginx**: containerize, test full stack

---

## Testing Requirements

Unit tests for the algorithmic core (ScoringModule) are mandatory:

| Scenario | Input | Expected |
|----------|-------|----------|
| Perfect match | All demanded skills at 1.0 | fitScore = 1.0, 0 gaps |
| Empty profile | No skills | fitScore ~ 0.0, max gaps |
| Transferability | C#=0.8, T[C#->Java]=0.7 | Java match = 0.56 |
| DAG ordering | Docker -> K8s dependency | Docker.orderIndex < K8s.orderIndex |
| Parallel gaps | 2 independent gaps | totalPrep = max, not sum |
| Severity rules | match=0.1, freq=0.5 | severity = CRITICAL |

---

## Key Constraints

- ScoringService, GapAnalysisService, RoadmapService must have **zero dependency on HTTP or database**. They receive data as typed parameters and return results. This is the architectural constraint that makes the algorithmic core testable.
- The import pipeline uses an adapter pattern: `IMarketDataAdapter` interface with concrete implementations per source. Adding a new data source = adding a new adapter, no algorithm changes.
- All analysis results are persisted (AnalysisResult + GapItems) so users can track progress over time.
- The `depends_on` field in GapItem stores an array of other GapItem IDs, forming the dependency DAG.
