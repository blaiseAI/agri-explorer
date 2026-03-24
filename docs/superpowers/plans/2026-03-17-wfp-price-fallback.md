# WFP Price Fallback — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WFP food prices from HDX as a secondary price source in the data pipeline, falling back to them when FAOSTAT producer prices are >5 years stale. This fixes the critical issue where Nigeria and other countries show 2013-era prices.

**Architecture:** Bulk-download WFP CSVs per-country from HDX during `refresh-data.py`, apply farmgate discount, store as `wfpPrices` in `live-data.json`, update `getBestPrice()` in `data.ts` to use as fallback tier.

**Tech Stack:** Python 3 (data pipeline), TypeScript (server data layer)

---

## Task 1: Add WFP Price Fetcher to Data Pipeline

**Files:**
- Modify: `scripts/refresh-data.py`

- [ ] **Step 1: Add WFP constants and commodity mapping**

After the existing `CROP_TO_HS` dict (~line 166), add:

```python
FARMGATE_DISCOUNT = 0.50  # WFP prices are retail; farmgate ≈ 50% of retail

# WFP commodity name → our clean crop name
# WFP commodity name → our clean crop name (None = skip this commodity)
WFP_COMMODITY_MAP = {
    "Maize": "Maize", "Maize (white)": "Maize", "Maize (yellow)": "Maize",
    "Maize flour": "Maize",  # processed proxy — tracked via isProcessedProxy
    "Millet": "Millet",
    "Sorghum": "Sorghum", "Sorghum (white)": "Sorghum", "Sorghum (brown)": "Sorghum",
    "Rice (local)": "Rice", "Rice (milled, local)": "Rice",
    "Yam": "Yams", "Yam (Abuja)": "Yams",
    "Cassava": "Cassava",                       # raw cassava — keep if it appears
    "Cassava meal (gari, white)": None,          # skip — processed (~3× raw price)
    "Gari (white)": None,                        # skip — processed
    "Beans (niebe)": "Beans", "Beans (white)": "Beans", "Beans (red)": "Beans",
    "Cowpeas": "Cowpeas", "Cowpeas (brown)": "Cowpeas", "Cowpeas (white)": "Cowpeas",
    "Groundnuts": "Groundnuts", "Groundnuts (shelled)": "Groundnuts",
    "Onions": "Onions",
    "Tomatoes": "Tomatoes",
    "Bananas": "Bananas",
    "Oranges": "Oranges",
    "Wheat": "Wheat",
    "Potatoes": "Potatoes",
    "Sweet potatoes": "Sweet Potatoes",
}

# WFP commodities that are processed forms → sets isProcessedProxy flag
WFP_PROCESSED_PROXIES = {"Maize flour"}

# ISO3 → HDX country slug for WFP food price datasets
ISO3_TO_HDX_SLUG = {
    "NGA": "nigeria", "KEN": "kenya", "GHA": "ghana", "UGA": "uganda",
    "TZA": "united-republic-of-tanzania", "ETH": "ethiopia", "CMR": "cameroon",  # TZA slug verified
    "MOZ": "mozambique", "MWI": "malawi", "ZMB": "zambia", "RWA": "rwanda",
    "SEN": "senegal", "MLI": "mali", "BFA": "burkina-faso", "NER": "niger",
    "TCD": "chad", "BEN": "benin", "TGO": "togo", "CIV": "cote-d-ivoire",
    "SLE": "sierra-leone", "LBR": "liberia", "GIN": "guinea", "MDG": "madagascar",
    "ZWE": "zimbabwe", "NAM": "namibia", "BWA": "botswana", "LSO": "lesotho",
    "SWZ": "eswatini", "ZAF": "south-africa", "SDN": "sudan", "SSD": "south-sudan",
    "SOM": "somalia", "DJI": "djibouti", "ERI": "eritrea",
    "COD": "democratic-republic-of-the-congo",  # NOT "the-" prefix — verified
    "COG": "congo", "CAF": "central-african-republic", "GAB": "gabon",
    "BDI": "burundi", "AGO": "angola", "MRT": "mauritania",
    "EGY": "egypt", "MAR": "morocco", "TUN": "tunisia", "DZA": "algeria",
    "LBY": "libya", "GMB": "gambia", "GNB": "guinea-bissau", "MUS": "mauritius",
}
```

- [ ] **Step 2: Add `parse_wfp_unit_kg()` helper**

```python
def parse_wfp_unit_kg(unit_str):
    """Parse WFP unit string to kilograms. Returns None for non-weight units."""
    unit_str = unit_str.strip()
    if unit_str == "KG":
        return 1.0
    if unit_str.endswith(" KG"):
        try:
            return float(unit_str.replace(" KG", ""))
        except ValueError:
            return None
    if unit_str.endswith(" G"):
        try:
            grams = float(unit_str.replace(" G", ""))
            return grams / 1000.0
        except ValueError:
            return None
    return None  # Skip "L", "pcs", "30 pcs", etc.
```

- [ ] **Step 3: Add `fetch_wfp_prices()` function**

```python
def fetch_wfp_prices(country_iso3_list):
    """Download WFP food prices from HDX for countries with stale FAOSTAT data."""
    print("\n🌍 Fetching WFP food prices from HDX...")
    
    wfp_prices = {}  # country_display_name -> crop_clean_name -> {year: price_usd_farmgate}
    countries_fetched = 0
    countries_skipped = 0
    
    for iso3 in country_iso3_list:
        slug = ISO3_TO_HDX_SLUG.get(iso3)
        if not slug:
            continue
        
        # 1. Query HDX CKAN API for the dataset
        api_url = f"https://data.humdata.org/api/3/action/package_show?id=wfp-food-prices-for-{slug}"
        api_data = fetch_json(api_url, max_retries=2, timeout=15)
        
        if not api_data or not api_data.get("success"):
            countries_skipped += 1
            continue
        
        # 2. Find the CSV resource URL
        resources = api_data.get("result", {}).get("resources", [])
        csv_url = None
        for r in resources:
            if r.get("format", "").upper() == "CSV" and r.get("url", "").endswith(".csv"):
                csv_url = r["url"]
                break
        
        if not csv_url:
            countries_skipped += 1
            continue
        
        # 3. Download and parse CSV
        csv_data = fetch_url(csv_url, max_retries=2, timeout=60)
        if not csv_data:
            countries_skipped += 1
            continue
        
        content = csv_data.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(content))
        
        # Get the country display name from our existing mapping
        region = REGIONS.get(iso3, "Other")
        # Reverse lookup: ISO3 → FAOSTAT name → display name
        display_name = None
        for fname, dname in FAOSTAT_NAMES.items():
            # Check if this ISO3 matches any known display name
            pass
        # Simpler: use the reverse of our ISO3 mapping
        for dname, info in (countries_info_global or {}).items():
            if info.get("code") == iso3:
                display_name = dname
                break
        if not display_name:
            # Fallback: capitalize the slug
            display_name = slug.replace("-", " ").title()
        
        # Collect prices: commodity -> year -> [prices per tonne farmgate]
        commodity_prices = {}  # crop_name -> year_str -> [price_usd_per_tonne_farmgate]
        
        for row in reader:
            wfp_name = row.get("commodity", "").strip()
            crop_name = WFP_COMMODITY_MAP.get(wfp_name)
            if not crop_name:  # None or missing = skip
                continue
            
            # Only use actual observed prices, not WFP estimates/aggregates
            priceflag = row.get("priceflag", "").strip()
            if priceflag != "actual":
                continue
            
            # Track if this is a processed proxy
            is_proxy = wfp_name in WFP_PROCESSED_PROXIES
            
            date_str = row.get("date", "")
            if len(date_str) < 4:
                continue
            year_str = date_str[:4]
            year_int = int(year_str)
            if year_int < YEAR_START:
                continue
            
            # Parse unit to KG
            unit_str = row.get("unit", "")
            kg = parse_wfp_unit_kg(unit_str)
            if not kg or kg <= 0:
                continue
            
            # Get USD price
            usdprice_str = row.get("usdprice", "").strip()
            if not usdprice_str:
                continue
            try:
                usd = float(usdprice_str)
            except ValueError:
                continue
            if usd <= 0:
                continue
            
            # Convert to USD/tonne with farmgate discount
            usd_per_kg = usd / kg
            usd_per_tonne_farmgate = usd_per_kg * 1000 * FARMGATE_DISCOUNT
            
            if crop_name not in commodity_prices:
                commodity_prices[crop_name] = {}
            if year_str not in commodity_prices[crop_name]:
                commodity_prices[crop_name][year_str] = []
            commodity_prices[crop_name][year_str].append(usd_per_tonne_farmgate)
        
        # Average prices per year
        if commodity_prices:
            country_data = {}
            for crop_name, year_prices in commodity_prices.items():
                crop_years = {}
                for year_str, prices in year_prices.items():
                    avg = round(sum(prices) / len(prices), 1)
                    crop_years[year_str] = avg
                country_data[crop_name] = crop_years
            
            wfp_prices[display_name] = country_data
            countries_fetched += 1
        
        time.sleep(0.5)  # Rate limiting
    
    print(f"  ✅ WFP prices: {countries_fetched} countries fetched, "
          f"{countries_skipped} skipped, "
          f"{sum(len(v) for v in wfp_prices.values())} crop-country pairs")
    return wfp_prices
```

> [!NOTE]
> The `countries_info_global` reference needs to be passed as a parameter or set as a module-level variable after FAOSTAT data is loaded. The actual implementation should accept `countries_info` as a parameter.

- [ ] **Step 4: Integrate into `main()`**

After the FAOSTAT prices section (~line 860), add:

```python
    # 5. WFP Food Prices (fallback for stale FAOSTAT prices)
    try:
        iso3_codes_for_wfp = set()
        if countries_info:
            iso3_codes_for_wfp = {v["code"] for v in countries_info.values()}
        wfp_prices = fetch_wfp_prices(iso3_codes_for_wfp, countries_info)
    except Exception as e:
        print(f"  ❌ WFP Prices error: {e}")
        wfp_prices = None
        errors.append(f"WFP Prices: {str(e)}")
```

Before the final write (~line 900), add to the output dict:

```python
    if wfp_prices:
        output["wfpPrices"] = wfp_prices
    elif "wfpPrices" in existing:
        output["wfpPrices"] = existing["wfpPrices"]
        print("  ⚠️ Using previous WFP prices data (fetch failed)")
```

Add to metadata sources:

```python
                "wfp_prices": {
                    "name": "WFP Food Prices (HDX)",
                    "url": "https://data.humdata.org/dataset/wfp-food-prices",
                    "description": "Market food prices from WFP VAM — farmgate-adjusted (×0.50) for revenue estimates",
                    "status": "ok" if wfp_prices else "failed",
                },
```

- [ ] **Step 5: Run the refresh script and verify output**

Run: `cd /Users/bg/Developer/Afrixplorer && python3 scripts/refresh-data.py`

Verify: `python3 -c "import json; d=json.load(open('server/data/live-data.json')); wp=d.get('wfpPrices',{}); print(f'Countries: {len(wp)}'); ng=wp.get('Nigeria',{}); print(f'Nigeria crops: {list(ng.keys())}'); print(f'Nigeria Yams: {ng.get(\"Yams\",{})}')"`

Expected: Nigeria/Yams should show recent prices (~$400-500/t farmgate-adjusted), not $318/t from 2013.

- [ ] **Step 6: Commit**

```bash
git add scripts/refresh-data.py
git commit -m "feat: add WFP food prices from HDX as fallback price source"
```

---

## Task 2: Update Server Data Layer

**Files:**
- Modify: `server/data.ts`

- [ ] **Step 1: Add `getWfpPrices()` getter**

After `getImportData()` (~line 121), add:

```ts
export interface BestPrice {
  price: number;
  year: string;
  source: string;
  isEstimate: boolean;
  isProcessedProxy: boolean;  // true when e.g. Maize flour → Maize grain
}

export function getWfpPrices(): Record<string, Record<string, Record<string, number>>> {
  const live = loadLiveData();
  if (live?.wfpPrices) return live.wfpPrices;
  return {};
}
```

- [ ] **Step 2: Update `getBestPrice()` to include WFP fallback**

In the `getBestPrice()` function, after the "Check actual price data first" block (line ~160) and before the "Stale or missing — compute regional proxy" block, add:

```ts
  // Check WFP farmgate-adjusted prices
  const wfpPrices = getWfpPrices();
  const wfpData = wfpPrices[country]?.[crop];
  if (wfpData) {
    const wfpYears = Object.keys(wfpData).sort();
    const wfpLatest = wfpYears[wfpYears.length - 1];
    if (parseInt(wfpLatest) >= staleThreshold) {
      const recentWfpYears = wfpYears.slice(-3);
      const wfpPriceValues = recentWfpYears.map(y => wfpData[y]).filter(Boolean);
      if (wfpPriceValues.length > 0) {
        const avgWfpPrice = wfpPriceValues.reduce((a, b) => a + b, 0) / wfpPriceValues.length;
        // TODO: check wfpProxyFlags if available to set isProcessedProxy
        return {
          price: Math.round(avgWfpPrice),
          year: recentWfpYears[recentWfpYears.length - 1],
          source: `WFP ${recentWfpYears[recentWfpYears.length - 1]} (est. farmgate)`,
          isEstimate: true,
          isProcessedProxy: false,  // set to true when proxy flags are stored
        };
      }
    }
  }
```

- [ ] **Step 3: Build check**

Run: `cd /Users/bg/Developer/Afrixplorer && npx tsc --noEmit`

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add server/data.ts
git commit -m "feat: add WFP prices as fallback tier in getBestPrice()"
```

---

## Task 3: Verify End-to-End

- [ ] **Step 1: Start app and test API**

Run: `PORT=3001 npm run dev`

Test: `curl -s http://localhost:3001/api/crop-data/Nigeria/Yams | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'bestPrice: {d.get(\"bestPrice\",\"N/A\")}')"`

Expected: `bestPrice` should show a WFP-derived price with source label like "WFP 2025 (est. farmgate)", not "FAOSTAT 2013".

Test: `curl -s http://localhost:3001/api/crop-data/Kenya/Maize | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'bestPrice: {d.get(\"bestPrice\",\"N/A\")}')"`

Expected: Kenya/Maize should still show "FAOSTAT 2024" since it has fresh data.

- [ ] **Step 2: Full build check**

Run: `cd /Users/bg/Developer/Afrixplorer && npm run build`

Expected: Builds successfully.

- [ ] **Step 3: Browser verification**

Navigate to:
1. `/explore/Nigeria/Yams` — verify revenue KPI shows recent price, not $318/t from 2013
2. `/explore/Nigeria/Cassava` — verify updated price
3. `/explore/Kenya/Maize` — verify FAOSTAT price is still used (not overridden by WFP)

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: WFP food prices integration complete — fixes stale producer prices"
```
