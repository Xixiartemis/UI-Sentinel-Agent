# UI Sentinel Agent

UI Sentinel Agent is an MVP frontend quality diagnosis system. The repository is
currently complete through **Task 4: Python Browser Worker**.

The current repository provides:

- Monorepo folders for the future frontend, control plane, Python worker, demo app,
  and shared TypeScript types.
- PostgreSQL + pgvector and Redis Compose definitions for environments where
  Docker is available.
- An external-services mode for Windows environments where local Docker is not
  available.
- A shared TypeScript package with the MVP API, event, artifact, retrieval, and
  diagnosis report types.
- A NestJS control-plane foundation with Prisma models and basic Projects/Runs
  REST APIs.
- Structured run event persistence and live Server-Sent Events for active runs.
- A Python FastAPI browser worker that uses Playwright to capture runtime
  evidence and post structured browser events back to the control plane.

RAG indexing, diagnosis, verifier logic, demo app behavior, and frontend screens
are intentionally left for later tasks.

## Current Mode: External Services

This workspace should use external services because local Windows Docker is
unavailable. Do not run Docker for this setup.

Use hosted or remote services for:

- PostgreSQL with the `vector` extension enabled.
- Redis.

The project reads service locations from `DATABASE_URL` and `REDIS_URL`; it does
not require Docker to build or typecheck Task 1.

## Repository Layout

```text
apps/
  frontend/          # Reserved for Task 9: Vite + React + TypeScript
  control-plane/     # Task 2: NestJS + Prisma API foundation
  python-worker/     # Task 4: FastAPI + Playwright browser worker
  demo-react-app/    # Reserved for Task 5: deliberate login validation bug
packages/
  shared-types/      # Shared TypeScript interfaces for API and event contracts
docker/
  docker-compose.yml # Optional PostgreSQL + pgvector and Redis stack
docs/
  infra.md           # External-services and optional Docker setup notes
```

## Prerequisites

- Node.js 20+
- npm 10+
- A reachable PostgreSQL database with pgvector and a reachable Redis instance,
  unless you only want to run structure/build/type checks.

## Setup

```powershell
Copy-Item .env.example .env
npm install
npm run prisma:generate --workspace @ui-sentinel/control-plane
npm run build
npm run typecheck
```

For external services, edit `.env`:

```dotenv
INFRA_MODE=external
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
```

Enable pgvector once in the PostgreSQL service:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Then verify connectivity:

```powershell
npm run check:services
```

If `DATABASE_URL` or `REDIS_URL` is empty, that check reports a skip and exits
successfully. Once a URL is configured, the matching check is strict and returns
a non-zero exit code on failure.

## Task 1 Verification

These commands do not run Docker and still verify the Task 1 foundation:

```powershell
npm run verify:structure
npm run build
npm run typecheck
npm run check:services
```

`npm run check:services` validates:

- PostgreSQL connection.
- pgvector extension availability.
- Redis `PING` response.

## Optional Local Docker Mode

Only use this mode on a machine where Docker is known to work.

```dotenv
INFRA_MODE=local-docker
DATABASE_URL=postgresql://ui_sentinel:ui_sentinel_dev@localhost:5432/ui_sentinel
REDIS_URL=redis://localhost:6379
```

The root `compose.yaml` and `docker/docker-compose.yml` both define PostgreSQL
with pgvector and Redis. They are included for Task 1 completeness, but they are
not required for the current Windows external-services workflow.

## Control Plane

The Task 2 and Task 3 control plane lives in `apps/control-plane` and uses
`DATABASE_URL` from `.env`.

Implemented public APIs:

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/runs`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events`
- `GET /api/runs/:id/stream`

Implemented internal APIs:

- `POST /internal/runs/:id/events`

Generate Prisma Client:

```powershell
npm run prisma:generate --workspace @ui-sentinel/control-plane
```

Apply the schema to a configured external PostgreSQL database:

```powershell
npm run prisma:migrate --workspace @ui-sentinel/control-plane -- --name task2_control_plane
```

This migration command requires `DATABASE_URL` to point at PostgreSQL with
pgvector enabled. It does not require Docker.

For Neon pooled connections where `migrate dev` cannot create a shadow database,
use:

```powershell
npx prisma db push --schema apps/control-plane/prisma/schema.prisma
```

This is the MVP external-services workflow. If formal migration history is
needed later, configure a Neon direct connection and shadow database instead of
using the pooled URL for `prisma migrate dev`.

Task 3 validation:

```powershell
npm run check:services
npm run build
npm run typecheck
node scripts/validate-task3.mjs
```

Task 4.5 demo-browser integration validation:

```powershell
node scripts/validate-task4-5.mjs
```
