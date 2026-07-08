# Infrastructure Modes

UI Sentinel Agent supports two Task 1 infrastructure modes:

- `external`: recommended for this Windows workspace because local Docker is
  unavailable.
- `local-docker`: optional for machines where Docker is already working.

Application code should always connect through `DATABASE_URL` and `REDIS_URL`.
Docker must not be treated as a runtime prerequisite for the MVP.

## External Services

Use hosted or remote services when local Docker is unavailable.

Supported service types:

- PostgreSQL with pgvector, such as Neon, Supabase, or a remote self-hosted
  PostgreSQL instance.
- Redis, such as Redis Cloud, Upstash, or a remote self-hosted Redis instance.

Enable pgvector in PostgreSQL:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Local `.env` example:

```dotenv
INFRA_MODE=external
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
REDIS_URL=rediss://default:PASSWORD@HOST:PORT
```

Connection strings are sensitive. Keep them only in `.env`, which is ignored by
Git, and never expose them to frontend code.

Verify the services:

```powershell
npm run check:services
```

The checker does not call Docker. It connects to PostgreSQL, confirms that the
`vector` extension exists, and confirms that Redis responds to `PING`.

If no service URLs are configured, the checker skips both services and exits
successfully so Task 1 build verification can still run.

## Remote Linux Docker Through SSH Tunnel

This is still external from the Windows workspace perspective. Run Compose only
on the remote Linux host:

```bash
git clone <repository-url> ui-sentinel-agent
cd ui-sentinel-agent
docker compose up -d --wait
docker compose ps
```

Create tunnels from Windows PowerShell:

```powershell
ssh -N -L 15432:127.0.0.1:5432 -L 16379:127.0.0.1:6379 user@linux-host
```

Windows `.env`:

```dotenv
INFRA_MODE=external
DATABASE_URL=postgresql://ui_sentinel:ui_sentinel_dev@127.0.0.1:15432/ui_sentinel
REDIS_URL=redis://127.0.0.1:16379
```

Keep the SSH session running while using the services. Do not expose remote
PostgreSQL or Redis ports directly to the public internet.

## Optional Local Docker

Only use this mode on machines where Docker is available and intentionally used.

Local `.env`:

```dotenv
INFRA_MODE=local-docker
DATABASE_URL=postgresql://ui_sentinel:ui_sentinel_dev@localhost:5432/ui_sentinel
REDIS_URL=redis://localhost:6379
```

The Compose stack provides:

- `pgvector/pgvector:pg16`
- `redis:7`
- `docker/postgres/init/001-enable-pgvector.sql` to enable pgvector when the
  database volume is first created.

Start and verify on Docker-capable machines only:

```powershell
docker compose up -d --wait
npm run check:services
```

Stop services:

```powershell
docker compose down
```

Only remove volumes when intentionally deleting local data.
