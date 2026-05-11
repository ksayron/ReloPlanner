# ReloPlanner

Web application for planning international relocation with IT job market analysis.

## Tech Stack

- **Backend**: NestJS + TypeScript + Prisma ORM
- **Database**: PostgreSQL 16
- **Frontend**: React + TypeScript + Vite
- **Infrastructure**: Docker Compose + Nginx

## Quick Start

### With Docker

```bash
# Build frontend first
cd frontend && npm install && npm run build && cd ..

# Start all services
docker compose up --build
```

App runs at http://localhost. Default admin: `admin@reloplanner.dev` / `admin123`.

### Local Development

```bash
# Start PostgreSQL (via Docker or local install)
docker compose up postgres -d

# Backend
cd backend
npm install
npx prisma generate
npx prisma migrate dev
npx prisma db seed
npm run start:dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend: http://localhost:3000, Frontend: http://localhost:5173

## Project Structure

```
├── backend/          # NestJS API
│   ├── prisma/       # Schema + migrations + seed
│   └── src/
│       ├── auth/     # JWT authentication
│       ├── profile/  # User relocation profiles
│       ├── scoring/  # Algorithmic core (fit score, gap analysis, roadmap)
│       ├── taxonomy/ # Skill taxonomy management
│       ├── market/   # Market data import
│       ├── cost-of-living/
│       └── progress/ # Gap status tracking
├── frontend/         # React SPA
│   └── src/
│       ├── pages/    # Route pages
│       └── components/
├── nginx/            # Reverse proxy config
└── docker-compose.yml
```

## Running Tests

```bash
cd backend
npm test
```

## Product Roadmap (V1 -> V3)

- **V1 / MVP**: deterministic relocation-readiness engine (profile -> market fit score -> roadmap).
- **V2**: AI-assisted report enrichment, job matching, localization support, legal/financial readiness modules.
- **V3 (prototype productization)**: Free/Premium plans, entitlement-based feature gating, provider-abstracted billing flow, and sandbox payment behavior for demo/defense.

This repository remains an academic prototype, not a production SaaS launch. V3 demonstrates how productized monetization can be integrated without weakening the deterministic scoring core.

## Free vs Premium (Prototype)

- **Free**:
  - core analysis flow;
  - limited top job matches (`3`);
  - no AI-detailed report;
  - no PDF export.
- **Premium**:
  - expanded top job matches (`20`);
  - AI detailed report;
  - PDF export;
  - full premium entitlement set configured in backend.

These paid features are intentionally tied to higher-cost capabilities (broader matching and richer AI/report outputs), not arbitrary locks.

## Billing Architecture Notes

- Payment provider logic is **provider-abstracted** in code (`PaymentProviderAdapter` + registry).
- Initial implementation uses `STRIPE` provider mode in sandbox/simulated flow.
- In development, checkout confirmation can randomly succeed/fail/cancel to stress-test failure handling in UI/API.
- Entitlements are centralized through `EntitlementService` (boolean access + numeric limits).

## Demo Users (Local/Dev Seed)

- `admin@reloplanner.dev` / `admin123`
- `demo-free@reloplanner.dev` / `demo123`
- `demo-premium@reloplanner.dev` / `demo123`

The seed script prepares plans, entitlements, and billing/subscription state so Free/Premium behavior can be demonstrated immediately in local/dev.

## Known Scaling Constraints (Future Work)

- External job-source quality and coverage variance by country/role.
- API/AI cost growth with larger usage volumes.
- Continuous competency taxonomy maintenance and market calibration.
- Ongoing tuning for market-to-profile matching thresholds.
