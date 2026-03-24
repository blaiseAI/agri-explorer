# Decision-Maker Features — Design Spec

Transform Afrixplorer from a data browser into a decision tool by surfacing ranked opportunities directly on the dashboard and detail pages.

## Build Order

1. **Investment Leaderboard** on Overview — top 100 from API, 20 visible rows, sortable/filterable
2. **Risk-adjusted filter** on the leaderboard (default 25th pctl stability, 2.0 logistics)
3. **Top 3 Crops for Investment** on each Country page
4. **Similar Opportunities** on crop detail pages

---

## Feature 1: Investment Leaderboard

### Problem
The Overview page shows only 3 insight cards. Users must browse 54 countries × 136 crops manually to find opportunities.

### Design

**New API endpoint: `GET /api/leaderboard`**

Returns the **top 100** crop×country opportunities ranked by composite score (top 100 to prevent empty states after filtering — truncation to 20/50 rows happens client-side). Enriches existing `generateInsights()` output with:
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
3. Filter out generic categories ("Other Vegetables", "Other Cereals", "Other Crops")
4. Deduplicate by `country+crop` — keep highest-scoring signal per pair
5. Enrich each with revenue/ha, exports, risk data from existing getters
6. Sort by score descending, return top 100

**Frontend: Leaderboard section on Dashboard**

Below the existing 3 insight cards ("Featured Signals"), add:
- A sortable table (20 visible rows, "Show all" toggle)
- Columns: Rank, Country+Crop, Signal Type badge, Score (with ⓘ tooltip), Rev/ha, Growth %, Exports $M
- Score column header ⓘ tooltip: "Composite score based on production growth, revenue/ha, yield gap vs Africa average, and export market strength."
- Filters above the table:
  - Region dropdown (All / East / West / Central / North / Southern Africa)
  - Signal type pills (All / Growth / Yield Gap / Trade / Opportunity)
- Each row is a clickable link to `/explore/{country}/{crop}`
- Export CSV button (matches existing pattern on Country/Crop pages)
- "Data as of 2024 · Scores updated {lastUpdated}" note below table header
- **Empty state**: "No opportunities found — try adjusting your filters" when region/type filters return 0 results

---

## Feature 2: Risk-Adjusted Filter

### Problem
High-score opportunities may be in unstable countries. Without risk defaults, the leaderboard shows South Sudan and CAR at the top based on crop metrics alone — misleading for investors.

### Design

Add to the leaderboard filter row:
- **Min. stability** slider (0–100 percentile, **default 25** — filters out bottom quartile)
- **Min. logistics** slider (0–5.0, **default 2.0** — filters out worst logistics)

Both filter `politicalStability` and `logisticsIndex` client-side. Countries with `null` values pass the filter (insufficient data ≠ bad data).

Both columns visible in the table with conditional coloring:
- Political stability: red <25, amber 25-50, green >50
- Logistics: red <2.5, amber 2.5-3.5, green >3.5

---

## Feature 3: Top 3 Crops for Investment (Country Page)

### Problem
Country pages show 40+ crops sorted by production volume. High-value investment crops are buried.

### Design

**New API: `GET /api/country/:name/top-crops`**

Returns top 3 crops ranked by composite "Crop Fit" score:
- 30% revenue/ha (normalized to 0-100 across country's crops)
- 30% production growth CAGR (normalized)
- 20% yield gap (normalized)
- 20% export value (normalized)

```typescript
interface TopCrop {
  crop: string;
  fitScore: number;       // 0-100
  revenuePerHa: number | null;
  prodGrowth: number;     // CAGR %
  yieldGap: number | null;
  exportValue: number | null;
  reason: string;         // generated from decision tree below
}
```

**Reason decision tree** (prevents contradictory/vague outputs):
1. `exportValue > 10M AND prodGrowth > 50%` → "Strong export growth + rising production"
2. `yieldGap > 30% AND revenuePerHa > 500` → "Large yield gap — high upside potential"
3. `revenuePerHa` is top-quartile for country → "High value crop for this region"
4. `prodGrowth > 100%` → "Rapidly expanding production"
5. Fallback → "Consistent performer"

**Frontend: New section on `CountryView.tsx`**

Above the "Crop Performance" grid:
- 3 highlight cards (gold/silver/bronze subtle badges)
- Each shows: crop name, fit score, revenue/ha, reason
- Clickable → navigates to crop detail
- **Graceful degradation**: if country has <3 crops in dataset, show 1 or 2 cards (not empty slots). If 0 crops, hide the entire section.

---

## Feature 4: Similar Opportunities (Detail Page)

### Problem
Detail pages dead-end — no discovery loop.

### Design

**New API: `GET /api/similar/:country/:crop`**

Returns up to 3 similar opportunities (may be fewer if data is sparse):
1. Same region, different crop with higher score (cross-sell)
2. Same crop, different country with notable difference (benchmark)
3. Same category/family, anywhere (related discovery)

**Deduplication**: explicit `country+crop` dedup before returning results. Priority: type 1 → 2 → 3. If a candidate appears in earlier type, skip and take next best.

```typescript
interface SimilarOpportunity {
  country: string;
  crop: string;
  reason: string;
  score: number;
  revenuePerHa: number | null;
  prodGrowth: number;
}
```

**Frontend: "You Might Also Consider" section at bottom of `CropDetail.tsx`**
- 1-3 horizontal cards (graceful degradation — don't show empty slots)
- Hide entire section if 0 similar opportunities found
- Reason, key metric, and link to explore page

---

## Verification Plan

### Automated (curl tests)
1. `GET /api/leaderboard` — returns array, ≥50 entries, each has all LeaderboardEntry fields, no duplicate country+crop pairs
2. `GET /api/country/Nigeria/top-crops` — returns 1-3 entries with valid fitScore/reason
3. `GET /api/country/Comoros/top-crops` — returns ≤3 entries (sparse data edge case)
4. `GET /api/similar/Nigeria/Sesame` — returns 1-3 entries, no duplicate country+crop
5. `GET /api/similar/Comoros/Bananas` — returns 0-3 entries (sparse data)
6. Verify leaderboard: all entries with `politicalStability < 25` can be filtered out client-side

### Manual (browser)
1. Overview page → leaderboard table visible with 20 rows, "Data as of" badge visible
2. Click Region filter → table updates, shows "No opportunities" if none match
3. Click column headers → table sorts correctly
4. Click a row → navigates to crop detail page
5. Adjust stability slider → low-stability countries disappear
6. Click Export CSV → downloads leaderboard data
7. Country page (Nigeria) → "Top 3 Crops" section visible above crop grid
8. Country page (Comoros) → graceful degradation (fewer cards)
9. Crop detail page → "Similar Opportunities" section at bottom
