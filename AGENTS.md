# Lighthouse

Same-day competitive rate intelligence for Montauk Yacht Club vs Marram Montauk. See `README.md` for full stack overview and setup steps.

## Cursor Cloud specific instructions

### Services

| Service | How to start | Notes |
|---------|-------------|-------|
| **PostgreSQL 16** | `docker compose up -d` | Must be running before the app. Connection: `postgresql://postgres:postgres@localhost:5432/lighthouse` |
| **Lighthouse dev server** | `npm run dev` | Express + tsx watch on port 3000. Depends on Postgres. |

Docker must be started before `docker compose up -d` — run `sudo dockerd &>/tmp/dockerd.log &` then `sudo chmod 666 /var/run/docker.sock` if the daemon is not already running.

### Key commands

- **Tests:** `npm test` (Vitest, no DB required — unit tests only)
- **Build:** `npm run build` (tsc)
- **Dev server:** `npm run dev` (tsx watch, port 3000)
- **Migrations:** `npm run db:migrate` (requires running Postgres)
- **Seed:** `npm run seed` (requires `SEED_ADMIN_PHONE` in `.env`)

### Environment

Copy `.env.example` to `.env` if it doesn't exist. The minimum required variables for the dev server to start:
- `DATABASE_URL` (defaults to local Docker Postgres in `.env.example`)

Twilio credentials are optional for startup but required for SMS features. In dev mode, set `TWILIO_TEST_ACCOUNT_SID` and `TWILIO_TEST_AUTH_TOKEN` to use Twilio test mode (no real SMS sent). Without Twilio Verify configured (`TWILIO_VERIFY_SERVICE_SID`), the subscribe flow returns `{"ok":true,"dev":true}` and skips actual phone verification.

### Gotchas

- The app connects to pg-boss on startup (`startBoss()` in `src/index.ts`), so Postgres must be accepting connections before `npm run dev`.
- The seed script is idempotent and safe to re-run.
- `npm run poll` triggers a manual rate-poll cycle and requires external API connectivity (AZDS + Olive).
