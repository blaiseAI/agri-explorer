# Phase 1: SaaS UI Shell — Implementation Plan

Spec: [saas-conversion-design.md](file:///Users/bg/Developer/agri-explorer/docs/superpowers/specs/2026-03-16-saas-conversion-design.md)

## Summary

Add SaaS-grade UI elements to make AgriScope feel like a premium product. No backend changes — purely frontend additions. This phase creates the marketing/pricing surface and soft-walls on gated features so the app looks ready for subscriptions.

> [!IMPORTANT]
> This phase is UI-only. Auth buttons show toast placeholders. No backend security is enforced yet — that comes in Phases 2-4.

---

## Proposed Changes

### Pricing Page

#### [NEW] [PricingPage.tsx](file:///Users/bg/Developer/agri-explorer/client/src/pages/PricingPage.tsx)

Full pricing page with 3 tier cards (Free / Pro / Enterprise):
- Feature comparison table using shadcn Card + Badge components
- "Current Plan" badge on Free tier, "Most Popular" badge on Pro
- CTA buttons: Free → "Explore Free" (links to dashboard), Pro → "Start Pro" (toast placeholder), Enterprise → "Contact Us" (mailto link)
- Annual/monthly toggle with savings callout
- FAQ accordion at the bottom (using shadcn Accordion)

---

### Landing Page

#### [NEW] [LandingPage.tsx](file:///Users/bg/Developer/agri-explorer/client/src/pages/LandingPage.tsx)

Marketing landing page (shown at `/` for unauthenticated visitors):
- Hero section with headline, subheadline, animated stats (54 countries, 136 crops)
- Feature grid (3 cards: Crop Intelligence, Trade Analytics, Investment Signals)
- Data source logos strip (FAOSTAT, World Bank, UN Comtrade)
- Inline pricing preview cards
- CTA buttons linking to dashboard and pricing page

> [!NOTE]
> For Phase 1, the landing page is at a new `/welcome` route. The existing `/` dashboard stays as-is. We can swap them in Phase 2 when auth determines which to show.

---

### Auth Pages (UI Shells)

#### [NEW] [SignInPage.tsx](file:///Users/bg/Developer/agri-explorer/client/src/pages/SignInPage.tsx)

Sign-in page with:
- Email + password inputs using shadcn Input + Label + Form
- "Sign in with Google" button (shows toast: "Coming soon" on click)
- Link to sign-up page and forgot-password page
- Centered card layout with AgriScope branding

#### [NEW] [SignUpPage.tsx](file:///Users/bg/Developer/agri-explorer/client/src/pages/SignUpPage.tsx)

Sign-up page with:
- Name, email, password, confirm password inputs
- "Sign up with Google" button (toast placeholder)
- Terms of service checkbox
- Link to sign-in page

---

### Upgrade Prompt Component

#### [NEW] [UpgradePrompt.tsx](file:///Users/bg/Developer/agri-explorer/client/src/components/UpgradePrompt.tsx)

Reusable component that overlays a blurred area with an upgrade CTA:
- Props: `feature` (string label), `children` (the content to blur)
- Renders children behind a `blur-sm` + gradient overlay
- Shows badge "Pro Feature", description, and "Upgrade to Pro" button → navigates to `/pricing`
- Used on: trade data sections, CSV export button, extended insights

---

### Navigation Updates

#### [MODIFY] [AppLayout.tsx](file:///Users/bg/Developer/agri-explorer/client/src/components/AppLayout.tsx)

- Add "Pricing" nav item with a sparkle icon
- Add "Sign In" button to the right side of header (styled as outline button)
- Add "Pricing" link to the footer
- Both show toast placeholders for now

#### [MODIFY] [App.tsx](file:///Users/bg/Developer/agri-explorer/client/src/App.tsx)

- Add routes: `/welcome`, `/pricing`, `/sign-in`, `/sign-up`
- Import new page components

---

### Upgrade Prompt Integration

#### [MODIFY] [CountryView.tsx](file:///Users/bg/Developer/agri-explorer/client/src/pages/CountryView.tsx)

- Wrap trade data section in `<UpgradePrompt feature="Trade Data">`
- Show a soft-wall on the time-series charts beyond the latest year with "Unlock full history" message

#### [MODIFY] [CropView.tsx](file:///Users/bg/Developer/agri-explorer/client/src/pages/CropView.tsx)

- After showing top 5 countries, wrap remaining rows in `<UpgradePrompt feature="Full Comparison">`

#### [MODIFY] [Dashboard.tsx](file:///Users/bg/Developer/agri-explorer/client/src/pages/Dashboard.tsx)

- Add a subtle banner/CTA below the hero: "Unlock investment signals, trade data & CSV export → See Pricing"

---

## Verification Plan

### Browser Verification (Primary)

Use the browser subagent to verify each new page and component:

1. **Landing Page**: Navigate to `http://localhost:4040/#/welcome`, verify hero section renders with stats, feature cards, and CTA buttons
2. **Pricing Page**: Navigate to `http://localhost:4040/#/pricing`, verify 3 tier cards render with feature comparison, CTA buttons show toast on click
3. **Sign In Page**: Navigate to `http://localhost:4040/#/sign-in`, verify form renders, submit shows toast, links work
4. **Sign Up Page**: Navigate to `http://localhost:4040/#/sign-up`, verify form renders, submit shows toast
5. **Navigation**: Verify "Pricing" and "Sign In" appear in the header on any page
6. **Upgrade Prompts**: Navigate to a country detail page, verify trade data is blurred with upgrade overlay
7. **Build Check**: Run `npm run build` to verify no TypeScript errors

### Manual Verification

After automated checks, user should:
1. Browse the app and verify the overall premium SaaS aesthetic
2. Click through auth and pricing CTAs and verify toast placeholders appear
3. Check that existing data functionality is not broken
