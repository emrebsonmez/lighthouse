# Lighthouse runbook

## Pre-launch: A2P 10DLC (required for US SMS)

US carriers block unregistered A2P traffic. Complete before production alerts:

1. Register your business **brand** in Twilio Console → Messaging → Trust Hub.
2. Register a **campaign** (alerts + verification use cases).
3. Attach your Messaging Service to the registered campaign.
4. Configure **STOP / HELP** handling on your Twilio number (inbound webhook below).
5. **Message flow / opt-in:** Production URLs for Twilio campaign registration form:
   - Opt-in (web form sample): `https://getcompset.app/subscribe.html`
   - Privacy policy: `https://getcompset.app/privacy.html`
   - Terms of service: `https://getcompset.app/terms.html`

   The opt-in form includes an unchecked consent checkbox, message description, frequency, message-and-data-rates disclosure, HELP/STOP instructions, and links to the privacy policy and terms of service. The privacy policy includes the carrier-required statement that mobile information is not shared with third parties or affiliates for marketing/promotional purposes.

   Before submitting the campaign, replace all `[COMPANY NAME]`, `[STATE]`, and `[CONTACT EMAIL]` placeholders in [`public/terms.html`](../public/terms.html) and [`public/privacy.html`](../public/privacy.html), and have counsel review.
6. Smoke-test SMS to real handsets.

## Environment variables

See `.env.example`. Required for production:

- `DATABASE_URL`
**Local development (default):** `TWILIO_TEST_ACCOUNT_SID` + `TWILIO_TEST_AUTH_TOKEN` from the Twilio Console **test** toggle. Optional `TWILIO_TEST_PHONE_NUMBER` and `TWILIO_TEST_VERIFY_SERVICE_SID`. SMS uses test magic numbers and does not charge or deliver to real handsets unless you use [test credentials with configured numbers](https://www.twilio.com/docs/iam/test-credentials).

Set `TWILIO_USE_PRODUCTION_CREDENTIALS=true` to hit live Twilio from your laptop.

**Production (Railway):**
- `TWILIO_ACCOUNT_SID`, `TWILIO_PHONE_NUMBER`
- **Recommended:** `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` (Console → API keys). Scope to Messaging + Verify.
- **Avoid in prod:** primary `TWILIO_AUTH_TOKEN` (full account access if compromised)
- `TWILIO_VERIFY_SERVICE_SID` (subscribe page)

Production never reads `TWILIO_TEST_*` variables.
- `SYSTEM_ADMIN_PHONE`
- `APP_BASE_URL` (public URL for webhooks)
- `SEED_ADMIN_PHONE`, `SEED_ADMIN_TIMEZONE` (default `America/Los_Angeles`)

Optional: `SENTRY_DSN`

## Local setup

```bash
npm run setup   # Docker Postgres + migrate + seed (see scripts/setup-dev.sh)
npm run dev
```

Or follow the manual steps in [README.md](../README.md).

## Live debugger (`/debug.html`)

Public status page for local/staging visibility without SMS:

- `GET /api/debug/status` — clock, next poll countdown, active run, last 50 completed runs
- `POST /api/debug/poll-now` — trigger one poll in the background

To restrict access later, add a `DEBUG_TOKEN` env check on these routes (not implemented in v1).

## Webhooks (Twilio Console)

- **Inbound SMS:** `POST {APP_BASE_URL}/webhooks/twilio/sms`
- Subscribe page: `{APP_BASE_URL}/subscribe.html`

## CLI

| Command | Purpose |
|---------|---------|
| `npm run poll` | Run one poll cycle (all orgs) |
| `npm run poll -- --org=<uuid>` | Poll single org |
| `npm run add-user -- --phone +1... --name Omar` | Add admin (unsubscribed) |
| `npm run add-user -- --phone +1... --subscribe` | Add subscribed admin |
| `npm run set-user-timezone -- --phone +1... --timezone America/New_York --hours 7:00-21:00` | Update alert hours TZ |

## Railway deploy

1. Create Postgres plugin; set `DATABASE_URL` on the web service.
2. Set all env vars from `.env.example`.
3. Deploy command: `npm run build && npm run db:migrate && npm start` (or migrate in release phase).
4. Run `npm run seed` once via Railway shell.
5. Confirm `GET /health` returns `{ "ok": true }`.
6. Run `npm run poll` smoke test before enabling traffic.

## Rate sources

See [rate-basis.md](./rate-basis.md). Both MYC (AZDS) and Marram (Olive) use direct HTTP APIs in v1.
