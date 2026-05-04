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
