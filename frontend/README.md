# GoGo Bid — AI Media Buying OS

> **AI-Powered Affiliate Marketing, Media Buying, Attribution, Intelligence, Optimization, and Automation Operating System**

A fully-featured, single-file SaaS prototype combining the best of Windsor.ai, Voluum, Hyros, Triple Whale, and HubSpot — built specifically for affiliate marketers, media buyers, and performance marketing agencies.

---

## 🚀 Live Demo

Open `gogobid.html` directly in any browser — no build step, no server required.

**Demo credentials:** `demo@gogobid.com` / `demo1234`

Or click **Continue with Demo Account** on the login screen.

---

## ✨ Features

### 🎯 Core Intelligence Pages
| Page | Description |
|------|-------------|
| **Dashboard** | KPI overview, spend trends, campaign health |
| **Campaigns** | Full campaign table with CRUD, filters, bid AI |
| **CPC Intelligence** | Click cost optimization engine |
| **CPA Intelligence** | Cost-per-acquisition analyzer |
| **Offer Analyzer** | AI-powered offer scoring |
| **Anomaly Detection** | Real-time performance anomaly alerts |
| **Benchmarks** | Industry benchmark comparison |
| **AI Simulator** | Scenario simulation engine |
| **AI Copilot** | Natural language campaign assistant |
| **Forecasting** | Revenue & spend forecasting |
| **Scaling Engine** | AI-identified scale opportunities |
| **Reports** | Date-ranged reporting with CSV export |

### 🧠 AI Intelligence Pages
| Page | Description |
|------|-------------|
| **GEO Analysis** | Country-level spend, ROAS, CPA breakdown |
| **Creative Studio** | Ad creative scoring & fatigue detection |
| **Audience Builder** | AI-segmented audience builder |
| **Budget Pacing** | Visual pacing gauges per campaign |
| **Attribution Explorer** | Multi-model attribution (First/Last/Linear/Position) |

### 🔌 Integrations System (17 tabs)
- **Overview** — Unified hub with ETL sync pipeline visualization
- **Quick Setup Wizard** — 8-step guided onboarding
- **Multi-Account Management** — Unlimited accounts per platform
- **Traffic Sources** — Meta, Google, TikTok, Native, Push with per-platform wizards
- **Affiliate Networks** — 30+ networks (ClickBank, BuyGoods, Digistore24, MaxWeb, etc.)
- **Checkout & Payments** — CartPanda, Kiwify, Stripe, PayPal, etc.
- **Trackers & Attribution** — Voluum, RedTrack, Hyros, ClickMagick, etc.
- **Analytics** — GA4, Mixpanel, Amplitude, PostHog
- **CRM** — HubSpot, GoHighLevel, Salesforce, Pipedrive
- **E-Commerce** — Shopify, WooCommerce, Amazon
- **Email Marketing** — Klaviyo, Mailchimp, ActiveCampaign
- **Comms & Alerts** — Slack, Discord, Telegram, Teams
- **Destinations** — BigQuery, Snowflake, Looker Studio, Google Sheets
- **Templates Marketplace** — One-click deploy dashboards, automations & AI templates
- **Webhooks & Postbacks** — S2S postbacks, event webhooks
- **AI Integrations** — All 9 AI modules toggle
- **Health Center** — API health scores, error logs, reconnect flows
- **Advanced** — OAuth management, rate limits, developer mode

### ⚙ Account Control Center
Every connected integration account has a full **right-side slide-over panel** with 11 tabs:
- General · Connection · Sync · Permissions · Field Mapping
- Webhooks · Notifications · Automation · AI Settings · Advanced · Danger Zone

### 🔐 Auth System
- Login / Signup / Demo mode
- localStorage session persistence
- 4-step onboarding wizard (post-signup)

### 📊 Settings (7 tabs)
Profile · Team & Permissions · Billing · Notifications · Security · API Keys · Integrations

---

## 🏗 Architecture

```
gogobid.html          ← Single-file SPA (~5,000 lines)
├── CSS               ← CSS custom properties (dark mode), component library
├── HTML              ← Static shell + page containers
└── JavaScript        ← SPA router, Campaign Store, all page renders
```

### Key Patterns
- **SPA routing** — `renderPage(page)` dispatch via `R={}` map
- **Campaign Store** — `CS` object with `_CAMPS` array + CRUD methods
- **Persistence** — `localStorage` (campaigns, auth session, API key)
- **Charts** — Chart.js 4.4.0 via CDN
- **AI** — Direct Anthropic API calls (browser-safe with CORS headers)

### Data Flow
```
Traffic Source → Affiliate Network → Offer → Checkout
      ↓
Tracker & Attribution → Campaign
      ↓
AI Intelligence → Automation → Reporting & Destinations
```

---

## 🛠 Local Development

### Option 1 — Open directly
```bash
# Just open in browser
open project-gogo-bid/gogobid.html
```

### Option 2 — Static server (recommended)
```bash
# Requires Node.js
node .claude/static-server.js
# → http://localhost:3000
```

### Option 3 — Python
```bash
cd project-gogo-bid
python -m http.server 3000
```

---

## 🔑 AI Features Setup

GoGo Bid uses the **Anthropic Claude API** for AI Copilot, Offer Analyzer, Forecasting, and more.

1. Go to **Settings → API Keys**
2. Paste your Anthropic API key
3. All AI features activate instantly

Get a key at [console.anthropic.com](https://console.anthropic.com)

---

## 📦 Tech Stack

| Layer | Tech |
|-------|------|
| UI Framework | Vanilla JS (no dependencies) |
| Charts | Chart.js 4.4.0 |
| AI | Anthropic Claude API |
| Storage | localStorage |
| Server | Node.js static file server |
| Styling | CSS Custom Properties (dark mode) |

---

## 🗺 Roadmap

- [ ] Real OAuth integrations (Meta, Google, TikTok)
- [ ] Supabase/PostgreSQL backend
- [ ] Multi-workspace / team isolation
- [ ] Real affiliate network API connections
- [ ] WebSocket live data streaming
- [ ] Stripe billing integration
- [ ] PDF report export
- [ ] Mobile app (React Native)

---

## 📄 License

MIT — free to use, modify, and distribute.

---

*Built with Claude Code · GoGo Bid — One place to connect all your marketing data, affiliate networks, offers, trackers, campaigns, AI intelligence, and automation workflows.*
