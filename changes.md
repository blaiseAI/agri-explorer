# AgriScope — Developer Change Guide

Complete specification for all required changes. Work through sections in order — **Section 1 is the highest priority** as it unlocks the core investment use case. Sections 2–4 are display/UX fixes that can be shipped in parallel. Section 5 is new World Bank indicators that enrich signals.

***

## Section 1 — The Real Data Gap: FAOSTAT Producer Prices (HIGHEST PRIORITY)

### Why this matters
Right now the tool shows *what is growing* but not *what it's worth*. Wiring in Producer Prices unlocks an estimated gross revenue per hectare — turning AgriScope from a data explorer into an investment screener.

### What the data is
**FAOSTAT Producer Prices domain — `PP`**
- URL: `https://www.fao.org/faostat/en/#data/PP`
- Bulk Africa download: `https://bulks-faostat.fao.org/production/Prices_E_Africa.zip`
- Coverage: ~180 crop/country combinations across Africa, years 1991–2023
- Elements available: `Producer Price (USD/tonne)`, `Producer Price (LCU/tonne)`
- Last updated: 2025

### API endpoint (preferred over bulk download)
```
GET https://fenixservices.fao.org/faostat/api/v1/en/data/PP
  ?area=<FAO_country_code>
  &item=<FAO_item_code>
  &element=5532           ← Producer Price (USD/tonne)
  &year=2015:2023
  &output_type=objects
```

Use `element=5532` for USD/tonne (consistent across countries). Avoid LCU — requires exchange rate normalization.

### Implementation steps

**Step 1 — Fetch and store prices**
Add a new data fetching module `src/data/producerPrices.js` (or `.ts`):
```js
// Fetch producer price for a given FAO area code + item code
// Returns array of { year, price_usd_per_tonne }
export async function fetchProducerPrices(areaCode, itemCode) {
  const url = `https://fenixservices.fao.org/faostat/api/v1/en/data/PP`
            + `?area=${areaCode}&item=${itemCode}&element=5532`
            + `&year=2015:2023&output_type=objects`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data.map(d => ({ year: d.Year, price: parseFloat(d.Value) }));
}
```

**Step 2 — Map your crop names to FAO item codes**
Your app uses crop names (e.g. "Bananas", "Cassava"). FAOSTAT uses numeric item codes. Build a lookup table:

| Crop name in app | FAO Item Code | FAO Item Name |
|---|---|---|
| Bananas | 486 | Bananas |
| Cassava | 125 | Cassava |
| Maize | 56 | Maize (corn) |
| Rice | 27 | Rice |
| Yams | 116 | Yams |
| Sugar Cane | 156 | Sugar cane |
| Sweet Potatoes | 122 | Sweet potatoes |
| Sorghum | 83 | Sorghum |
| Millet | 79 | Millet |
| Groundnuts | 242 | Groundnuts |
| Tomatoes | 388 | Tomatoes |
| Wheat | 15 | Wheat |
| Cocoa | 661 | Cocoa beans |
| Coffee | 656 | Coffee, green |
| Cotton | 328 | Seed cotton |
| Cowpeas | 195 | Cowpeas, dry |
| Cashew Nuts | 217 | Cashew nuts, in shell |
| Plantains | 489 | Plantains |
| Chillies & Peppers | 401 | Chillies & peppers |

Store this as a constant in `src/data/faoItemCodes.js`.

**Step 3 — Compute Revenue Per Hectare on the crop detail page**
On the `CountryCrop` detail page (e.g. `/explore/Nigeria/Bananas`), after loading yield and price data:

```js
// yield is in hg/ha from FAOSTAT — convert to tonnes/ha first
const yieldTonnesPerHa = latestYield / 10000;

// Get most recent price (last 3yr avg is more stable than single year)
const recentPrices = producerPrices
  .filter(p => p.year >= latestYear - 2)
  .map(p => p.price);
const avgPrice = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;

const estimatedRevenuePerHa = yieldTonnesPerHa * avgPrice;
// Display as: "Est. ~$X,XXX/ha gross revenue (based on FAOSTAT producer prices, 3yr avg)"
```

**Step 4 — Display on the crop detail page**
Add a fifth KPI card next to the existing four:
```
Est. Gross Revenue
~$2,400/ha
Based on yield × FAOSTAT producer price (3yr avg, USD)
```
Style it with a subtle disclaimer: "Gross only — does not include input costs. For orientation purposes."

**Step 5 — Handle missing price data gracefully**
Not every crop × country pair has price data. If `producerPrices` returns empty:
- Hide the revenue card entirely (do not show "—")
- Add a tooltip on the crop name: "Producer price data not available for this crop/country in FAOSTAT"

**Step 6 — Add a Revenue/Ha sort option on the Crops page**
On `/crops`, in the "Sort by:" bar, add a **Revenue** option:
```
Sort by: Production | Yield | Area | Yield Gap | Exports | Growth | Revenue/Ha ←new
```
This ranks countries by estimated gross revenue per hectare for the selected crop — the most actionable investor sort.

***

## Section 2 — Switch Trade Source: FAOSTAT TCL as Primary (replaces Comtrade gaps)

### Problem
Many African countries don't report to UN Comtrade, causing widespread "No trade data" cards. FAOSTAT Trade (TCL domain) has significantly better African coverage and was updated December 23, 2025.

### What to do
**Step 1 — Add FAOSTAT TCL as the primary trade data source**

Bulk download:
```
https://bulks-faostat.fao.org/production/Trade_CropsLivestock_E_Africa.zip
(11.72 MB)
```

Or via API:
```
GET https://fenixservices.fao.org/faostat/api/v1/en/data/TCL
  ?area=<FAO_country_code>
  &item=<FAO_item_code>
  &element=5922           ← Export Value (USD 1000s)
  &year=2010:2024
  &output_type=objects
```
Element codes:
- `5922` = Export Value (1000 USD)
- `5910` = Export Quantity (tonnes)
- `5610` = Import Value (1000 USD)
- `5600` = Import Quantity (tonnes)

**Step 2 — Update empty state copy**
Replace all instances of "No trade data" with:
```
"Trade data not reported to UN Comtrade.
 FAOSTAT trade data also unavailable for this crop/country pair."
```
Only show this message if *both* sources return null. If FAOSTAT TCL has data, show it.

**Step 3 — Update Data Sources section on the Overview page**
Change the UN Comtrade description from:
> "International trade flow data — agricultural export values"

To:
> "Bilateral trade flows used for export destination data. Primary trade data sourced from FAOSTAT TCL for broader African coverage."

***

## Section 3 — Display / UX Fixes (No New Data Required)

These are all purely frontend changes using data already loaded.

### 3a — KPI cards: add production trend delta badges

On the Overview page stat cards (Cassava, Maize, Sugar Cane, Yams), add a growth badge below the total:

```jsx
// Compute CAGR from production series (2010 → latest year)
const cagr = ((latestValue / baseValue) ** (1 / years) - 1) * 100;

// Display:
<span className="trend-badge positive">+{cagr.toFixed(1)}%/yr</span>
```

Same pattern on country crop performance cards — the CAGR is already being computed for signals, just surface it on the card summary too.

### 3b — Chart axis labels

**Countries page — Export Trade chart:**
The x-axis currently goes 0–100 with no unit. Add:
```
x-axis label: "Export Value Share (%)"
```
Or if the values are absolute USD: label as `"Export value (USD millions)"` — confirm which unit your data is in and label accordingly.

**Crop detail page — Production Trend chart:**
The y-axis label already says "thousands of tonnes" in the subtitle. Promote this to the y-axis itself:
```
y-axis label: "Production (thousand tonnes)"
```

### 3c — Filter country cards with all-null data

On the Crops page (`/crops`), in the Country Details grid, before rendering a card check:
```js
if (!card.production && !card.yield && !card.area) {
  return null; // Don't render Uganda-style empty cards
}
```
If you want to preserve the count ("49 countries"), adjust the count to show:
```
"Country Details (42 countries with data)"
```

### 3d — Fix the "Premium Signal Preview" teaser card

Currently the third slot in Top Investment Signals on the Overview is a locked teaser that leads nowhere. Either:

**Option A (quickest):** Replace it with a third real signal card computed from existing data (e.g. highest export growth rate signal).

**Option B (if premium tier is planned):** Add a modal or route (`/signals/premium`) so the card actually navigates somewhere, even if it's just a "coming soon" page.

Do not leave a dead-end card on the main dashboard — it reads as broken.

### 3e — Large negative delta callout (e.g. Cashew Nuts -89.8%)

When production CAGR is below -20% OR yield CAGR is below -30%, auto-generate a warning note on the crop card:

```jsx
{cagr < -20 && (
  <p className="warning-note">
    ⚠ Sharp decline detected. May reflect data revision, crop disease, or
    land use change. Verify with local sources before making decisions.
  </p>
)}
```

### 3f — Yield gap warning: refine from block to badge

Currently the yield gap warning is a full-width amber banner below the card content:
```
⚠ 46% below Africa average yield
```
Refactor to a small inline badge on the Yield stat:
```
Yield  58,405 hg/ha  [↓46% vs Africa avg]
```
This keeps the card tidy while preserving the signal visibility.

***

## Section 4 — New World Bank Indicators (New API Calls Required)

These add risk and context signals. All use the World Bank REST API:
```
GET https://api.worldbank.org/v2/country/{iso2_code}/indicator/{indicator_id}
  ?format=json&mrv=1&per_page=1
```

Add a new data module `src/data/worldBankExtended.js`:

```js
const INDICATORS = {
  politicalStability:  'PV.PER.RNK',      // Political Stability percentile (0–100)
  ruleOfLaw:           'RL.PER.RNK',      // Rule of Law percentile (0–100)
  corruption:          'CC.PER.RNK',      // Control of Corruption percentile
  logisticsIndex:      'LP.LPI.OVRL.XQ',  // Logistics Performance Index (1–5)
  irrigatedLand:       'AG.LND.IRIG.AG.ZS', // Irrigated land % of ag land
  precipitation:       'AG.LND.PRCP.MM',  // Avg precipitation mm/yr
  climateExposure:     'EN.CLC.MDAT.ZS',  // Drought/flood/extreme temp exposure %
  fertilizerUse:       'AG.CON.FERT.ZS',  // Fertilizer kg/ha
  agValueGrowth:       'NV.AGR.TOTL.KD.ZG', // Ag sector annual % growth
  fdiInflows:          'BX.KLT.DINV.WD.GD.ZS', // FDI net inflows % GDP
};
```

### Where to use each indicator

**On the Country page (`/countries`):**

Add a new "Investment Climate" summary section below the existing GDP chart, showing:

| Indicator | Display label | Format |
|---|---|---|
| `PV.PER.RNK` | Political Stability | Percentile score out of 100 with color (green ≥60, amber 30–59, red <30) |
| `RL.PER.RNK` | Rule of Law | Same color scale |
| `LP.LPI.OVRL.XQ` | Logistics Score | Out of 5.0 |
| `AG.LND.IRIG.AG.ZS` | Irrigated Land | % — higher = less rain-dependent |
| `NV.AGR.TOTL.KD.ZG` | Ag Sector Growth | Annual % — shows sector momentum |

**On the Crop Detail page (`/explore/{country}/{crop}`):**

Add a "Risk Factors" section below the Signals:

```
Risk Factors for [Country]
Political Stability:  62nd percentile  [LOW RISK]
Logistics Score:      2.8 / 5.0        [MEDIUM]
Climate Exposure:     34% population   [MEDIUM]
Irrigated Land:       12%              [Rain-dependent]
```

**On the Overview — Top Investment Signals:**

Use `PV.PER.RNK` + `LP.LPI.OVRL.XQ` + production CAGR to compute a composite **Opportunity Score**:

```js
// Simple composite — tweak weights as needed
const opportunityScore =
  (productionCAGR * 0.35) +
  (yieldCAGR * 0.25) +
  ((politicalStability / 100) * 0.20) +
  ((logisticsScore / 5) * 0.20);
```

This replaces the current hardcoded 95/100 and 88/100 scores with dynamically computed values, making the signals section defensible and auto-updating.

***

## Section 5 — The Export Orientation Tag

On every crop country card (both on the Country page and the Crops page), add a tag indicating whether the crop is primarily for export or domestic consumption:

```js
// Compute export ratio
const exportRatio = exportValueUSD / (productionTonnes * avgProducerPriceUSD);

const tag = exportRatio > 0.30 ? 'Export-oriented'
          : exportRatio > 0.05 ? 'Mixed market'
          : 'Domestic market';
```

Display as a small tag:
```
[Export-oriented]  [Mixed market]  [Domestic market]
```

This requires both FAOSTAT TCL (export value) and FAOSTAT PP (producer price) to be wired in — so implement after Sections 1 and 2.

***

## Implementation Order

| Priority | Section | Effort | Impact |
|---|---|---|---|
| 1 | FAOSTAT Producer Prices (Section 1)