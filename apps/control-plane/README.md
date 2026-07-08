# Control Plane

Task 2 implements the NestJS control-plane foundation with Prisma. Task 3 adds
structured run event persistence and live SSE streaming.

## Scope

Implemented:

- NestJS app bootstrap with global `/api` prefix.
- Prisma schema using `DATABASE_URL`.
- Models for `Project`, `Run`, `RunEvent`, `Artifact`, `CodeChunk`, and
  `DiagnosisReport`.
- Basic DTO validation for project and run creation.
- Basic Projects and Runs REST APIs.
- Internal event ingestion through `POST /internal/runs/:id/events`.
- Live run event streaming through `GET /api/runs/:id/stream`.
- Historical event recovery through `GET /api/runs/:id/events`.

Not implemented yet:

- Queue processing.
- Python Worker calls.
- Browser execution.
- RAG indexing or retrieval.
- Diagnosis or verifier behavior.

## APIs

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `POST /api/runs`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events`
- `GET /api/runs/:id/stream`
- `POST /internal/runs/:id/events`

## Event Schema

```json
{
  "event_id": "evt_123",
  "run_id": "run_uuid",
  "timestamp": "2026-07-08T10:00:00.000Z",
  "agent": "browser",
  "type": "browser.step",
  "status": "running",
  "payload": {
    "action": "click"
  }
}
```

Events are persisted in PostgreSQL. SSE is live-only; clients should call
`GET /api/runs/:id/events` after reconnecting.

## Prisma

Generate Prisma Client:

```powershell
npm run prisma:generate --workspace @ui-sentinel/control-plane
```

Apply the schema to an external PostgreSQL database:

```powershell
npm run prisma:migrate --workspace @ui-sentinel/control-plane -- --name task2_control_plane
```

For external pooled providers where `migrate dev` is unavailable, sync the schema
directly:

```powershell
npx prisma db push --schema apps/control-plane/prisma/schema.prisma
```

This is the MVP external-services workflow for Neon pooled connections. If
formal migration history is needed later, configure a Neon direct connection and
shadow database instead of using the pooled URL for `prisma migrate dev`.

`DATABASE_URL` must be set in `.env`, and pgvector must already be enabled:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Local Run

After generating Prisma Client and applying migrations:

```powershell
npm run build
npm run start --workspace @ui-sentinel/control-plane
```

Task 3 validation:

```powershell
npm run check:services
npm run build
npm run typecheck
node scripts/validate-task3.mjs
```
