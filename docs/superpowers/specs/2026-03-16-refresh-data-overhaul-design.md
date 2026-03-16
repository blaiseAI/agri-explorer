# refresh-data.py Full Overhaul Design

Incremental refactor of `scripts/refresh-data.py` to eliminate hardcoded values that limit the script's data completeness, maintain freshness over time without manual updates, and handle partial failures gracefully.

## Decisions Made

- **Scope**: Full overhaul — data completeness, maintainability, and robustness
- **Comtrade strategy**: Data-driven, moderate scope — auto-select top 3 exporters for top 20 crops from FAOSTAT results (replaces hardcoded 31-tuple list)
- **Architecture**: Approach A (incremental refactor) — single-file script, keep the "read top to bottom" simplicity

---

## Change 1: Dynamic Year Ranges

**Problem**: `YEAR_END = 2025` and the "recent data" filter `range(2020, 2025)` are both hardcoded and will go stale.

**Solution**:
- `YEAR_END` = `datetime.now().year` (auto-advances each year)
- `YEAR_START` = `2010` (stays fixed — genuine lower bound for FAOSTAT data)
- "Recent data" filter becomes `range(YEAR_END - 4, YEAR_END + 1)` — always "last 5 years"
- Comtrade year range becomes `range(YEAR_END - 5, YEAR_END)` — tracks last 5 years of trade

**Lines affected**: 98–99 (config), 303 (recent filter), 390 (Comtrade years)

---

## Change 2: Data-Driven Comtrade Exporters

**Problem**: Lines 473–512 hardcode 31 country-crop tuples for only 7 crops. Major African exports (maize, rice, wheat, sorghum, cassava, cotton, sugar) have no trade data.

**Solution**:
- Remove the entire `top_exporters` list
- Add a new function `build_top_exporters(crop_data, n_crops=20, n_countries=3)` that:
  1. Ranks all crops by total continental production (sum of latest year across countries)
  2. Takes the top `n_crops`
  3. For each crop, picks the top `n_countries` by production volume
  4. Looks up each crop's HS code from `CROP_TO_HS` (Change 3)
  5. Skips crops without an HS code mapping (no Comtrade fetch for unmapped crops)
  6. Returns the same `(country_name, reporter_code, crop_name, hs_code)` tuple format
- Called between FAOSTAT fetch and Comtrade fetch in `main()`

**Expected output**: ~60 country-crop pairs → ~300 Comtrade requests at 1.5s spacing ≈ ~8 min

**Lines affected**: 383–428 (Comtrade function signature stays same), 471–512 (hardcoded list removed), ~433–470 (new `build_top_exporters` function inserted)

---

## Change 3: Crop-to-HS Code Mapping Table

**New addition**: Static dictionary mapping cleaned crop names → HS 4-digit codes. HS codes are an international trade standard and don't change, so this is a valid static mapping. Placed in the Configuration section near the top of the file.

```python
CROP_TO_HS = {
    "Maize": "1005",
    "Rice": "1006",
    "Wheat": "1001",
    "Sorghum": "1007",
    "Millet": "1008",
    "Barley": "1003",
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

Crops not in this map won't get trade data — clean, explicit opt-in. Easy to extend by adding one line.

---

## Change 4: Robust Error Handling & Fallback

**Problem**: If Comtrade or World Bank fails mid-run, the script can produce a degraded `live-data.json` that loses previously good data.

**Solution**:

1. **Load existing data at start**: Read `live-data.json` at the beginning of `main()` as the fallback baseline
2. **Merge on success**: When a source succeeds, its data replaces the corresponding section in the baseline. When it fails, the baseline data is preserved.
3. **Atomic write**: Write output to `live-data.json.tmp`, then `os.rename()` to `live-data.json`. Prevents corrupt files on crash.
4. **Per-source isolation**: Already mostly in place with try/except blocks. Add a summary at the end showing which sources were refreshed vs. preserved from previous run.

**Lines affected**: `main()` function (~433–610), new helper to load existing data

---

## Change 5: ISO3-to-Comtrade Reporter Code Mapping

**Problem**: The current hardcoded `top_exporters` list embeds Comtrade reporter codes (e.g., `"800"` for Uganda). When we make exporters data-driven, we need a way to map ISO3 codes → Comtrade reporter codes.

**Solution**: The M49 codes in `M49_TO_ISO3` are already Comtrade reporter codes (they're the same standard). Build a reverse lookup `ISO3_TO_M49` from the existing dictionary. No new data needed.

```python
ISO3_TO_M49 = {v: k for k, v in M49_TO_ISO3.items()}
```

---

## Verification Plan

### Automated Test: End-to-end script run
```bash
python3 scripts/refresh-data.py
```
- Verify exit code 0
- Verify `live-data.json` is written with valid JSON
- Verify output summary shows country count (54), crop count (≥100), and no errors
- Verify trade data section contains more than the original 7 crops

### Manual Checks
1. **Compare before/after**: Diff the `metadata.crops` array in `live-data.json` before and after to confirm new crops appear in trade data
2. **Verify the app**: Visit http://localhost:4000 and check that country pages show trade data for crops beyond Coffee/Cocoa/Tea
3. **Fallback test**: Temporarily break the World Bank URL, run the script, and verify it preserves existing World Bank data from the previous `live-data.json`
