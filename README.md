# Lighthouse

Same-day competitive rate intelligence for Montauk Yacht Club vs Marram. Polls booking APIs, compares cheapest pre-tax nightly rooms, and texts subscribed admins when a competitor undercuts.

## Stack

- TypeScript, Express, Postgres, Drizzle
- pg-boss (scheduled polls)
- Twilio (SMS + Verify)
- Direct API adapters: AZDS (MYC), Olive (Marram)

## Quick start (new developer)

After cloning the repo:

```bash
npm run setup
```

That script checks Node 20+ and Docker, creates `.env` from `.env.example`, prompts for any missing Twilio test credentials and phone numbers, installs dependencies, starts Postgres, runs migrations, and seeds the DB.

Then start the app:

```bash
npm run dev
```

Open the live debugger (no Twilio required to see polls):

- http://localhost:3000/debug.html — site clock, next-check countdown, run history
- http://localhost:3000/subscribe.html — SMS opt-in

Populate history with `npm run poll` or **Run check now** on the debug page.

`npm run setup -- --skip-seed` skips seeding if you only want the database up first.

### Manual setup

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run seed   # requires SEED_ADMIN_PHONE
npm run dev
```

### Start the database

**Option A — Docker (recommended)**

```bash
docker compose up -d
```

Uses `postgresql://postgres:postgres@localhost:5432/lighthouse` (matches `.env.example`).

Stop: `docker compose down` · Reset data: `docker compose down -v`

**Option B — Homebrew Postgres**

```bash
brew install postgresql@16
brew services start postgresql@16
createdb lighthouse
```

Set `DATABASE_URL` in `.env` to match your local user/socket if different from the example.

**Option C — [Postgres.app](https://postgresapp.com/)**

Create a server, add database `lighthouse`, and point `DATABASE_URL` at it.

With `NODE_ENV=development`, Lighthouse uses **Twilio test credentials** when `TWILIO_TEST_ACCOUNT_SID` and `TWILIO_TEST_AUTH_TOKEN` are set. Set `TWILIO_USE_PRODUCTION_CREDENTIALS=true` to use live creds locally. Production always uses live `TWILIO_*` vars only.

Open http://localhost:3000/subscribe.html

## Docs

- [Rate basis](./docs/rate-basis.md)
- [Runbook](./docs/runbook.md) (A2P 10DLC, deploy, CLI)

## Scripts

- `npm run poll` — manual poll cycle
- `npm run add-user` — add admin users
- `npm run set-user-timezone` — update per-user alert hours timezone
- `npm test` — unit tests
