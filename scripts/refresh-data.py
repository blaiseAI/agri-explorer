#!/usr/bin/env python3
"""
AgriScope Data Refresh Script — Full Africa Edition
Pulls live data from:
  1. FAOSTAT (bulk CSV) - crop production, yields, area harvested for ALL African countries
  2. World Bank API     - agriculture GDP %, rural population %, ag employment %, population
  3. UN Comtrade API    - export/trade values for top exporters

Outputs: server/data/live-data.json
"""

import csv
import io
import json
import os
import sys
import time
import zipfile
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

# ──────────────────── Configuration ────────────────────

# Regions for grouping (ISO3 → region)
REGIONS = {
    # East Africa
    "BDI": "East Africa", "COM": "East Africa", "DJI": "East Africa",
    "ERI": "East Africa", "ETH": "East Africa", "KEN": "East Africa",
    "MDG": "East Africa", "MWI": "East Africa", "MUS": "East Africa",
    "MOZ": "East Africa", "RWA": "East Africa", "SYC": "East Africa",
    "SOM": "East Africa", "SSD": "East Africa", "TZA": "East Africa",
    "UGA": "East Africa", "ZMB": "East Africa", "ZWE": "East Africa",
    # West Africa
    "BEN": "West Africa", "BFA": "West Africa", "CPV": "West Africa",
    "CIV": "West Africa", "GMB": "West Africa", "GHA": "West Africa",
    "GIN": "West Africa", "GNB": "West Africa", "LBR": "West Africa",
    "MLI": "West Africa", "MRT": "West Africa", "NER": "West Africa",
    "NGA": "West Africa", "SEN": "West Africa", "SLE": "West Africa",
    "TGO": "West Africa",
    # Central Africa
    "AGO": "Central Africa", "CMR": "Central Africa", "CAF": "Central Africa",
    "TCD": "Central Africa", "COG": "Central Africa", "COD": "Central Africa",
    "GNQ": "Central Africa", "GAB": "Central Africa", "STP": "Central Africa",
    # North Africa
    "DZA": "North Africa", "EGY": "North Africa", "LBY": "North Africa",
    "MAR": "North Africa", "SDN": "North Africa", "TUN": "North Africa",
    # Southern Africa
    "BWA": "Southern Africa", "SWZ": "Southern Africa", "LSO": "Southern Africa",
    "NAM": "Southern Africa", "ZAF": "Southern Africa",
}

# FAOSTAT country name → display name mapping
FAOSTAT_NAMES = {
    "United Republic of Tanzania": "Tanzania",
    "Côte d'Ivoire": "Ivory Coast",
    "Democratic Republic of the Congo": "DR Congo",
    "Cabo Verde": "Cape Verde",
    "Eswatini": "Eswatini",
    "Sao Tome and Principe": "São Tomé & Príncipe",
    "Guinea-Bissau": "Guinea-Bissau",
}

# M49 → ISO3 mapping for the countries we need
M49_TO_ISO3 = {
    "012": "DZA", "024": "AGO", "072": "BWA", "108": "BDI", "120": "CMR",
    "132": "CPV", "140": "CAF", "148": "TCD", "174": "COM", "178": "COG",
    "180": "COD", "204": "BEN", "231": "ETH", "232": "ERI", "266": "GAB",
    "270": "GMB", "288": "GHA", "324": "GIN", "624": "GNB", "384": "CIV",
    "404": "KEN", "426": "LSO", "430": "LBR", "434": "LBY", "450": "MDG",
    "454": "MWI", "466": "MLI", "478": "MRT", "480": "MUS", "504": "MAR",
    "508": "MOZ", "516": "NAM", "562": "NER", "566": "NGA", "646": "RWA",
    "678": "STP", "686": "SEN", "694": "SLE", "706": "SOM", "710": "ZAF",
    "728": "SSD", "729": "SDN", "748": "SWZ", "788": "TUN", "800": "UGA",
    "834": "TZA", "768": "TGO", "854": "BFA", "818": "EGY", "226": "GNQ",
    "262": "DJI", "690": "SYC", "894": "ZMB", "716": "ZWE",
}

ISO3_TO_M49 = {v: k for k, v in M49_TO_ISO3.items()}

# Crop items to EXCLUDE (aggregates, livestock-derived, processed)
EXCLUDE_KEYWORDS = [
    "total", "primary", "equivalent", "meat", "milk", "eggs", "wool",
    "hides", "skins", "cattle", "sheep", "goats", "pigs", "chicken",
    "asses", "horses", "mules", "camels", "turkeys", "ducks", "beeswax",
    "honey", "rabbits", "pigeons", "buffalo", "snails", "game", "offal",
    "fat", "lard", "tallow", "carcass", "stock", "live animal",
]

# FAOSTAT elements
ELEMENTS = {
    "5510": "production",  # tonnes
    "5412": "yield",       # kg/ha
    "5312": "area",        # ha
}

YEAR_START = 2010
YEAR_END = datetime.now().year

# World Bank indicators
WB_INDICATORS = {
    # Existing
    "NV.AGR.TOTL.ZS": "agGdpPct",
    "SP.RUR.TOTL.ZS": "ruralPct",
    "SL.AGR.EMPL.ZS": "agEmployPct",
    "SP.POP.TOTL":    "population",
    # Section 4 — Investment Climate & Risk
    "PV.PER.RNK":          "politicalStability",   # percentile 0–100
    "RL.PER.RNK":          "ruleOfLaw",             # percentile 0–100
    "CC.PER.RNK":          "corruption",            # percentile 0–100
    "LP.LPI.OVRL.XQ":      "logisticsIndex",        # score 1–5
    "AG.LND.IRIG.AG.ZS":   "irrigatedLand",         # % of ag land
    "AG.LND.PRCP.MM":      "precipitation",          # mm/yr
    "EN.CLC.MDAT.ZS":      "climateExposure",       # % population exposed
    "AG.CON.FERT.ZS":      "fertilizerUse",          # kg/ha
    "NV.AGR.TOTL.KD.ZG":   "agValueGrowth",         # annual % growth
    "BX.KLT.DINV.WD.GD.ZS": "fdiInflows",           # FDI % of GDP
}

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

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, "server", "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "live-data.json")

# ──────────────────── Helpers ────────────────────

def fetch_url(url, max_retries=3, timeout=30):
    for attempt in range(max_retries):
        try:
            req = Request(url, headers={"User-Agent": "AgriScope/1.0"})
            with urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (URLError, HTTPError) as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
    return None

def fetch_json(url, max_retries=3, timeout=30):
    data = fetch_url(url, max_retries, timeout)
    if data:
        try:
            return json.loads(data.decode("utf-8"))
        except json.JSONDecodeError:
            pass
    return None

def clean_crop_name(name):
    """Shorten FAOSTAT's verbose crop names."""
    replacements = {
        "Maize (corn)": "Maize",
        "Coffee, green": "Coffee",
        "Cassava, fresh": "Cassava",
        "Cocoa beans": "Cocoa",
        "Beans, dry": "Beans",
        "Groundnuts, excluding shelled": "Groundnuts",
        "Cow peas, dry": "Cowpeas",
        "Sweet potatoes": "Sweet Potatoes",
        "Soya beans": "Soya Beans",
        "Seed cotton, unginned": "Seed Cotton",
        "Cotton lint, ginned": "Cotton Lint",
        "Cotton seed": "Cotton Seed",
        "Sesame seed": "Sesame",
        "Sugar cane": "Sugar Cane",
        "Coconuts, in shell": "Coconuts",
        "Cashew nuts, in shell": "Cashew Nuts",
        "Oil palm fruit": "Oil Palm",
        "Palm kernels": "Palm Kernels",
        "Sunflower seed": "Sunflower",
        "Plantains and cooking bananas": "Plantains",
        "Mangoes, guavas and mangosteens": "Mangoes",
        "Onions and shallots, dry (excluding dehydrated)": "Onions",
        "Chillies and peppers, green (Capsicum spp. and Pimenta spp.)": "Chillies & Peppers",
        "Chillies and peppers, dry (Capsicum spp., Pimenta spp.), raw": "Dried Peppers",
        "Unmanufactured tobacco": "Tobacco",
        "Raw cane or beet sugar (centrifugal only)": "Raw Sugar",
        "Lemons and limes": "Lemons & Limes",
        "Other vegetables, fresh n.e.c.": "Other Vegetables",
        "Other fruits, n.e.c.": "Other Fruits",
        "Other pulses n.e.c.": "Other Pulses",
        "Other beans, green": "Green Beans",
        "Pumpkins, squash and gourds": "Pumpkins & Squash",
        "Eggplants (aubergines)": "Eggplants",
        "Cucumbers and gherkins": "Cucumbers",
        "Pepper (Piper spp.), raw": "Black Pepper",
        "Ginger, raw": "Ginger",
        "Vanilla, raw": "Vanilla",
        "Carrots and turnips": "Carrots",
        "Cabbages": "Cabbages",
        "Watermelons": "Watermelons",
        "Sisal, raw": "Sisal",
        "Tea leaves": "Tea",
        "Green tea (not fermented), black tea (fermented) and partly fermented tea, in immediate packings of a content not exceeding 3 kg": "Tea (processed)",
        "Pyrethrum, dried flowers": "Pyrethrum",
        "Palm oil": "Palm Oil",
        "Oil of palm kernel": "Palm Kernel Oil",
        "Groundnut oil": "Groundnut Oil",
        "Cottonseed oil": "Cottonseed Oil",
        "Coconut oil": "Coconut Oil",
        "Sunflower-seed oil, crude": "Sunflower Oil",
        "Soya bean oil": "Soya Bean Oil",
        "Oil of sesame seed": "Sesame Oil",
        "Beer of barley, malted": "Beer (Barley)",
        "Other nuts (excluding wild edible nuts and groundnuts), in shell, n.e.c.": "Other Nuts",
        "Oranges": "Oranges",
        "Pineapples": "Pineapples",
        "Avocados": "Avocados",
        "Potatoes": "Potatoes",
    }
    return replacements.get(name, name)

# ──────────────────── FAOSTAT ────────────────────

def fetch_faostat_data():
    """Download FAOSTAT bulk CSV and extract ALL African country/crop data."""
    print("\n📊 Fetching FAOSTAT crop production data (all Africa)...")
    
    url = "https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_Africa.zip"
    zip_data = fetch_url(url, max_retries=3, timeout=120)
    if not zip_data:
        print("  ❌ Failed to download FAOSTAT bulk data")
        return None, None, None
    
    print(f"  Downloaded {len(zip_data)/1024/1024:.1f} MB")
    
    zf = zipfile.ZipFile(io.BytesIO(zip_data))
    csv_name = "Production_Crops_Livestock_E_Africa_NOFLAG.csv"
    
    with zf.open(csv_name) as f:
        content = f.read().decode("utf-8-sig")
    
    reader = csv.DictReader(io.StringIO(content))
    
    # Aggregates to skip
    aggregates = {"Africa", "Eastern Africa", "Western Africa", "Northern Africa",
                  "Southern Africa", "Middle Africa", "Sub-Saharan Africa"}
    
    year_cols = [f"Y{y}" for y in range(YEAR_START, YEAR_END + 1)]
    
    crop_data = {}      # country_display_name -> crop_clean_name -> element -> {year: value}
    countries_info = {}  # country_display_name -> {code, region}
    crop_names_map = {}  # crop_clean_name -> original faostat name
    
    for row in reader:
        area_name = row.get("Area", "").strip()
        if area_name in aggregates:
            continue
        
        item_name = row.get("Item", "").strip()
        element_code = row.get("Element Code", "").strip()
        m49_raw = row.get("Area Code (M49)", "").strip().replace("'", "")
        
        if element_code not in ELEMENTS:
            continue
        
        # Skip livestock/aggregates
        item_lower = item_name.lower()
        if any(kw in item_lower for kw in EXCLUDE_KEYWORDS):
            continue
        
        # Get country display name and ISO3
        display_name = FAOSTAT_NAMES.get(area_name, area_name)
        iso3 = M49_TO_ISO3.get(m49_raw, "")
        region = REGIONS.get(iso3, "Other")
        
        if not iso3:
            continue
        
        # Clean crop name
        crop_clean = clean_crop_name(item_name)
        element = ELEMENTS[element_code]
        
        # Extract year values
        year_data = {}
        for ycol in year_cols:
            val_str = row.get(ycol, "").strip()
            if val_str:
                try:
                    val = float(val_str)
                    year = ycol[1:]
                    
                    if element == "production":
                        year_data[year] = round(val / 1000, 1)  # thousands of tonnes
                    elif element == "yield":
                        year_data[year] = round(val * 10)  # kg/ha → hg/ha
                    elif element == "area":
                        year_data[year] = round(val / 1000, 1)  # thousands of ha
                except ValueError:
                    pass
        
        if not year_data:
            continue
        
        # Store
        if display_name not in crop_data:
            crop_data[display_name] = {}
            countries_info[display_name] = {"code": iso3, "region": region}
        
        if crop_clean not in crop_data[display_name]:
            crop_data[display_name][crop_clean] = {}
        
        crop_data[display_name][crop_clean][element] = year_data
        crop_names_map[crop_clean] = item_name
    
    # Filter: only keep crops that have all 3 elements AND recent data (2020+)
    filtered_data = {}
    all_crops = set()
    
    for country, crops in crop_data.items():
        filtered_crops = {}
        for crop_name, elements in crops.items():
            if "production" in elements and "yield" in elements and "area" in elements:
                # Must have at least some recent data
                prod_years = set(elements["production"].keys())
                recent = {str(y) for y in range(YEAR_END - 4, YEAR_END + 1)}
                if prod_years & recent:
                    # Must have non-trivial production
                    latest_prod = max(elements["production"].values())
                    if latest_prod > 0:
                        filtered_crops[crop_name] = elements
                        all_crops.add(crop_name)
        
        if filtered_crops:
            filtered_data[country] = filtered_crops
    
    # Compute global average yields
    global_yields = {}
    for crop in all_crops:
        yields = []
        for country in filtered_data.values():
            if crop in country and "yield" in country[crop]:
                vals = list(country[crop]["yield"].values())
                if vals:
                    yields.append(vals[-1])  # latest
        if yields:
            global_yields[crop] = round(sum(yields) / len(yields))
    
    print(f"  ✅ {len(filtered_data)} countries, {len(all_crops)} crops")
    
    return filtered_data, countries_info, global_yields


# ──────────────────── FAOSTAT Producer Prices ────────────────────

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


# ──────────────────── FAOSTAT Trade (TCL) ────────────────────

def fetch_faostat_trade():
    """Download FAOSTAT Trade data (Export + Import Value in USD 1000s) for all African countries.
    Element Code 5922 = Export Value (1000 USD).
    Element Code 5622 = Import Value (1000 USD).
    Values are converted to USD millions for consistency with existing tradeData format.
    """
    print("\n📦 Fetching FAOSTAT Trade data (TCL, all Africa)...")

    url = "https://bulks-faostat.fao.org/production/Trade_CropsLivestock_E_Africa.zip"
    zip_data = fetch_url(url, max_retries=3, timeout=180)
    if not zip_data:
        print("  ❌ Failed to download FAOSTAT trade data")
        return None, None

    print(f"  Downloaded {len(zip_data)/1024/1024:.1f} MB")

    zf = zipfile.ZipFile(io.BytesIO(zip_data))
    csv_name = "Trade_CropsLivestock_E_Africa_NOFLAG.csv"

    with zf.open(csv_name) as f:
        content = f.read().decode("utf-8-sig")

    reader = csv.DictReader(io.StringIO(content))

    aggregates = {"Africa", "Eastern Africa", "Western Africa", "Northern Africa",
                  "Southern Africa", "Middle Africa", "Sub-Saharan Africa"}

    year_cols = [f"Y{y}" for y in range(YEAR_START, YEAR_END + 1)]

    export_trade = {}  # country -> crop -> {year: value_usd_millions}
    import_trade = {}  # country -> crop -> {year: value_usd_millions}

    for row in reader:
        area_name = row.get("Area", "").strip()
        if area_name in aggregates:
            continue

        element_code = row.get("Element Code", "").strip()
        if element_code not in ("5922", "5622"):
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
                    # Convert from 1000 USD to millions USD
                    val = float(val_str) / 1000.0
                    if val > 0:
                        year_data[ycol[1:]] = round(val, 1)
                except ValueError:
                    pass

        if not year_data:
            continue

        target = export_trade if element_code == "5922" else import_trade
        if display_name not in target:
            target[display_name] = {}
        target[display_name][crop_clean] = year_data

    print(f"  ✅ FAOSTAT export trade: {len(export_trade)} countries, "
          f"{sum(len(v) for v in export_trade.values())} crop-country pairs")
    print(f"  ✅ FAOSTAT import trade: {len(import_trade)} countries, "
          f"{sum(len(v) for v in import_trade.values())} crop-country pairs")
    return export_trade, import_trade


# ──────────────────── World Bank ────────────────────

def fetch_worldbank_data(country_codes):
    """Fetch World Bank indicators for all African countries."""
    print("\n🏦 Fetching World Bank indicators...")
    
    wb_data = {}
    # World Bank accepts semicolon-separated ISO3 codes, max ~60 per request
    codes_list = list(country_codes)
    
    for indicator_id, indicator_name in WB_INDICATORS.items():
        print(f"  Fetching {indicator_name}...")
        
        # Batch in groups of 50
        for i in range(0, len(codes_list), 50):
            batch = ";".join(codes_list[i:i+50])
            url = (
                f"https://api.worldbank.org/v2/country/{batch}"
                f"/indicator/{indicator_id}"
                f"?format=json&date={YEAR_START}:{YEAR_END}&per_page=1000"
            )
            
            result = fetch_json(url)
            if not result or len(result) < 2 or not result[1]:
                continue
            
            for record in result[1]:
                iso3 = record.get("countryiso3code", "")
                year = record.get("date", "")
                value = record.get("value")
                
                if not iso3 or value is None:
                    continue
                
                if iso3 not in wb_data:
                    wb_data[iso3] = {}
                if indicator_name not in wb_data[iso3]:
                    wb_data[iso3][indicator_name] = {}
                
                if indicator_name == "population":
                    wb_data[iso3][indicator_name][year] = round(value / 1000)
                else:
                    wb_data[iso3][indicator_name][year] = round(value, 1)
            
            time.sleep(0.3)
    
    print(f"  ✅ Data for {len(wb_data)} countries")
    return wb_data


# ──────────────────── UN Comtrade ────────────────────

def fetch_comtrade_data(top_exporters):
    """Fetch trade data for top agricultural exporter countries.
    top_exporters: list of (country_name, comtrade_code, crop_hs_code) tuples
    """
    print("\n🚢 Fetching UN Comtrade trade data (top exporters)...")
    
    trade_data = {}
    years = list(range(YEAR_END - 5, YEAR_END))
    request_count = 0
    
    for country_name, reporter_code, crop_name, hs_code in top_exporters:
        if country_name not in trade_data:
            trade_data[country_name] = {}
        
        yearly = {}
        for year in years:
            url = (
                f"https://comtradeapi.un.org/public/v1/preview/C/A/HS"
                f"?reporterCode={reporter_code}&period={year}"
                f"&cmdCode={hs_code}&flowCode=X"
            )
            try:
                req = Request(url, headers={"User-Agent": "AgriScope/1.0"})
                with urlopen(req, timeout=15) as resp:
                    data = json.loads(resp.read().decode())
                
                if data.get("data"):
                    total = sum(r.get("primaryValue", 0) or 0 for r in data["data"])
                    if total > 0:
                        yearly[str(year)] = round(total / 1_000_000, 1)
                
                request_count += 1
                time.sleep(1.5)
                
            except HTTPError as e:
                if e.code == 429:
                    time.sleep(30)
                continue
            except:
                continue
        
        if yearly:
            trade_data[country_name][crop_name] = yearly
    
    print(f"  ✅ {request_count} requests, data for {sum(len(v) for v in trade_data.values())} country-crop pairs")
    return trade_data


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


# ──────────────────── Main ────────────────────

def main():
    print("=" * 60)
    print("AgriScope Data Refresh — Full Africa")
    print(f"Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 60)
    
    errors = []
    
    # Load existing data as fallback baseline
    existing = {}
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r") as f:
                existing = json.load(f)
            print(f"  📦 Loaded existing data as fallback ({os.path.getsize(OUTPUT_FILE)/1024:.0f} KB)")
        except (json.JSONDecodeError, IOError):
            print("  ⚠️ Could not load existing data, starting fresh")
    
    # 1. FAOSTAT
    try:
        crop_data, countries_info, global_avg_yields = fetch_faostat_data()
        if not crop_data:
            errors.append("FAOSTAT bulk download failed")
    except Exception as e:
        print(f"  ❌ FAOSTAT error: {e}")
        crop_data, countries_info, global_avg_yields = None, None, None
        errors.append(f"FAOSTAT: {str(e)}")
    
    # 2. World Bank
    try:
        iso3_codes = set()
        if countries_info:
            iso3_codes = {v["code"] for v in countries_info.values()}
        wb_raw = fetch_worldbank_data(iso3_codes)
        
        # Remap from ISO3 to country display names
        wb_data = {}
        if countries_info and wb_raw:
            iso3_to_name = {v["code"]: k for k, v in countries_info.items()}
            for iso3, indicators in wb_raw.items():
                name = iso3_to_name.get(iso3)
                if name:
                    wb_data[name] = indicators
    except Exception as e:
        print(f"  ❌ World Bank error: {e}")
        wb_data = None
        errors.append(f"World Bank: {str(e)}")
    
    # 3. UN Comtrade — auto-select top exporters from FAOSTAT data
    top_exporters = []
    if crop_data and countries_info:
        top_exporters = build_top_exporters(crop_data, countries_info)
    
    try:
        comtrade_data = fetch_comtrade_data(top_exporters)
    except Exception as e:
        print(f"  ❌ Comtrade error: {e}")
        comtrade_data = None
        errors.append(f"UN Comtrade: {str(e)}")
    
    # 4. FAOSTAT Producer Prices
    try:
        producer_prices = fetch_faostat_prices()
    except Exception as e:
        print(f"  ❌ Producer Prices error: {e}")
        producer_prices = None
        errors.append(f"Producer Prices: {str(e)}")

    # 5. FAOSTAT Trade (TCL) — primary trade source with better Africa coverage
    faostat_trade = None
    faostat_imports = None
    try:
        faostat_trade, faostat_imports = fetch_faostat_trade()
    except Exception as e:
        print(f"  ❌ FAOSTAT Trade error: {e}")
        errors.append(f"FAOSTAT Trade: {str(e)}")

    # Merge trade data: FAOSTAT TCL as primary, Comtrade as fallback
    trade_data = {}
    if faostat_trade:
        trade_data = {c: dict(crops) for c, crops in faostat_trade.items()}
    if comtrade_data:
        for country, crops in comtrade_data.items():
            if country not in trade_data:
                trade_data[country] = {}
            for crop, years in crops.items():
                if crop not in trade_data[country]:
                    trade_data[country][crop] = years
    if trade_data:
        print(f"\n  📊 Merged trade data: {len(trade_data)} countries, "
              f"{sum(len(v) for v in trade_data.values())} crop-country pairs")
    else:
        trade_data = None
    
    # Build years list
    available_years = set()
    if crop_data:
        for country in crop_data.values():
            for crop in country.values():
                for element in crop.values():
                    available_years.update(element.keys())
    available_years = sorted(available_years)
    
    # Build countries list
    countries_list = []
    if countries_info:
        for name, info in sorted(countries_info.items()):
            countries_list.append({
                "name": name,
                "code": info["code"],
                "region": info["region"],
            })
    
    # Build crops list (sorted by number of countries that produce them)
    crops_coverage = {}
    if crop_data:
        for country, crops in crop_data.items():
            for crop_name in crops:
                if crop_name not in crops_coverage:
                    crops_coverage[crop_name] = 0
                crops_coverage[crop_name] += 1
    crops_list = sorted(crops_coverage.keys(), key=lambda c: crops_coverage[c], reverse=True)
    
    # Output
    output = {
        "metadata": {
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "sources": {
                "faostat": {
                    "name": "FAOSTAT",
                    "url": "https://www.fao.org/faostat/",
                    "description": "Food and Agriculture Organization — crop production, yields, and area harvested",
                    "status": "ok" if crop_data else "failed",
                },
                "worldbank": {
                    "name": "World Bank Open Data",
                    "url": "https://data.worldbank.org/",
                    "description": "Agriculture GDP %, rural population %, agricultural employment %, total population",
                    "status": "ok" if wb_data else "failed",
                },
                "comtrade": {
                    "name": "UN Comtrade",
                    "url": "https://comtradeplus.un.org/",
                    "description": "Bilateral trade flows used for export destination data. Primary trade data sourced from FAOSTAT TCL for broader African coverage.",
                    "status": "ok" if comtrade_data else "skipped",
                },
                "faostat_trade": {
                    "name": "FAOSTAT Trade (TCL)",
                    "url": "https://www.fao.org/faostat/en/#data/TCL",
                    "description": "Primary trade data source — export and import values (USD) for African crops and livestock",
                    "status": "ok" if faostat_trade else "failed",
                },
                "faostat_prices": {
                    "name": "FAOSTAT Producer Prices",
                    "url": "https://www.fao.org/faostat/en/#data/PP",
                    "description": "Producer prices in USD/tonne — used for revenue per hectare estimates",
                    "status": "ok" if producer_prices else "failed",
                },
            },
            "countries": countries_list,
            "crops": crops_list,
            "years": available_years,
            "errors": errors,
        },
    }
    
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

    import_data = faostat_imports or {}
    if import_data:
        output["importData"] = import_data
    elif "importData" in existing:
        output["importData"] = existing["importData"]
        print("  ⚠️ Using previous import data (fetch failed)")

    if producer_prices:
        output["producerPrices"] = producer_prices
    elif "producerPrices" in existing:
        output["producerPrices"] = existing["producerPrices"]
        print("  ⚠️ Using previous producer prices data (fetch failed)")
    
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp_file = OUTPUT_FILE + ".tmp"
    with open(tmp_file, "w") as f:
        json.dump(output, f)  # No indent to save space
    os.replace(tmp_file, OUTPUT_FILE)
    
    file_size = os.path.getsize(OUTPUT_FILE)
    print(f"\n{'=' * 60}")
    print(f"✅ {OUTPUT_FILE}")
    print(f"   Size: {file_size/1024:.0f} KB")
    print(f"   Countries: {len(countries_list)}")
    print(f"   Crops: {len(crops_list)}")
    print(f"   Years: {available_years[0] if available_years else '?'}–{available_years[-1] if available_years else '?'}")
    if errors:
        print(f"   ⚠️ {errors}")
    print("=" * 60)
    
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
