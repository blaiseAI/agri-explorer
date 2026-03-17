# AgriScope SaaS Conversion Design

Transform AgriScope from an open data explorer into a freemium SaaS product with authentication, subscription billing, and tiered access control.

## Decisions Made

- **Monetization**: Freemium — data is free, insights/export/trade are gated
- **Pricing**: Pro $15/mo ($120/yr annual), Enterprise $79/mo
- **Architecture**: Hybrid — Convex for auth/payments/users, Express for crop data
- **Auth**: Convex + Better Auth (email/password + Google OAuth)
- **Payments**: Convex + Stripe component
- **Phased delivery**: 4 independent sub-projects

---

## Free vs. Pro Feature Map

| Feature | Free | Pro ($15/mo) | Enterprise ($79/mo) |
|---------|------|-------------|-------------------|
| Overview dashboard | ✅ Full | ✅ Full | ✅ Full |
| Country/crop lists | ✅ Full | ✅ Full | ✅ Full |
| Country detail | ⚡ Latest year only | ✅ Full time series | ✅ Full |
| Crop comparison | ⚡ Top 5 countries | ✅ All 54 countries | ✅ All |
| Investment signals | 🔒 Preview (2) | ✅ All signals | ✅ All |
| Trade data | 🔒 Hidden | ✅ Full | ✅ Full |
| CSV export | 🔒 Hidden | ✅ | ✅ |
| API keys | 🔒 N/A | 🔒 N/A | ✅ |

---

## Phase 1: SaaS UI Shell

**Goal**: Make the app look and feel like a premium SaaS product immediately. No backend changes.

### Landing Page
- Hero section with value proposition, animated data visualization
- Feature highlights with icons
- Pricing cards (Free / Pro / Enterprise) with feature comparison
- Social proof section (data source logos: FAOSTAT, World Bank, UN Comtrade)
- CTA buttons: "Explore Free" and "Start Pro Trial"

### Auth Pages (UI Only)
- Sign up page (email/password + Google OAuth button)
- Sign in page
- Forgot password page
- Pages are built but submit buttons show "Coming soon" toast until Phase 2

### Upgrade Prompts (Soft Walls)
- On gated features, show a blurred overlay with "Upgrade to Pro" CTA
- Investment signals page: show 2 signals, blur the rest with upgrade prompt
- CSV export button: shows pricing modal instead of downloading
- Trade data columns: show "Pro" badge, data blurred
- Country detail: show latest year data, time-series charts show "Unlock full history" overlay

### Navigation Updates
- Add user avatar / "Sign In" button to header
- Add "Pro" badges next to gated nav items
- Add pricing link to footer

---

## Phase 2: Convex + Better Auth

**Goal**: Wire up real authentication.

### Setup
- Initialize Convex project (`npx convex dev`)
- Install `@convex-dev/better-auth`
- Configure Better Auth with email/password + Google OAuth

### Schema
```
users: {
  email: string
  name: string
  tier: "free" | "pro" | "enterprise"
  stripeCustomerId: string | null
  createdAt: number
}
```

### Integration
- Wire auth UI from Phase 1 to Better Auth
- Add session management (Convex reactive queries)
- Protected route wrapper component
- User profile dropdown (avatar, settings, sign out)

---

## Phase 3: Stripe + Subscriptions

**Goal**: Enable paid subscriptions.

### Setup
- Install `@convex-dev/stripe`
- Create Stripe products: Pro Monthly ($15), Pro Annual ($120), Enterprise ($79)
- Configure webhook endpoint

### Checkout Flow
- Pricing page "Subscribe" buttons → Stripe Checkout
- On success → update user tier in Convex
- Customer portal link for billing management

### Subscription Lifecycle
- Handle: subscription created, updated, cancelled, payment failed
- Grace period on cancellation (access until end of billing period)
- Downgrade to free tier on expiry

---

## Phase 4: Access Control Middleware

**Goal**: Enforce the free/pro/enterprise gates on the API.

### Express Middleware
- New middleware: `requireTier(minTier)` 
- Reads auth token from request header
- Validates against Convex user record
- Returns 403 with upgrade message for insufficient tier

### Endpoint Tiers
- **Public** (no auth): `/api/overview`, `/api/countries`, `/api/crops`, `/api/metadata`
- **Free** (auth optional, limited response): `/api/country/:country`, `/api/crop/:crop`
- **Pro** (auth required): `/api/crop-data/:country/:crop`, `/api/insights`, CSV export
- **Enterprise**: API key validation for programmatic access

### Graceful Degradation
- Free users hitting `/api/country/:country` get a trimmed response (latest year only, no trade data)
- Free users hitting `/api/insights` get 2 preview signals
- Response includes `{ tier: "free", upgradeUrl: "/pricing" }` metadata

---

## Verification Plan

### Phase 1
- Visual review: landing page, auth pages, pricing cards
- Upgrade prompts appear on gated features
- No backend functionality broken

### Phase 2
- User can sign up, sign in, sign out
- Session persists across page refreshes
- Google OAuth flow works

### Phase 3
- Stripe checkout creates subscription
- User tier updates in real-time after payment
- Cancellation reverts to free after billing period

### Phase 4
- Free user sees limited data on country/crop pages
- Pro user sees full data
- Unauthenticated user sees public endpoints only
- API returns proper 403 with upgrade message for gated endpoints
