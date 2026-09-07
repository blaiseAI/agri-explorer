# `/rankings/{crop}` — Global Crop Ranking Pages — Design

**Status:** Approved for planning
**Depends on:** SEO Phase 1 fixes (merged to `main` at `752767f`) — reuses `server/resolve.ts`, the redirect-middleware pattern, and the server-rendered-body-content pattern from that work.

## Goal

Build a global "which country produces the most X" ranking page for a fixed set of high-value crops, matching the growth-plan doc's Cluster 1 keyword opportunity (~8,500 searches/month combined, KD 1-25, page type doesn't exist yet). This is the highest-leverage item in that doc, because the site's current pages only answer the question for Africa, and almost nobody searches "in Africa" — they search globally or nationally.

## Scope decision: 14 crops, not 15

The growth doc's launch list of 15 included "Milk." The dataset's `crop_metrics` table has zero milk rows — FAOSTAT's crop/livestock export files separate the two, and this codebase's existing fetch pipeline (`scripts/refresh-data.py`'s `EXCLUDE_KEYWORDS` filter) deliberately excludes livestock items from what it calls "crops." Milk is dropped from the launch list rather than force-added, to avoid pulling livestock into a pipeline and a site (Afrixplorer, "136 crops") explicitly scoped to plant crops. No substitute crop is added in its place — 14 is the launch count.

**Launch crops, with their exact `crop_metrics` string (must match exactly for the global-data join to work):**

| Display name | Exact DB string |
|---|---|
| Coffee | `Coffee` |
| Cocoa | `Cocoa` |
| Rice | `Rice` |
| Wheat | `Wheat` |
| Sugarcane | `Sugar Cane` |
| Bananas | `Bananas` |
| Tea | `Tea` |
| Cotton | `Seed Cotton` |
| Maize | `Maize` |
| Potatoes | `Potatoes` |
| Olives | `Olives` |
| Grapes | `Grapes` |
| Cassava | `Cassava` |
| Palm Oil | `Oil Palm` |

## Data flow

### 1. Data pipeline (`scripts/refresh-data.py`)

FAOSTAT publishes a global bulk export alongside the Africa-only one this script already parses — confirmed live: `https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data.zip` (~25MB zipped, contains `Production_Crops_Livestock_E_All_Data_NOFLAG.csv` in the identical wide per-year-column format `fetch_faostat_data()` already parses for the Africa file).

New function `fetch_global_rankings()`, added alongside the existing `fetch_faostat_data()`:

- Downloads the global zip (same `fetch_url()` helper, same retry/timeout pattern).
- Parses `Production_Crops_Livestock_E_All_Data_NOFLAG.csv` with the same `csv.DictReader` approach.
- Filters `Item` to the 14 exact crop strings above (via the existing `clean_crop_name()` — a row only qualifies if `clean_crop_name(row["Item"])` is in the launch set).
- Filters `Element Code` to the existing `ELEMENTS` dict (production/yield/area) — no new element types.
- Skips aggregate rows via a new `GLOBAL_AGGREGATES` exclusion set (continents, economic groupings, "World" — e.g. `{"World", "Africa", "Americas", "Asia", "Europe", "Oceania", "European Union (27)", "Least Developed Countries", "Land Locked Developing Countries", "Small Island Developing States", "Low Income Food Deficit Countries", "Net Food Importing Developing Countries"}` plus the existing Africa sub-region set, since those also appear in the global file). This list is necessarily best-effort/hardcoded, matching the existing code's own approach to the same problem for the Africa-only file — not derived from a schema, because FAOSTAT's bulk export doesn't cleanly separate "real country" rows from "aggregate" rows via any other column.
- Keeps only the latest 2 years of data per country/crop/element (not the full 2010-2024 series the African fetch keeps) — enough for a year-over-year change figure, not a full historical chart. This keeps the new table small and the page's job narrow (a leaderboard, not a time-series explorer — that's what `/crop/{name}` and `/explore/{country}/{crop}` already do).
- For each crop, ranks countries by latest-year production, keeps the top 30.
- For each of those top-30 countries, cross-references its display name against the existing African country list (`countries_info`, already built by `fetch_faostat_data()` in the same run) to attach an ISO3 `code` if it's one of the 54 African countries this site already has pages for. Non-African countries get `code: null`.
- Returns a dict: `{crop_name: [{rank, country, code, production, yield, area, yoy_pct, year}, ...]}`.

Wired into `main()` right after the existing `fetch_faostat_data()` call, using the same non-fatal error pattern already used for every other fetch step (failure appends to `errors[]`, refresh continues).

**New SQLite table** `global_crop_rankings`:
```sql
CREATE TABLE global_crop_rankings (
  crop TEXT NOT NULL,
  rank INTEGER NOT NULL,
  country TEXT NOT NULL,
  code TEXT,              -- ISO3, NULL if not an African country in our existing list
  production REAL NOT NULL,  -- thousands of tonnes, same unit convention as crop_metrics
  yield REAL NOT NULL,       -- hg/ha
  area REAL NOT NULL,        -- thousands of ha
  yoy_pct REAL,              -- NULL if prior year missing
  year TEXT NOT NULL,
  PRIMARY KEY (crop, rank)
);
```

### 2. Server data layer (`server/data.ts`)

New export:
```typescript
export interface GlobalRankingRow {
  rank: number;
  country: string;
  code: string | null;
  production: number;
  yield: number;
  area: number;
  yoyPct: number | null;
  year: string;
}

export function getGlobalRankings(crop: string): GlobalRankingRow[] {
  // reads global_crop_rankings WHERE crop = ?, ordered by rank
  // returns [] if table missing or crop not found — same null-safe
  // fallback pattern as every other getter in this file
}
```

### 3. Page content (`server/content.ts`, `server/seo.ts`)

New `renderRankingsContent(crop: string, rows: GlobalRankingRow[]): string` in `content.ts`:
- `<h1>{crop} Production by Country — World Ranking</h1>`
- Lead paragraph: names the #1 producer, its tonnage, and how it compares — e.g. "Brazil is the world's largest coffee producer, at 3,200 thousand tonnes in 2024 — followed by Vietnam and Colombia. 4 African countries appear in the top 30."
- Full world table: rank, country (as plain text — links are added client-side only for rows with a `code`, since server-rendered links to `/country/{code}` need the same treatment either way, so this can literally emit `<a href="/country/{code}">` server-side for African rows and plain text for others), production, yield, area, YoY%.
- "{Crop} in Africa" subsection: filters `rows` to `code !== null`, shows those as a second, smaller table with an explicit Africa-relative sentence — reuses the same yield-gap-style sentence pattern already established in `renderExploreContent` (e.g. "Ethiopia ranks #6 globally and #1 in Africa, at X thousand tonnes").
- Source/last-updated line, same as the other three render functions.

`seo.ts` gets a new branch for `parts[0] === "rankings" && parts[1]`:
- `const cropName = resolveCrop(parts[1]);` — same validation used everywhere else post-Task-3's security fix. If `cropName` is null, or not in the 14-crop launch set, the branch doesn't fire (falls through to generic defaults, same as an unresolved crop today).
- Title: `` `${cropName} Production by Country — World Ranking | Afrixplorer` ``
- Description: `` `See which countries produce the most ${cropName} globally, with African producers ranked in context. Updated from FAOSTAT data.` ``
- Schemas: `Dataset` (matching the existing `baseDatasetFields()` helper) plus a new `ItemList` schema (`itemListElement` = the top 10 rows, each a `ListItem` with `name`/`position` — Google supports `ItemList` rich results for ranked lists; this is different from the deprecated `HowTo` or the Google-restricts-to-gov/health `FAQPage` types, and is a legitimate fit here) plus `BreadcrumbList` (Home → Crops → {crop} → Rankings, or a simpler Home → {crop} Rankings — match whatever breadcrumb depth reads cleanest against the existing pattern).
- `bodyContent = renderRankingsContent(cropName, getGlobalRankings(cropName))`.

`isKnownRoute` gets a new case: `parts[0] === "rankings" && parts.length === 2` → valid only if `resolveCrop(parts[1])` returns one of the 14 launch crops specifically (not any of the 136) — a technically-valid-crop-but-not-launched-for-rankings URL (e.g. `/rankings/Sorghum`) should 404, not silently render an empty page.

### 4. Redirects (`server/redirects.ts`)

New clause mirroring the existing `crop` clause exactly:
```typescript
} else if (parts[0] === "rankings" && parts.length === 2) {
  const canonical = resolveCrop(parts[1]);
  if (canonical) {
    const decoded = decodeURIComponent(parts[1]);
    if (decoded !== canonical) {
      return res.redirect(301, `/rankings/${encodeURIComponent(canonical)}${req.url.slice(path.length)}`);
    }
  }
}
```
(Case/casing canonicalization only — the "is this one of the 14 launch crops" gate lives in `isKnownRoute`/`seo.ts`, not here, matching how the existing `crop` clause doesn't know or care whether a crop has any actual data either.)

### 5. API route (`server/routes.ts`)

New `GET /api/rankings/:crop`:
```typescript
app.get("/api/rankings/:crop", (req, res) => {
  const crop = resolveCrop(req.params.crop);
  if (!crop) return res.status(404).json({ error: "Crop not found" });
  const rankings = getGlobalRankings(crop);
  if (rankings.length === 0) return res.status(404).json({ error: "No ranking data for this crop" });
  res.json({ crop, rankings });
});
```
This resolves the crop segment via `resolveCrop()` before touching anything — the same lesson Task 3's security fix already applied to `seo.ts`, applied here from the start rather than retrofitted later.

### 6. Sitemap (`server/routes.ts`'s `/sitemap.xml` handler)

New loop, after the existing crop-routes loop:
```typescript
RANKING_CROPS.forEach(crop => {
  const encodedCrop = encodeURIComponent(crop);
  xml += `  <url>\n    <loc>${siteUrl}/rankings/${encodedCrop}</loc>${lastmodTag}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
});
```
`RANKING_CROPS` is the 14-item exact-string list from the table above, defined once (likely exported from `server/resolve.ts` or a small new constant module, so `seo.ts`, `isKnownRoute`, the sitemap, and the client route registration all reference the same source of truth rather than four independent copies of the list).

### 7. Client page (`client/src/pages/RankingsView.tsx`, new)

New wouter route in `App.tsx`: `<Route path="/rankings/:crop" component={RankingsView} />` (lazy-loaded, matching every other page).

Component shape follows `CropView.tsx`'s existing pattern closely:
- `useParams<{ crop: string }>()`, fetches `/api/rankings/:crop` via `useQuery`.
- `document.title` set to match the server-injected title exactly (lesson from Task 4: get this right on day one, don't let it regress on hydration) — since crop here has no code/name duplication (unlike country), there's no raw-param display bug class to worry about, but the title string must still match `seo.ts`'s server-rendered title verbatim.
- Renders: H1, lead sentence (can recompute client-side from the fetched rows, or just re-read from a `summary` field the API could optionally include — simplest is recomputing client-side using the same "top row" logic, no need to duplicate the sentence-generation logic from `content.ts` since the two only need to agree on facts, not exact wording), a sortable world table (reuse `SortHeader` pattern from `CropView.tsx`), a bar chart of the top 10 (reuse existing `recharts` bar-chart pattern), and a distinct "{Crop} in Africa" section with links to `/country/{code}` and `/explore/{code}/{crop}` for rows that have a `code`.
- Back/cross-link to `/crop/{crop}` ("See the full Africa view →") and, for African rows, out to their `/explore/{code}/{crop}` page.

## Error handling

| Scenario | Behavior |
|---|---|
| `/rankings/{crop}` where crop is one of the 14 launch crops, canonical casing | 200, full content |
| `/rankings/{crop}` with wrong casing | 301 to canonical casing |
| `/rankings/{crop}` where crop exists in the 136-crop dataset but isn't one of the 14 launch crops (e.g. `/rankings/Sorghum`) | 404 (gated in `isKnownRoute`) |
| `/rankings/{crop}` where crop doesn't exist at all | 404 (same as today's unknown-crop handling) |
| Data pipeline hasn't populated `global_crop_rankings` yet (e.g. before first refresh run post-deploy) for a launch crop | `getGlobalRankings()` returns `[]`; page still 200s (crop itself is valid/launched) but shows a graceful "ranking data updating" empty state rather than a broken table — same defensive pattern as `content.ts`'s existing `if (series.length === 0) return "";` |
| Global fetch step fails during a refresh run | Non-fatal, same as every other fetch step — logged to `errors[]`, refresh continues, previous data (if any) stays in the table until the next successful run |

## What this does not cover

- No expansion of the site's core per-country historical data (2010-2024 series, trade, prices, World Bank indicators) to non-African countries — that remains Africa-only, by design, per the site's positioning. Global data is scoped narrowly to power this one ranking table (latest 2 years, production/yield/area only).
- No rankings pages for crops outside the 14-crop launch list. Extending later is cheap (the global fetch already parses the full file in one pass; adding a crop to `RANKING_CROPS` and re-running the refresh is enough — no new pipeline code needed), but that's a future decision, not part of this build.
- No changes to the existing `/crop/{name}` (Africa-only) pages — they stay as-is; `/rankings/{crop}` is a new, separate page type, not a replacement.
