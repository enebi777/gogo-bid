# GoGo Bid

Monorepo for GoGo Bid — an AI-powered affiliate marketing / media buying intelligence platform.

```
.
├── frontend/   — the gogobid.html SPA (campaign dashboard, intelligence, AI tools, etc.)
└── backend/    — NestJS API: auth, OAuth integrations, Postgres, queues, AI services
```

## Current state — read this before assuming the two sides talk to each other

They don't yet. This repo was merged from two previously separate repos (history preserved via `git subtree` — see `git log --follow backend/` to see the original backend commits). As of this merge:

- **`frontend/gogobid.html`** is a fully client-side single-file app. It persists everything to `localStorage` (the `CS` campaign store, auth session, Anthropic API key) and has zero network calls to `backend/`.
- **`backend/`** is a real, code-complete NestJS scaffold (Postgres/Prisma, JWT auth, BullMQ workers, and three real ad-platform vertical slices — Google Ads, Meta Ads, TikTok Ads) but has never been run, and nothing in `frontend/` calls it.

Wiring them together — swapping `frontend/gogobid.html`'s `localStorage` reads/writes for real `fetch()` calls against `backend/`'s REST API, and moving the Anthropic key usage server-side — is the next piece of work, not yet started.

## Frontend

See [frontend/README.md](frontend/README.md). Open `frontend/gogobid.html` directly in a browser — no build step.

## Backend

See [backend/README.md](backend/README.md) for setup, the honest status of each integration, and what's still a TODO. Requires Node.js + Docker (Postgres + Redis), neither of which were available in the environment this was built in — the code has not been executed yet.
