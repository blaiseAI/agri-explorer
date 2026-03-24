# refresh-data.py Overhaul Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all hardcoded values from `scripts/refresh-data.py` that limit data completeness and cause staleness, add data-driven Comtrade exporter selection, and add robust error handling with fallback.

**Architecture:** Incremental refactor of the existing single-file script. All changes are in `scripts/refresh-data.py`. No new files, no new dependencies. The script's top-to-bottom readability is preserved.

**Tech Stack:** Python 3 (stdlib only — no new dependencies)

**Spec:** [`docs/superpowers/specs/2026-03-16-refresh-data-overhaul-design.md`](file:///Users/bg/Developer/Afrixplorer/docs/superpowers/specs/2026-03-16-refresh-data-overhaul-design.md)

---

## Task 1: Dynamic Year Ranges

**Files:**
- Modify: `scripts/refresh-data.py:98-99` (config constants)
- Modify: `scripts/refresh-data.py:303` (recent data filter)
- Modify: `scripts/refresh-data.py:390` (Comtrade year range)

- [ ] **Step 1: Replace hardcoded YEAR_END with dynamic value**

Replace lines 98-99:
```python
YEAR_START = 2010
YEAR_END = 2025
```
With:
```python
YEAR_START = 2010
YEAR_END = datetime.now().year
```

- [ ] **Step 2: Fix the recent data filter to be dynamic**

Replace line 303:
```python
recent = {str(y) for y in range(2020, 2025)}
```
With:
```python
recent = {str(y) for y in range(YEAR_END - 4, YEAR_END + 1)}
```

- [ ] **Step 3: Fix the Comtrade year range to be dynamic**

Replace line 390:
```python
years = list(range(2019, 2024))
```
With:
```python
years = list(range(YEAR_END - 5, YEAR_END))
```

- [ ] **Step 4: Verify the script still runs (smoke test)**

Run:
```bash
python3 -c "
from datetime import datetime
YEAR_END = datetime.now().year
print(f'YEAR_END: {YEAR_END}')
print(f'Recent filter: {set(str(y) for y in range(YEAR_END - 4, YEAR_END + 1))}')
print(f'Comtrade years: {list(range(YEAR_END - 5, YEAR_END))}')
"
```
Expected: `YEAR_END: 2026`, recent filter includes 2022-2026, Comtrade years 2021-2025.

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-data.py
git commit -m "feat(data): make year ranges dynamic based on current year"
```

---

## Task 2: Add CROP_TO_HS Mapping Table

**Files:**
- Modify: `scripts/refresh-data.py` (add new constant after line 107, in the Configuration section)

- [ ] **Step 1: Add the CROP_TO_HS dictionary**

Insert after the `WB_INDICATORS` block (after line 107):

```python
# Crop name → HS 4-digit trade code for Comtrade lookups
CROP_TO_HS = {
    "Maize": "1005",
    "Rice": "1006",
    "Wheat": "1001",
    "Sorghum": "1007",
    "Millet": "1008",
    "Barley": "1003",
    "Oats": "1004",
    "Coffee": "0901",
    "Cocoa": "1801",
    "Tea": "0902",
    "Cassava": "0714",
    "Potatoes": "0701",
    "Sweet Potatoes": "0714",
    "Yams": "0714",
    "Plantains": "0803",
    "Bananas": "0803",
    "Cotton Lint": "5201",
    "Seed Cotton": "5201",
    "Sugar Cane": "1701",
    "Raw Sugar": "1701",
    "Groundnuts": "1202",
    "Sesame": "1207",
    "Soya Beans": "1201",
    "Sunflower": "1206",
    "Oil Palm": "1511",
    "Palm Oil": "1511",
    "Cashew Nuts": "0801",
    "Coconuts": "0801",
    "Avocados": "0804",
    "Mangoes": "0804",
    "Oranges": "0805",
    "Pineapples": "0804",
    "Lemons & Limes": "0805",
    "Vanilla": "0905",
    "Tobacco": "2401",
    "Beans": "0713",
    "Cowpeas": "0713",
    "Onions": "0703",
    "Tomatoes": "0702",
    "Cabbages": "0704",
    "Watermelons": "0807",
    "Black Pepper": "0904",
    "Ginger": "0910",
    "Sisal": "5304",
}
```

- [ ] **Step 2: Add ISO3_TO_M49 reverse lookup**

Insert right after `M49_TO_ISO3` (after line 77):

```python
ISO3_TO_M49 = {v: k for k, v in M49_TO_ISO3.items()}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/refresh-data.py
git commit -m "feat(data): add crop-to-HS code mapping and ISO3 reverse lookup"
```

---

## Task 3: Data-Driven Comtrade Exporter Selection

**Files:**
- Modify: `scripts/refresh-data.py` — add `build_top_exporters()` function, remove hardcoded `top_exporters` list, update `main()` to call the new function

- [ ] **Step 1: Add the `build_top_exporters` function**

Insert before `def main()` (around line 431):

```python
def build_top_exporters(crop_data, countries_info, n_crops=20, n_countries=3):
    """Auto-select top exporter country-crop pairs from FAOSTAT production data."""
    # Rank crops by total continental production (latest year)
    crop_totals = {}
    for country, crops in crop_data.items():
        for crop_name, elements in crops.items():
            if "production" in elements:
                vals = list(elements["production"].values())
                if vals:
                    latest = vals[-1]
                    crop_totals[crop_name] = crop_totals.get(crop_name, 0) + latest

    # Sort by total production, take top n_crops that have HS codes
    ranked = sorted(crop_totals.items(), key=lambda x: x[1], reverse=True)
    top_crops = []
    for crop_name, total in ranked:
        if crop_name in CROP_TO_HS:
            top_crops.append(crop_name)
            if len(top_crops) >= n_crops:
                break

    # For each top crop, find the top n_countries producers
    exporters = []
    for crop_name in top_crops:
        country_prod = []
        for country, crops in crop_data.items():
            if crop_name in crops and "production" in crops[crop_name]:
                vals = list(crops[crop_name]["production"].values())
                if vals:
                    country_prod.append((country, vals[-1]))

        country_prod.sort(key=lambda x: x[1], reverse=True)

        hs_code = CROP_TO_HS[crop_name]
        for country_name, _ in country_prod[:n_countries]:
            info = countries_info.get(country_name)
            if info:
                iso3 = info["code"]
                reporter_code = ISO3_TO_M49.get(iso3, "")
                if reporter_code:
                    exporters.append((country_name, reporter_code, crop_name, hs_code))

    print(f"  📋 Auto-selected {len(exporters)} country-crop pairs across {len(top_crops)} crops")
    return exporters
```

- [ ] **Step 2: Replace hardcoded `top_exporters` in `main()`**

Remove the entire hardcoded `top_exporters` list (lines 473-512) and replace with:

```python
    # 3. UN Comtrade — auto-select top exporters from FAOSTAT data
    top_exporters = []
    if crop_data and countries_info:
        top_exporters = build_top_exporters(crop_data, countries_info)
```

- [ ] **Step 3: Commit**

```bash
git add scripts/refresh-data.py
git commit -m "feat(data): auto-select Comtrade exporters from FAOSTAT production data"
```

---

## Task 4: Robust Error Handling & Fallback

**Files:**
- Modify: `scripts/refresh-data.py` — update `main()` to load existing data, merge on success, and write atomically

- [ ] **Step 1: Add existing data loader at the top of `main()`**

Add at the beginning of `main()`, after the print header:

```python
    # Load existing data as fallback baseline
    existing = {}
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r") as f:
                existing = json.load(f)
            print(f"  📦 Loaded existing data as fallback ({os.path.getsize(OUTPUT_FILE)/1024:.0f} KB)")
        except (json.JSONDecodeError, IOError):
            print("  ⚠️ Could not load existing data, starting fresh")
```

- [ ] **Step 2: Use fallback data when a source fails**

In the output assembly section (around line 581), change from conditional inclusion to merge-with-fallback:

```python
    if crop_data:
        output["cropData"] = crop_data
    elif "cropData" in existing:
        output["cropData"] = existing["cropData"]
        print("  ⚠️ Using previous FAOSTAT data (fetch failed)")

    if global_avg_yields:
        output["globalAvgYields"] = global_avg_yields
    elif "globalAvgYields" in existing:
        output["globalAvgYields"] = existing["globalAvgYields"]

    if wb_data:
        output["worldBankData"] = wb_data
    elif "worldBankData" in existing:
        output["worldBankData"] = existing["worldBankData"]
        print("  ⚠️ Using previous World Bank data (fetch failed)")

    if trade_data:
        output["tradeData"] = trade_data
    elif "tradeData" in existing:
        output["tradeData"] = existing["tradeData"]
        print("  ⚠️ Using previous trade data (fetch failed)")
```

- [ ] **Step 3: Add atomic file write**

Replace the direct write (lines 591-592):
```python
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(output, f)
```
With:
```python
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp_file = OUTPUT_FILE + ".tmp"
    with open(tmp_file, "w") as f:
        json.dump(output, f)
    os.replace(tmp_file, OUTPUT_FILE)
```

- [ ] **Step 4: Commit**

```bash
git add scripts/refresh-data.py
git commit -m "feat(data): add fallback to existing data and atomic file writes"
```

---

## Task 5: End-to-End Verification

- [ ] **Step 1: Run the full script**

```bash
python3 scripts/refresh-data.py
```

Expected output:
- Exit code 0
- `✅` for all three sources (FAOSTAT, World Bank, Comtrade)
- "Auto-selected ~60 country-crop pairs across 20 crops" in Comtrade section
- Output `live-data.json` with valid JSON, 54 countries, 100+ crops

- [ ] **Step 2: Verify trade data has expanded**

```bash
python3 -c "
import json
with open('server/data/live-data.json') as f:
    data = json.load(f)
trade = data.get('tradeData', {})
all_crops = set()
for country_trades in trade.values():
    all_crops.update(country_trades.keys())
print(f'Trade data covers {len(all_crops)} crops: {sorted(all_crops)}')
print(f'Countries with trade data: {len(trade)}')
"
```

Expected: Trade data now covers 15-20 crops (up from 7), including staples like Maize, Rice, Cassava.

- [ ] **Step 3: Verify the app serves the new data**

Open http://localhost:4000 in a browser. Navigate to a country page (e.g., Nigeria or Kenya) and confirm trade data badges appear for the newly added crops.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(data): complete refresh-data.py overhaul — dynamic, data-driven, robust"
```
