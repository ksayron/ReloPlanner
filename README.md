# ReloPlanner

Web application for planning international relocation with IT job market analysis.

## Tech Stack

- **Backend**: NestJS + TypeScript + Prisma ORM
- **Database**: PostgreSQL 16
- **Frontends**: React + TypeScript + Vite (`client` + `internal`)
- **Infrastructure**: Docker Compose + Nginx
- **Workspace**: pnpm workspaces

## Quick Start

### With Docker

```bash
corepack pnpm install
corepack pnpm --filter @reloplanner/client run build
corepack pnpm --filter @reloplanner/internal run build
docker compose up --build
```

App runs at http://localhost.  
Client app: `/`  
Internal app: `/internal/`

Default admin: `admin@reloplanner.dev` / `admin123`.

### Local Development

```bash
# Start PostgreSQL (via Docker or local install)
docker compose up postgres -d

# Install workspace dependencies
corepack pnpm install

# Prisma client for API app
corepack pnpm --filter @reloplanner/api exec prisma generate

# API
corepack pnpm --filter @reloplanner/api run start:dev

# Client app (separate terminal)
corepack pnpm --filter @reloplanner/client run dev

# Internal app (separate terminal)
corepack pnpm --filter @reloplanner/internal run dev
```

Backend: http://localhost:3000  
Client: http://localhost:5173  
Internal: http://localhost:5174

## Project Structure

```text
apps/
  api/                    # NestJS API
    prisma/               # Schema + migrations + seed
    src/
  client/                 # User-facing React SPA
  internal/               # Admin/internal React SPA
packages/
  shared-contracts/       # Cross-app DTOs/enums/types
  shared-frontend/        # Shared auth/routing/api primitives
nginx/                    # Reverse proxy config
docker-compose.yml
```

## Running Tests

```bash
corepack pnpm --filter @reloplanner/api run test
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
