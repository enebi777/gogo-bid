# GoGo Bid — Universal OAuth & Integration Architecture (Enterprise)

> **Status:** North-star design doc. This captures the target architecture for
> organizing integrations around *connection types* rather than per-vendor logic.
> It is a vision reference, not a spec of current behavior.
>
> **Already implemented** (see `backend/src/connectors/`):
> - Connector registry classifying every provider by connection type + capability
>   metadata (`connector-registry.ts`, `GET /api/connectors`).
> - Connector SDK/lifecycle interface (`connector-types.ts`).
> - Smart Profiles: postback field mappings + auto-generated, ready-to-paste
>   postback URLs (`auto-config.ts`, `GET /api/connectors/:id/postback-config`).
> - Website/landing-page tracking snippet generator, reusing the S2S postback
>   pipeline (`tracking-snippet.ts`, `GET /api/campaigns/:id/tracking-snippet`).
>
> **Not yet built** (needs vendor credentials / later phases): real OAuth flows
> for new providers, live asset discovery, affiliate smart-profile verification,
> first-party pixel persistence as its own channel, and the full connector SDK
> runtime.

## Core Principle

GoGo Bid is a multi-tenant SaaS platform built for agencies, affiliate marketers, media buyers, brands, and enterprise teams.

Each customer securely authorizes access to their own marketing ecosystem using the provider's official authentication method (OAuth 2.0 where supported, API Keys, Personal Access Tokens, Webhooks, or secure credential exchange).

GoGo Bid never requires users to manually enter internal platform identifiers such as Business Manager IDs, Ad Account IDs, Pixel IDs, MCC IDs, or Workspace IDs. These assets are discovered automatically after authentication.

Every integration follows the same lifecycle:

Authenticate
        ↓
Secure Credential Storage
        ↓
Asset Discovery
        ↓
Asset Selection
        ↓
Multi-Account Management
        ↓
Unified Data Layer
        ↓
Campaign Context
        ↓
AI Intelligence
        ↓
Analytics
        ↓
Automation
UNIVERSAL CONNECTION TYPES

Instead of building unique logic for every platform, every integration belongs to one of these connector types.

Integrations

├── OAuth Connectors
│
├── API Connectors
│
├── Tracking Connectors
│
├── Affiliate Connectors
│
├── Webhook Connectors
│
├── Destination Connectors
│
└── AI Connectors

This architecture allows hundreds of integrations to be added without changing the UI.

MULTI-ACCOUNT MANAGEMENT

Every integration must support unlimited connected accounts.

Each account is managed independently.

Provider

↓

Organizations

↓

Accounts

↓

Assets

↓

Campaigns

Each connected account maintains its own:

OAuth credentials
Refresh tokens (where applicable)
Sync schedule
Automation rules
AI settings
Notifications
Permissions
Webhooks
Activity logs
META ADS — UNIVERSAL OAUTH CONNECTOR

Authentication:

Facebook Login for Business
OAuth Authorization
Long-Lived Access Token
Automatic Token Refresh (where supported)
Secure Backend Storage

Automatically discover:

Business Managers

↓

Ad Accounts

↓

Pixels

↓

Datasets

↓

Facebook Pages

↓

Instagram Accounts

↓

Catalogs

↓

Campaigns

Support:

Unlimited Business Managers
Unlimited Ad Accounts
Unlimited Pixels
Unlimited Pages
Unlimited Campaigns
GOOGLE ADS — UNIVERSAL OAUTH CONNECTOR

Authentication:

Google OAuth 2.0

Automatically discover:

Google User

↓

Manager Accounts (MCC)

↓

Child Accounts

↓

Conversion Actions

↓

Campaigns

↓

Ad Groups

↓

Keywords

Support:

Unlimited MCC Accounts
Unlimited Child Accounts
Unlimited Campaigns
TIKTOK ADS — UNIVERSAL OAUTH CONNECTOR

Authentication:

TikTok Business OAuth

Automatically discover:

Business Centers

↓

Ad Accounts

↓

Pixels

↓

Campaigns

↓

Ad Groups

Support:

Unlimited Business Centers
Unlimited Ad Accounts
Unlimited Campaigns
AFFILIATE NETWORKS & MARKETPLACES

Each affiliate network uses the best available authentication mechanism (OAuth where available, API Keys, Personal Access Tokens, or network-specific authentication).

Support unlimited accounts per network.

Priority Networks
ClickBank
BuyGoods
Digistore24
MaxWeb
GuruMedia
TerraLeads
LeadRock
CPA House
NutriProfits
Everad
Leadbit
Health Trader
SellHealth
WebVork
Traffic Light
Additional Networks
JVZoo
CPA Combo
Smart Adv
A1CallHub
Dr.cash
Ambalaya
Orbio
Vortex Alpha
Click Hunts
Easy Profits
LemonAD
MediaScalers
NetVork
Shakes.pro
Loazz
Regional Platforms
Monetizze
Braip
Kiwify
Perfect Pay
Hotmart
Perfect Pay
Hubla
SMART NETWORK PROFILES

Every supported network includes a predefined integration profile.

Automatically configure:

Click ID Parameter

Revenue Parameter

Transaction ID Parameter

Status Parameter

Currency Parameter

Tracking Template

Postback Template

Webhook Template

API Endpoints

Example:

Network

ClickBank

↓

Automatically Loaded

Click ID = tid

Transaction = cbreceipt

Revenue = amount

Default Postback Template

Default Webhook Template

The user should never need to manually look up these parameters.

AUTO-CONFIGURATION ENGINE

GoGo Bid automatically performs:

Click ID Mapping
Revenue Mapping
Conversion Mapping
Transaction Mapping
Currency Mapping
Status Mapping
Webhook Configuration
Postback Configuration
Tracking Template Generation
Attribution Configuration

Goal:

Zero Manual Configuration
TRACKERS

Support multiple workspaces.

Examples:

Voluum
RedTrack
Binom
Bemob
Thrive
Peerclick

Each tracker supports:

Workspace

↓

Campaigns

↓

Offers

↓

Traffic Sources

↓

Landing Pages

↓

Flows

Capabilities:

Click Tracking
Conversion Tracking
Revenue Tracking
Attribution Validation
S2S Postbacks
Token Mapping
Click ID Mapping
Auto Campaign Discovery
WEBSITE & DOMAIN TRACKING

Users can connect unlimited websites and domains.

Support:

WordPress
Shopify
WooCommerce
Custom HTML
Landing Page Builders
Funnel Platforms

Connection methods:

JavaScript Tracking Snippet
Tracking Pixel
Google Tag Manager
Server-side Tracking
Conversion API
Webhook Events

Each domain supports:

Domain

↓

Tracking Script

↓

Landing Pages

↓

Funnels

↓

Events

↓

Campaign Attribution

Capabilities:

Page View Tracking
Button Click Tracking
Form Tracking
Lead Tracking
Purchase Tracking
Custom Events
Session Tracking
UTM Capture
Click ID Capture
Revenue Attribution
UNIFIED CAMPAIGN CONTEXT

Every imported campaign automatically becomes part of the Unified Campaign Model.

Traffic Source

↓

Tracker

↓

Affiliate Network

↓

Landing Page

↓

Offer

↓

Campaign

↓

Unified Campaign Context

↓

Intelligence

↓

AI Tools

↓

Analytics

↓

Automation

↓

Reports

The currently selected campaign becomes the active context across the entire application.

AI & AUTOMATION READY

Every connected integration immediately enables:

Campaign Intelligence
AI Copilot
Forecasting
Offer Analysis
GEO Analysis
Budget Pacing
Attribution
Automation Rules
Scaling Engine
Notifications
Reporting

No additional configuration should be required after connection.

ENTERPRISE DESIGN PRINCIPLES
Multi-tenant by design
Provider-agnostic connector framework
Unlimited connected accounts
Automatic asset discovery
Zero-manual configuration wherever technically possible
Unified data model across all providers
Campaign-centric architecture
Secure credential storage and encryption
Modular Integration SDK for future connectors
AI-ready and Automation-ready from the moment an integration is connected
Final Vision

GoGo Bid should evolve into a Universal Marketing Connectivity Platform where users connect all of their advertising platforms, affiliate networks, trackers, websites, domains, analytics tools, and destinations through a single, consistent integration experience. Regardless of whether a provider uses OAuth, API keys, webhooks, or tracking scripts, every connection is normalized into the same Unified Data Layer, feeding a shared Campaign Context that powers Intelligence, AI Tools, Analytics, Automation, and Reporting across the entire platform. This creates a scalable foundation capable of supporting hundreds of integrations while maintaining an intuitive, enterprise-grade user experience.