# GoGo Bid Backend

Real production architecture for GoGo Bid: NestJS + TypeScript, PostgreSQL (Prisma), Redis + BullMQ, JWT auth, AES-256-GCM credential encryption, OAuth, webhooks, and a universal postback receiver.

**Honest status check (read this before assuming anything below is "live"):**
This scaffold is architecturally real — the database schema, queues, auth, encryption, and HTTP routes are production-shaped code, not mocks. But it has never been run, because this environment has no Node.js/Docker installed and no third-party API credentials exist yet. Two different things are true at once:
- The *shape* of the system (schema, modules, queues, security) is real and ready to run.
- Every external integration (Meta, Google, TikTok, ClickBank, trackers, checkout platforms, analytics, AI) needs real developer credentials before it does anything beyond throwing a clear "not configured" error. None of them return fabricated numbers — they fail loudly instead, by design, so nothing downstream can mistake a stub for live data.

## What's actually implemented

| Area | Status |
|---|---|
| Postgres schema (Prisma) — Users, Orgs, Campaigns, Offers, Orders, Clicks, Conversions, Costs, Revenue, AiPrediction, Forecast, Alert, IntegrationAccount, WebhookEvent, ApiToken, AuditLog | ✅ Complete |
| JWT auth (register/login, access + refresh tokens, RBAC guard) | ✅ Complete |
| AES-256-GCM token encryption service | ✅ Complete |
| Campaign CRUD + `/campaigns/:id/performance` (the Campaign Context aggregation every module should read from) | ✅ Complete |
| BullMQ queues + standalone worker process, retry/backoff, dead-letter via BullMQ's failed-job set | ✅ Complete |
| OAuth connect/callback flow for Meta, Google Ads, TikTok Ads — real authorization URLs and token-exchange endpoints | ✅ Wired, ⛔ needs real app credentials to complete a live handshake |
| **Google Ads vertical slice** — OAuth, customer (ad account) listing + selection endpoint, real GAQL-based `syncDaily`/`syncHistorical` upserting Campaign/Cost/Revenue, token-refresh worker handler, daily scheduler (`scheduler.main.ts`, BullMQ repeatable jobs at 06:00 UTC + 6h token-refresh sweep) | ✅ Code-complete end-to-end, ⛔ never executed — needs `GOOGLE_CLIENT_ID/SECRET`, an approved `GOOGLE_ADS_DEVELOPER_TOKEN`, and the `google-ads-api` npm package installed to verify |
| Universal postback receiver `/postback/:tracker` (GET+POST, shared-secret validation, dedup, queued processing) | ✅ Complete as a receiver; field mapping covers Voluum/RedTrack/Binom/Bemob/Keitaro/Hyros |
| Meta + TikTok webhook receivers with signature verification | ✅ Wired (Meta's HMAC check needs raw-body middleware added before production use — noted in code) |
| ClickBank adapter (INS signature check + Reporting API shape) | ✅ Wired, ⛔ needs CLICKBANK_DEV_KEY/CLERK_KEY |
| Health check endpoint | ✅ Complete |

## Google Ads slice — what to do once you have credentials

1. Create a Google Cloud OAuth 2.0 client (Web application type), add `GOOGLE_REDIRECT_URI` as an authorized redirect URI.
2. Apply for a Google Ads developer token at https://ads.google.com/aw/apicenter — "test account" level works immediately against a Google Ads **test manager account** (free to create, no real spend); "basic"/"standard" access requires Google's review for real accounts.
3. Fill `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (your manager account ID, digits only) into `.env`.
4. `npm install` (pulls in `google-ads-api`), then hit `GET /api/oauth/google/connect` while logged in — it redirects through Google's consent screen, exchanges the code, lists accessible customers, and stores the connection.
5. If you manage multiple ad accounts, call `PATCH /api/oauth/google/:integrationAccountId/select-customer` with `{ "customerId": "..." }` to choose which one syncs — defaults to the first accessible one otherwise.
6. Run `npm run scheduler` once to register the daily sync job, then `npm run worker:dev` to actually execute it. `GoogleAdsAdapter.runSync` (in `src/integrations/adapters/google-ads.adapter.ts`) queries campaign-level cost/conversion metrics via GAQL and upserts `Campaign`/`Cost`/`Revenue` rows.
7. **Known rough edge, flagged in code**: the campaign upsert matches by `(integrationAccountId, name)` since the schema has no dedicated `externalId` column on `Campaign` yet — fine for a first real test, but add a unique `externalId` column before relying on this with campaigns that get renamed.

## What's scaffolded as a TODO, not built yet

- **Sync logic** inside `syncDaily`/`syncHistorical` for Meta/TikTok — currently throw until credentials exist; follow the pattern now built out for Google Ads (see above) once there's a real account to test against.
- **Native ads** (Taboola, Outbrain, MGID), **push ads** (PropellerAds, RichPush, Push.House, Zeropark) — not started. Same adapter pattern as Meta/Google, lower priority per your stack.
- **Affiliate networks** beyond ClickBank (BuyGoods, Digistore24, MaxWeb, GuruMedia, TerraLeads, LeadRock, CPA House) — not started.
- **Checkout platforms** (CartPanda, Hubla, Kiwify, Monetizze, Braip, Perfect Pay) — not started; these are mostly webhook-driven (orders/refunds), same shape as the webhooks module.
- **Analytics destinations** (GA4 Measurement Protocol, Mixpanel, Amplitude) and **export destinations** (Google Sheets, Looker Studio, Power BI) — not started.
- **AI engine** — `AiPrediction`/`Forecast`/`Alert` tables exist and the queue has `forecast`/`anomaly-scan` job slots wired to empty TODO handlers in `worker.main.ts`. The actual prediction logic (calling Anthropic, or a stats model) isn't written.
- **Token refresh** worker has the job queued on a schedule slot but the handler body is a TODO (decrypt → call adapter.refreshAccessToken → re-encrypt → persist).
- **Audit log writes** — table exists, nothing writes to it yet (wire as a NestJS interceptor on mutating routes).

## Why OAuth isn't "done" yet, specifically

Meta, Google, and TikTok each require you to register a real app in their developer console and get it approved for ads/marketing API scopes — that's an external, manual process tied to your business identity, not something achievable from code. The code here builds the *correct* authorization URL and does the *correct* token exchange call shape per each platform's docs, so once you create the app and drop `META_APP_ID`/`META_APP_SECRET` (etc.) into `.env`, the connect → callback → token-storage flow should work without further code changes — that's the point of building it this way now.

## Running it (once Node + Docker are available)

```bash
cp .env.example .env          # fill in real secrets as you get them
docker compose up -d          # postgres + redis
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev             # API on :4000
npm run worker:dev            # separate process, in another terminal
```

`GET /api/health` should return `{ "status": "ok" }` once Postgres is reachable.

## Connecting the frontend

The existing `gogobid.html` SPA currently does everything client-side against `localStorage`. To use this backend, the frontend would need to swap its `CS` (campaign store) localStorage reads/writes for calls to `/api/campaigns` etc., and move the Anthropic key usage server-side (it's currently typed into the browser, which is fine for a local demo but should never happen against a real backend — keys belong in `.env`, never in client JS). That migration hasn't been started; flag if/when you want it.
