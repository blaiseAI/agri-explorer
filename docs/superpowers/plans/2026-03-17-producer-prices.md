# Producer Prices Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate FAOSTAT Producer Prices (USD/tonne) into the data pipeline and frontend to display estimated gross revenue per hectare on crop detail pages and enable Revenue/Ha sorting on the crops comparison page.

**Architecture:** Bulk-download `Prices_E_Africa.zip` during data refresh (same pattern as production data), store in `live-data.json` under `producerPrices` key, expose via `data.ts` getter, enrich existing API responses, and consume in CropDetail/CropView/CountryView React components.

**Tech Stack:** Python 3 (data pipeline), TypeScript/Express (API), React/Recharts (frontend)

---

## Task 1: Add Producer Prices to Data Pipeline

**Files:**
- Modify: `scripts/refresh-data.py`

- [ ] **Step 1: Add `fetch_faostat_prices()` function**

After the existing `fetch_faostat_data()` function (around line 375), add:

```python
def fetch_faostat_prices():
    """Download FAOSTAT Producer Prices (USD/tonne) for all African countries."""
    print("\n💰 Fetching FAOSTAT Producer Prices (all Africa)...")

    url = "https://bulks-faostat.fao.org/production/Prices_E_Africa.zip"
    zip_data = fetch_url(url, max_retries=3, timeout=120)
    if not zip_data:
        print("  ❌ Failed to download FAOSTAT prices data")
        return None

    print(f"  Downloaded {len(zip_data)/1024/1024:.1f} MB")

    zf = zipfile.ZipFile(io.BytesIO(zip_data))
    csv_name = "Prices_E_Africa_NOFLAG.csv"

    with zf.open(csv_name) as f:
        content = f.read().decode("utf-8-sig")

    reader = csv.DictReader(io.StringIO(content))

    aggregates = {"Africa", "Eastern Africa", "Western Africa", "Northern Africa",
                  "Southern Africa", "Middle Africa", "Sub-Saharan Africa"}

    year_cols = [f"Y{y}" for y in range(YEAR_START, YEAR_END + 1)]

    prices = {}  # country_display_name -> crop_clean_name -> {year: price_usd}

    for row in reader:
        area_name = row.get("Area", "").strip()
        if area_name in aggregates:
            continue

        element_code = row.get("Element Code", "").strip()
        if element_code != "5532":  # USD/tonne only
            continue

        months_code = row.get("Months Code", "").strip()
        if months_code != "7021":  # Annual value only
            continue

        m49_raw = row.get("Area Code (M49)", "").strip().replace("'", "")
        iso3 = M49_TO_ISO3.get(m49_raw, "")
        if not iso3:
            continue

        item_name = row.get("Item", "").strip()
        item_lower = item_name.lower()
        if any(kw in item_lower for kw in EXCLUDE_KEYWORDS):
            continue

        display_name = FAOSTAT_NAMES.get(area_name, area_name)
        crop_clean = clean_crop_name(item_name)

        year_data = {}
        for ycol in year_cols:
            val_str = row.get(ycol, "").strip()
            if val_str:
                try:
                    year_data[ycol[1:]] = round(float(val_str), 2)
                except ValueError:
                    pass

        if not year_data:
            continue

        if display_name not in prices:
            prices[display_name] = {}
        prices[display_name][crop_clean] = year_data

    print(f"  ✅ Producer prices for {len(prices)} countries, "
          f"{sum(len(v) for v in prices.values())} crop-country pairs")
    return prices
```

- [ ] **Step 2: Call the function in `main()` and add to output**

In `main()`, after the Comtrade section (~line 584), add:

```python
    # 4. FAOSTAT Producer Prices
    try:
        producer_prices = fetch_faostat_prices()
    except Exception as e:
        print(f"  ❌ Producer Prices error: {e}")
        producer_prices = None
        errors.append(f"Producer Prices: {str(e)}")
```

Before the final `os.makedirs` call (~line 669), add:

```python
    if producer_prices:
        output["producerPrices"] = producer_prices
    elif "producerPrices" in existing:
        output["producerPrices"] = existing["producerPrices"]
        print("  ⚠️ Using previous producer prices data (fetch failed)")
```

Also add to the metadata sources dict:

```python
                "faostat_prices": {
                    "name": "FAOSTAT Producer Prices",
                    "url": "https://www.fao.org/faostat/en/#data/PP",
                    "description": "Producer prices in USD/tonne — used for revenue per hectare estimates",
                    "status": "ok" if producer_prices else "failed",
                },
```

- [ ] **Step 3: Run the refresh script and verify output**

Run: `cd /Users/bg/Developer/agri-explorer && python3 scripts/refresh-data.py`

Expected: Script completes, `server/data/live-data.json` has a `producerPrices` key with country→crop→year→price structure.

Verify: `python3 -c "import json; d=json.load(open('server/data/live-data.json')); pp=d.get('producerPrices',{}); print(f'Countries: {len(pp)}'); print(f'Nigeria crops: {list(pp.get(\"Nigeria\",{}).keys())[:10]}'); print(f'Nigeria Maize prices: {pp.get(\"Nigeria\",{}).get(\"Maize\",{})}')"` 

- [ ] **Step 4: Commit**

```bash
git add scripts/refresh-data.py
git commit -m "feat: add FAOSTAT Producer Prices to data pipeline"
```

---

## Task 2: Add Data Layer + API Routes

**Files:**
- Modify: `server/data.ts`
- Modify: `server/routes.ts`

- [ ] **Step 1: Add `getProducerPrices()` to `data.ts`**

After `getTradeData()` (line ~108), add:

```ts
export function getProducerPrices(): Record<string, Record<string, Record<string, number>>> {
  const live = loadLiveData();
  if (live?.producerPrices) return live.producerPrices;
  return {};
}
```

- [ ] **Step 2: Update `/api/crop-data/:country/:crop` route in `routes.ts`**

Import `getProducerPrices` in the import line (line 3). In the route handler (~line 46), add producer prices to the response:

```ts
    const PRODUCER_PRICES = getProducerPrices();
    const cropPrices = PRODUCER_PRICES[country]?.[crop] || null;

    res.json({
      country,
      crop,
      timeSeries,
      globalAvgYield: GLOBAL_AVG_YIELDS[crop] || null,
      producerPrices: cropPrices,
    });
```

- [ ] **Step 3: Update `/api/crop/:crop` route in `routes.ts`**

In the `/api/crop/:crop` handler, after `const COUNTRIES = getCountries();` add:

```ts
    const PRODUCER_PRICES = getProducerPrices();
```

Then in the country mapping (~line 122), compute `revenuePerHa`:

```ts
      // Compute revenue per hectare from producer prices
      const priceData = PRODUCER_PRICES[c.name]?.[crop];
      let revenuePerHa: number | null = null;
      if (priceData && data.yield[latestYear]) {
        const recentYears = Object.keys(priceData).sort().slice(-3);
        const prices = recentYears.map(y => priceData[y]).filter(Boolean);
        if (prices.length > 0) {
          const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
          const yieldTonnesPerHa = data.yield[latestYear] / 10000;
          revenuePerHa = Math.round(yieldTonnesPerHa * avgPrice);
        }
      }
```

Add `revenuePerHa` to the returned object alongside `tradeValue`.

- [ ] **Step 4: Update `/api/country/:country` route in `routes.ts`**

Similar to crop route: add `PRODUCER_PRICES`, compute `revenuePerHa` for each crop in the country, and include it in the crop object.

- [ ] **Step 5: Verify API responses**

Run: `curl -s http://localhost:4040/api/crop-data/Nigeria/Maize | python3 -m json.tool | head -20`

Expected: `producerPrices` field with year→value pairs.

Run: `curl -s http://localhost:4040/api/crop/Maize | python3 -m json.tool | grep -A1 revenuePerHa | head -10`

Expected: `revenuePerHa` values on country entries.

- [ ] **Step 6: Commit**

```bash
git add server/data.ts server/routes.ts
git commit -m "feat: expose producer prices and revenue/ha via API"
```

---

## Task 3: CropDetail Revenue KPI Card

**Files:**
- Modify: `client/src/pages/CropDetail.tsx`

- [ ] **Step 1: Compute revenue from API response**

After the existing `yieldGap` computation (~line 130), add:

```tsx
  // Revenue per hectare from producer prices
  const producerPrices = data?.producerPrices;
  let revenuePerHa: number | null = null;
  let avgPriceUsed: number | null = null;
  if (producerPrices && last?.yield) {
    const recentYears = Object.keys(producerPrices).sort().slice(-3);
    const prices = recentYears.map(y => producerPrices[y]).filter(Boolean);
    if (prices.length > 0) {
      avgPriceUsed = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
      const yieldTonnesPerHa = last.yield / 10000;
      revenuePerHa = Math.round(yieldTonnesPerHa * avgPriceUsed);
    }
  }
```

- [ ] **Step 2: Add the revenue KPI card**

After the 4th summary card (Yield vs Africa Average, ~line 242), add:

```tsx
        {revenuePerHa !== null && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1">Est. Gross Revenue</p>
              <span className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                ~${revenuePerHa.toLocaleString()}/ha
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                yield × producer price ({avgPriceUsed ? `$${Math.round(avgPriceUsed)}/t avg` : '3yr avg'})
              </p>
            </CardContent>
          </Card>
        )}
```

Change the grid from `grid-cols-2 lg:grid-cols-4` to `grid-cols-2 lg:grid-cols-5` when there are 5 cards, or keep as 4 and let it wrap. Better: use `grid-cols-2 md:grid-cols-3 lg:grid-cols-5`.

- [ ] **Step 3: Build check**

Run: `cd /Users/bg/Developer/agri-explorer && npx tsc --noEmit`

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/CropDetail.tsx
git commit -m "feat: add revenue per hectare KPI card on crop detail page"
```

---

## Task 4: CropView Revenue Sort

**Files:**
- Modify: `client/src/pages/CropView.tsx`

- [ ] **Step 1: Add `revenue` to `SortField` type**

Line 68: Change to:
```ts
type SortField = "production" | "yield" | "area" | "yieldGap" | "trade" | "growth" | "revenue";
```

- [ ] **Step 2: Add sort case in `sortedCountries` useMemo**

Line ~194, add before the closing `}`:
```ts
        case "revenue": aVal = a.revenuePerHa || 0; bVal = b.revenuePerHa || 0; break;
```

- [ ] **Step 3: Add `SortHeader` button**

After the Growth sort header (~line 455), add:
```tsx
          <SortHeader field="revenue" label="Revenue/Ha" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
```

- [ ] **Step 4: Build check and commit**

Run: `npx tsc --noEmit`

```bash
git add client/src/pages/CropView.tsx
git commit -m "feat: add Revenue/Ha sort option on crop comparison page"
```

---

## Task 5: CountryView Revenue Badge

**Files:**
- Modify: `client/src/pages/CountryView.tsx`

- [ ] **Step 1: Display revenue badge on crop cards**

Where crop cards are rendered, add a small badge when `revenuePerHa` is available:

```tsx
{crop.revenuePerHa && (
  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
    ~${crop.revenuePerHa.toLocaleString()}/ha
  </span>
)}
```

- [ ] **Step 2: Build check and commit**

```bash
npx tsc --noEmit
git add client/src/pages/CountryView.tsx
git commit -m "feat: show revenue badge on country crop cards"
```

---

## Task 6: Verify End-to-End

- [ ] **Step 1: Full build check**

Run: `cd /Users/bg/Developer/agri-explorer && npm run build`

Expected: Builds successfully.

- [ ] **Step 2: Browser verification**

Navigate to:
1. `/explore/Nigeria/Maize` — verify revenue KPI card shows with dollar amount
2. `/explore/Nigeria/SomeCropWithNoPrice` — verify no revenue card (no errors)
3. `/crop/Maize` — verify Revenue/Ha sort header and sorting works
4. `/country/Nigeria` — verify revenue badges on crop cards

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: FAOSTAT Producer Prices integration complete"
```
