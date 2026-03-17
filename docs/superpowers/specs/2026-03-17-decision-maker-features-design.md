# Decision-Maker Features — Design Spec

Transform AgriScope from a data browser into a decision tool by surfacing ranked opportunities directly on the dashboard and detail pages.

## Build Order

1. **Investment Leaderboard** on Overview — top 20, sortable/filterable
2. **Risk-adjusted filter** on the leaderboard
3. **Top 3 Crops for Investment** on each Country page
4. **Similar Opportunities** on crop detail pages

---

## Feature 1: Investment Leaderboard

### Problem
The Overview page shows only 3 insight cards. Users must browse 54 countries × 136 crops manually to find opportunities.

### Design

**New API endpoint: `GET /api/leaderboard`**

Returns the top 50 crop×country opportunities ranked by composite score. Enriches existing `generateInsights()` output with:
- `revenuePerHa` — from `getBestPrice()` × yield
- `exportValue` — from trade data (latest year)
- `politicalStability` — World Bank percentile
- `logisticsIndex` — World Bank LPI score
- `prodGrowth` — production CAGR from metrics

```typescript
interface LeaderboardEntry {
  rank: number;
  country: string;
  region: string;
  crop: string;
  signalType: "growth" | "yield_gap" | "trade" | "opportunity";
  score: number;           // 0-100 composite
  revenuePerHa: number | null;
  prodGrowth: number;      // CAGR %
  exportValue: number | null; // $M
  politicalStability: number | null; // percentile
  logisticsIndex: number | null;     // 1-5
}
```

The function `generateLeaderboard()` in `insights.ts` will:
1. Call `generateInsights()` (already has 1,789 entries)
2. Filter out warnings and country-level insights (crop-specific only)
3. Filter out generic categories ("Other Vegetables", etc.)
4. Deduplicate by `country+crop` — keep highest-scoring signal per pair
5. Enrich each with revenue/ha, exports, risk data from existing getters
6. Sort by score descending, return top 50

**Frontend: Leaderboard section on Dashboard**

Replace the current 3-card "Top Investment Signals" section with:
- A sortable table (20 visible rows, "Show all 50" toggle)
- Columns: Rank, Country+Crop, Signal Type badge, Score, Rev/ha, Growth %, Exports $M
- Filters above the table:
  - Region dropdown (All / East / West / Central / North / Southern Africa)
  - Signal type pills (All / Growth / Yield Gap / Trade / Opportunity)
- Each row is a clickable link to `/explore/{country}/{crop}`
- Keep the existing 3 insight cards as a "Featured Signals" row above the table for visual appeal

### Implementation

#### Server changes (`insights.ts`)
- Add `generateLeaderboard()` function
- Import `getBestPrice`, `getTradeData`, `getWorldBankData` (already imported)
- Deduplicate across insight types — one row per country+crop

#### Server changes (`routes.ts`)
- Add `GET /api/leaderboard` endpoint, calls `generateLeaderboard()`

#### Client changes (`Dashboard.tsx`)
- Add `useQuery` for `/api/leaderboard`
- Add filter state: `region` (string), `signalType` (string)
- Render sortable table with `useMemo` for filtered/sorted data
- Sort state: column key + direction

---

## Feature 2: Risk-Adjusted Filter

### Problem
High-score opportunities may be in unstable countries (e.g., South Sudan 15th percentile political stability). Investors need to filter by risk tolerance.

### Design

Add a "Min. stability" slider to the leaderboard filters (0–100 percentile, default 0 = show all). The slider filters `politicalStability` on the client side — no API change needed since the data is already in each leaderboard entry.

Also add `logisticsIndex` as a secondary filter (min 1.0–5.0, default 0 = show all).

Both columns are visible in the table and sortable.

### Implementation

#### Client changes (`Dashboard.tsx`)
- Add slider state for `minStability` and `minLogistics`
- Apply in the `useMemo` filter chain
- Show the values in the table with conditional coloring:
  - Political stability: red <25, amber 25-50, green >50
  - Logistics: red <2.5, amber 2.5-3.5, green >3.5

---

## Feature 3: Top 3 Crops for Investment (Country Page)

### Problem
Country pages show 40+ crops sorted by production volume. Users must scroll to discover that Sesame ($1,385/ha rev, +201% growth) is a much better investment than Yams ($311/ha, +45%) despite lower tonnage.

### Design

**New API: `GET /api/country/:name/top-crops`**

Returns top 3 crops for investment in that country, ranked by a composite "Crop Fit" score:
- 30% revenue/ha (normalized)
- 30% production growth CAGR
- 20% yield gap (upside potential)
- 20% export value

```typescript
interface TopCrop {
  crop: string;
  fitScore: number;       // 0-100
  revenuePerHa: number | null;
  prodGrowth: number;     // CAGR %
  yieldGap: number | null; // % below continent avg
  exportValue: number | null;
  reason: string;         // one-liner: "High revenue, strong export growth"
}
```

**Frontend: New section on `CountryView.tsx`**

Above the "Crop Performance" grid, add a "Top Crops for Investment" section:
- 3 highlight cards in a row
- Each card shows: crop name, fit score, revenue/ha, key reason
- Click navigates to the crop detail page
- Gold/silver/bronze visual treatment (subtle, using existing badge component)

### Implementation

#### Server changes
- Add `generateTopCrops(country: string)` in `insights.ts`
- Add `GET /api/country/:name/top-crops` in `routes.ts`

#### Client changes (`CountryView.tsx`)
- Add `useQuery` for the endpoint
- Render 3-card highlight section above the crop grid

---

## Feature 4: Similar Opportunities (Detail Page)

### Problem
Detail pages (CropDetail) dead-end — no discovery loop. Users view one crop and leave.

### Design

**New API: `GET /api/similar/:country/:crop`**

Returns 3 similar opportunities based on:
1. Same region, different crop with higher score (cross-sell)
2. Same crop, different country with notable difference (benchmark)
3. Same category/family, anywhere (related discovery)

```typescript
interface SimilarOpportunity {
  country: string;
  crop: string;
  reason: string;  // "Higher revenue in same region", "15% yield gap vs Nigeria"
  score: number;
  revenuePerHa: number | null;
  prodGrowth: number;
}
```

**Frontend: Section at bottom of `CropDetail.tsx`**

- "You Might Also Consider" section
- 3 horizontal cards with reason, key metric, and link
- Uses existing card styling

### Implementation

#### Server changes
- Add `generateSimilarOpportunities(country, crop)` in `insights.ts`
- Add `GET /api/similar/:country/:crop` in `routes.ts`

#### Client changes (`CropDetail.tsx`)
- Add `useQuery` for the endpoint
- Render at the bottom of the page, before any footer

---

## Verification Plan

### Automated
1. **API tests** — `curl` each new endpoint and validate response shape:
   - `GET /api/leaderboard` — returns array, ≥20 entries, each has required fields
   - `GET /api/country/Nigeria/top-crops` — returns exactly 3 entries
   - `GET /api/similar/Nigeria/Sesame` — returns exactly 3 entries
2. **Diversity checks** — verify leaderboard has no duplicate country+crop pairs
3. **Risk filter** — verify filtering by stability percentile >30 excludes known unstable countries

### Manual (browser)
1. Open Overview page → leaderboard table visible with 20 rows
2. Click Region filter → table updates
3. Click column headers → table sorts
4. Click a row → navigates to crop detail
5. Adjust stability slider → low-stability countries disappear
6. Open a Country page → "Top 3 Crops" section above crop grid
7. Open a Crop Detail page → "Similar Opportunities" section at bottom
