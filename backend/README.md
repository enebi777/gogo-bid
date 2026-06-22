# GoGo Bid Backend

Real production architecture for GoGo Bid: NestJS + TypeScript, PostgreSQL (Prisma), Redis + BullMQ, JWT auth, AES-256-GCM credential encryption, OAuth, webhooks, and a universal postback receiver.

**Honest status check (read this before assuming anything below is "live"):**
The core app — Postgres/Prisma, JWT auth, campaign CRUD + performance aggregation, the postback receiver, and the BullMQ worker process — **has now actually been run and verified** against real Docker containers (`docker compose up`, `prisma migrate dev`, `nest build`, then exercised with curl: register → login → create/list campaigns → performance → signed/unsigned postback). That run caught and fixed three real TypeScript errors in the Google Ads adapter and the OAuth controller that no amount of reading would have surfaced — see the git history for `verify-backend-locally`.

What's still unverified: every *external* integration (Meta, Google, TikTok, ClickBank, trackers, checkout platforms, analytics, AI). They need real developer credentials before they do anything beyond throwing a clear "not configured" error — none of them return fabricated numbers, by design, so nothing downstream can mistake a stub for live data.

## What's actually implemented

| Area | Status |
|---|---|
| Postgres schema (Prisma) — Users, Orgs, Campaigns, Offers, Orders, Clicks, Conversions, Costs, Revenue, AiPrediction, Forecast, Alert, IntegrationAccount, WebhookEvent, ApiToken, AuditLog | ✅ Complete |
| JWT auth (register/login, access + refresh tokens, RBAC guard) | ✅ Complete |
| AES-256-GCM token encryption service | ✅ Complete |
| Campaign CRUD + `/campaigns/:id/performance` (the Campaign Context aggregation every module should read from) | ✅ Complete |
| BullMQ queues + standalone worker process, retry/backoff, dead-letter via BullMQ's failed-job set | ✅ Complete |
| OAuth connect/callback flow for Meta, Google Ads, TikTok Ads — real authorization URLs and token-exchange endpoints | ✅ Wired, ⛔ needs real app credentials to complete a live handshake |
| **Google Ads vertical slice** — OAuth, ad-account listing + selection endpoint, real GAQL-based `syncDaily`/`syncHistorical` upserting Campaign/Cost/Revenue, token-refresh worker handler, daily scheduler (`scheduler.main.ts`, BullMQ repeatable jobs at 06:00 UTC + 6h token-refresh sweep) | ✅ Code-complete end-to-end, ⛔ OAuth/sync calls themselves still untested — needs `GOOGLE_CLIENT_ID/SECRET` and an approved `GOOGLE_ADS_DEVELOPER_TOKEN` to verify against a real account (the app around it is now verified running) |
| **Meta Ads vertical slice** — OAuth, `/me/adaccounts` listing + selection endpoint, real Insights API `syncDaily`/`syncHistorical` upserting Campaign/Cost/Revenue (cost from `spend`, revenue from `action_values[purchase]`), shares the token-refresh worker | ✅ Code-complete end-to-end, ⛔ OAuth/sync calls themselves still untested — needs `META_APP_ID/SECRET` with Marketing API access approved by Meta App Review |
| **TikTok Ads vertical slice** — OAuth, advertiser listing + selection endpoint, real Integrated Reporting API `syncDaily`/`syncHistorical` upserting Campaign/Cost/Revenue (cost from `spend`, revenue derived from `complete_payment_roas`); token-refresh worker explicitly skips TikTok since its tokens are long-lived with no refresh cycle | ✅ Code-complete end-to-end, ⛔ OAuth/sync calls themselves still untested — needs `TIKTOK_APP_ID/SECRET` with Marketing API app approval |
| Universal postback receiver `/postback/:tracker` (GET+POST, shared-secret validation, dedup, queued processing) | ✅ Complete as a receiver; field mapping covers Voluum/RedTrack/Binom/Bemob/Keitaro/Hyros |
| Meta + TikTok webhook receivers with signature verification | ✅ Wired (Meta's HMAC check needs raw-body middleware added before production use — noted in code) |
| ClickBank adapter (INS signature check + Reporting API shape) | ✅ Wired, ⛔ needs CLICKBANK_DEV_KEY/CLERK_KEY |
| Health check endpoint | ✅ Complete |

## Google Ads / Meta Ads / TikTok Ads slices — what to do once you have credentials

All three follow the same shape: connect → list accounts → (optionally) select one → scheduler → worker.

1. **Google**: create a Google Cloud OAuth 2.0 client (Web application type), add `GOOGLE_REDIRECT_URI` as an authorized redirect URI, and apply for a Google Ads developer token at https://ads.google.com/aw/apicenter — "test account" level works immediately against a Google Ads **test manager account** (free, no real spend); "basic"/"standard" requires Google's review for real accounts. Fill `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` into `.env`.
2. **Meta**: create an app at https://developers.facebook.com/apps, add the Marketing API product, and submit for `ads_management`/`ads_read` permissions via App Review (a Development-mode app can self-test against ad accounts you personally own without review). Fill `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI` into `.env`.
3. **TikTok**: register an app at https://ads.tiktok.com/marketing_api/apps, request Reporting + Campaign Management scopes. Fill `TIKTOK_APP_ID`, `TIKTOK_APP_SECRET`, `TIKTOK_REDIRECT_URI` into `.env`. Note TikTok access tokens don't expire on a refresh cycle (no `refresh_token` flow) — the token-refresh worker explicitly skips `TIKTOK_ADS`; reconnect via OAuth again if access is ever revoked.
4. `npm install` (pulls in `google-ads-api`), then hit `GET /api/oauth/google/connect`, `GET /api/oauth/meta/connect`, or `GET /api/oauth/tiktok/connect` while logged in — each redirects through the provider's consent screen, exchanges the code, lists accessible accounts, and stores the connection.
5. If there's more than one accessible account, call `PATCH /api/oauth/:provider/:integrationAccountId/select-account` with `{ "accountId": "..." }` — defaults to the first one otherwise.
6. Run `npm run scheduler` once to register the daily sync job, then `npm run worker:dev` to execute it. `GoogleAdsAdapter.runSync`/`MetaAdapter.runSync`/`TikTokAdsAdapter.runSync` query campaign-level cost/conversion metrics and upsert `Campaign`/`Cost`/`Revenue` rows.
7. **Known rough edge, flagged in code on all three adapters**: campaign matching uses `(integrationAccountId, name)` since the schema has no dedicated `externalId` column on `Campaign` yet — fine for a first real test, but add a unique `externalId` column before relying on this with campaigns that get renamed.

## What's scaffolded as a TODO, not built yet

- All three ad-platform adapters (Meta, Google, TikTok) are now code-complete vertical slices — the next integration category to build is affiliate networks beyond ClickBank, or checkout platforms, following the same `OAuthAdapter`/`SyncAdapter` interface.
- **Native ads** (Taboola, Outbrain, MGID), **push ads** (PropellerAds, RichPush, Push.House, Zeropark) — not started. Same adapter pattern as Meta/Google, lower priority per your stack.
- **Affiliate networks** beyond ClickBank (BuyGoods, Digistore24, MaxWeb, GuruMedia, TerraLeads, LeadRock, CPA House) — not started.
- **Checkout platforms** (CartPanda, Hubla, Kiwify, Monetizze, Braip, Perfect Pay) — not started; these are mostly webhook-driven (orders/refunds), same shape as the webhooks module.
- **Analytics destinations** (GA4 Measurement Protocol, Mixpanel, Amplitude) and **export destinations** (Google Sheets, Looker Studio, Power BI) — not started.
- **AI engine** — `AiPrediction`/`Forecast`/`Alert` tables exist and the queue has `forecast`/`anomaly-scan` job slots wired to empty TODO handlers in `worker.main.ts`. The actual prediction logic (calling Anthropic, or a stats model) isn't written.
- **Audit log writes** — table exists, nothing writes to it yet (wire as a NestJS interceptor on mutating routes).

## Why OAuth isn't "done" yet, specifically

Meta, Google, and TikTok each require you to register a real app in their developer console and get it approved for ads/marketing API scopes — that's an external, manual process tied to your business identity, not something achievable from code. The code here builds the *correct* authorization URL and does the *correct* token exchange call shape per each platform's docs, so once you create the app and drop `META_APP_ID`/`META_APP_SECRET` (etc.) into `.env`, the connect → callback → token-storage flow should work without further code changes — that's the point of building it this way now.

## Running it — verified steps

This exact sequence was run for real (Node v24.17.0, Docker 29.5.3) and confirmed working:

```bash
cp .env.example .env           # fill in JWT_SECRET, JWT_REFRESH_SECRET, POSTBACK_SHARED_SECRET, and
                                # CREDENTIALS_ENCRYPTION_KEY (openssl rand -base64 32) at minimum —
                                # everything else can stay blank until you add a real integration
docker compose up -d           # postgres + redis
npm install
npm run prisma:generate
npx prisma migrate dev --name init   # creates prisma/migrations/, applies schema
npm run build
npm run start                  # API on :4000 — in a separate terminal: npm run worker
```

Confirmed working end-to-end:
- `GET /api/health` → `{"status":"ok","db":"up"}`
- `POST /api/auth/register` → issues access + refresh JWTs
- `POST /api/auth/login` → same
- `GET/POST /api/campaigns` (JWT-protected) → create + list round-trip against real Postgres
- `GET /api/campaigns/:id/performance` → correctly returns zeros for a campaign with no cost/revenue rows yet (no fabricated numbers)
- `GET /api/postback/voluum` → 400 without `?secret=`, 200 + `WebhookEvent` row created with the correct shared secret
- `npm run worker` → connects to Redis/Postgres and idles cleanly, no crash

Not yet exercised: anything requiring real third-party credentials (OAuth connect/callback for Meta/Google/TikTok, ClickBank, webhook signature verification against real payloads) — see the integration table above for what's still pending external credentials.

## Connecting the frontend

The existing `gogobid.html` SPA currently does everything client-side against `localStorage`. To use this backend, the frontend would need to swap its `CS` (campaign store) localStorage reads/writes for calls to `/api/campaigns` etc., and move the Anthropic key usage server-side (it's currently typed into the browser, which is fine for a local demo but should never happen against a real backend — keys belong in `.env`, never in client JS). That migration hasn't been started; flag if/when you want it.
