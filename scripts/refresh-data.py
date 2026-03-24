#!/usr/bin/env python3
"""
Afrixplorer Data Refresh Script — Full Africa Edition
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
import sqlite3
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

# ──────────────────── WFP Food Prices (HDX) ────────────────────

FARMGATE_DISCOUNT = 0.50  # WFP prices are retail; farmgate ≈ 50% of retail

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
    "TZA": "united-republic-of-tanzania", "ETH": "ethiopia", "CMR": "cameroon",
    "MOZ": "mozambique", "MWI": "malawi", "ZMB": "zambia", "RWA": "rwanda",
    "SEN": "senegal", "MLI": "mali", "BFA": "burkina-faso", "NER": "niger",
    "TCD": "chad", "BEN": "benin", "TGO": "togo", "CIV": "cote-d-ivoire",
    "SLE": "sierra-leone", "LBR": "liberia", "GIN": "guinea", "MDG": "madagascar",
    "ZWE": "zimbabwe", "NAM": "namibia", "BWA": "botswana", "LSO": "lesotho",
    "SWZ": "eswatini", "ZAF": "south-africa", "SDN": "sudan", "SSD": "south-sudan",
    "SOM": "somalia", "DJI": "djibouti", "ERI": "eritrea",
    "COD": "democratic-republic-of-the-congo",
    "COG": "congo", "CAF": "central-african-republic", "GAB": "gabon",
    "BDI": "burundi", "AGO": "angola", "MRT": "mauritania",
    "EGY": "egypt", "MAR": "morocco", "TUN": "tunisia", "DZA": "algeria",
    "LBY": "libya", "GMB": "gambia", "GNB": "guinea-bissau", "MUS": "mauritius",
}

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_DIR, "server", "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "live-data.json")
DB_FILE = os.path.join(DATA_DIR, "afrixplorer.db")

DB_SCHEMA = """
CREATE TABLE metadata (
    key TEXT PRIMARY KEY,
    value TEXT
);
CREATE TABLE global_avg_yields (
    crop TEXT PRIMARY KEY,
    yield_hg_ha REAL
);
CREATE TABLE crop_metrics (
    country TEXT,
    crop TEXT,
    element TEXT,
    year INTEGER,
    value REAL,
    PRIMARY KEY (country, crop, element, year)
);
CREATE TABLE trade_metrics (
    country TEXT,
    crop TEXT,
    element TEXT,
    year INTEGER,
    value_usd_millions REAL,
    PRIMARY KEY (country, crop, element, year)
);
CREATE TABLE price_metrics (
    country TEXT,
    crop TEXT,
    source TEXT,
    year INTEGER,
    price_usd_tonne REAL,
    is_proxy INTEGER DEFAULT 0,
    PRIMARY KEY (country, crop, source, year)
);
CREATE TABLE world_bank_metrics (
    country TEXT,
    indicator TEXT,
    year INTEGER,
    value REAL,
    PRIMARY KEY (country, indicator, year)
);
"""

# ──────────────────── Helpers ────────────────────

def fetch_url(url, max_retries=3, timeout=30):
    for attempt in range(max_retries):
        try:
            req = Request(url, headers={"User-Agent": "Afrixplorer/1.0"})
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


def compute_price_proxies(producer_prices, countries_info):
    """For country-crop pairs with stale (>5yr old) prices, compute regional proxy estimates.
    
    Returns: dict  country -> crop -> { "price": float, "year": int, "source": str }
    """
    if not producer_prices or not countries_info:
        return {}
    
    current_year = datetime.now().year
    stale_threshold = current_year - 5  # 2021 for 2026
    
    # Build region lookup: country_display_name -> region
    country_region = {}
    for name, info in countries_info.items():
        country_region[name] = info.get("region", "")
    
    # Build region -> [countries] lookup
    region_countries = {}
    for name, region in country_region.items():
        if region:
            if region not in region_countries:
                region_countries[region] = []
            region_countries[region].append(name)
    
    # For each country-crop, find latest year
    estimates = {}
    filled_count = 0
    
    for country, crops in producer_prices.items():
        region = country_region.get(country, "")
        if not region:
            continue
            
        for crop, year_data in crops.items():
            if not year_data:
                continue
            
            latest_year = max(int(y) for y in year_data.keys())
            
            if latest_year >= stale_threshold:
                continue  # This country-crop has recent data, skip
            
            # Stale! Compute regional proxy
            regional_prices = []
            for peer_country in region_countries.get(region, []):
                if peer_country == country:
                    continue
                peer_crops = producer_prices.get(peer_country, {})
                peer_year_data = peer_crops.get(crop, {})
                if not peer_year_data:
                    continue
                
                # Find this peer's latest price
                peer_latest_year = max(int(y) for y in peer_year_data.keys())
                if peer_latest_year >= stale_threshold:
                    regional_prices.append(peer_year_data[str(peer_latest_year)])
            
            if not regional_prices:
                # Try continent-wide if no regional peers
                for peer_country, peer_crops in producer_prices.items():
                    if peer_country == country:
                        continue
                    peer_year_data = peer_crops.get(crop, {})
                    if not peer_year_data:
                        continue
                    peer_latest_year = max(int(y) for y in peer_year_data.keys())
                    if peer_latest_year >= stale_threshold:
                        regional_prices.append(peer_year_data[str(peer_latest_year)])
                
                if regional_prices:
                    source_label = "Africa avg"
                else:
                    continue  # No proxy data available anywhere
            else:
                source_label = f"{region} avg"
            
            avg_price = round(sum(regional_prices) / len(regional_prices), 1)
            
            if country not in estimates:
                estimates[country] = {}
            estimates[country][crop] = {
                "price": avg_price,
                "year": current_year,
                "source": source_label,
                "peerCount": len(regional_prices),
                "actualLatestYear": latest_year,
                "actualLatestPrice": year_data[str(latest_year)],
            }
            filled_count += 1
    
    print(f"  📊 Generated {filled_count} regional price estimates for "
          f"{len(estimates)} countries with stale data")
    return estimates


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


def fetch_wfp_prices(country_iso3_list, countries_info):
    """Download WFP food prices from HDX for countries with stale FAOSTAT data."""
    print("\n🌍 Fetching WFP food prices from HDX...")

    wfp_prices = {}       # country_display_name -> crop_clean_name -> {year: price_usd_farmgate}
    wfp_proxy_flags = {}  # country_display_name -> crop_clean_name -> True if processed proxy
    countries_fetched = 0
    countries_skipped = 0

    # Build ISO3 → display_name reverse lookup
    iso3_to_display = {}
    for dname, info in (countries_info or {}).items():
        iso3_to_display[info.get("code", "")] = dname

    for iso3 in sorted(country_iso3_list):
        slug = ISO3_TO_HDX_SLUG.get(iso3)
        if not slug:
            continue

        display_name = iso3_to_display.get(iso3, slug.replace("-", " ").title())

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

        # Collect: crop_name -> year -> [prices per tonne farmgate]
        commodity_prices = {}   # crop_name -> year_str -> [price_usd/t farmgate]
        proxy_crops = set()     # crops that used processed proxy

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
            if wfp_name in WFP_PROCESSED_PROXIES:
                proxy_crops.add(crop_name)

            date_str = row.get("date", "")
            if len(date_str) < 4:
                continue
            year_str = date_str[:4]
            try:
                year_int = int(year_str)
            except ValueError:
                continue
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
            country_flags = {}
            for crop_name, year_prices in commodity_prices.items():
                crop_years = {}
                for year_str, prices in year_prices.items():
                    avg = round(sum(prices) / len(prices), 1)
                    crop_years[year_str] = avg
                country_data[crop_name] = crop_years
                if crop_name in proxy_crops:
                    country_flags[crop_name] = True

            wfp_prices[display_name] = country_data
            if country_flags:
                wfp_proxy_flags[display_name] = country_flags
            countries_fetched += 1

        time.sleep(0.5)  # Rate limiting

    print(f"  ✅ WFP prices: {countries_fetched} countries fetched, "
          f"{countries_skipped} skipped, "
          f"{sum(len(v) for v in wfp_prices.values())} crop-country pairs")
    if wfp_proxy_flags:
        proxy_count = sum(len(v) for v in wfp_proxy_flags.values())
        print(f"  📋 {proxy_count} processed proxy mappings (e.g. Maize flour → Maize)")
    return wfp_prices, wfp_proxy_flags


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
                req = Request(url, headers={"User-Agent": "Afrixplorer/1.0"})
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
    print("Afrixplorer Data Refresh — Full Africa")
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

    # 4b. Compute regional price proxies for stale data
    price_estimates = None
    if producer_prices and countries_info:
        try:
            price_estimates = compute_price_proxies(producer_prices, countries_info)
        except Exception as e:
            print(f"  ❌ Price estimates error: {e}")
            price_estimates = None

    # 4c. WFP Food Prices (fallback for stale FAOSTAT prices)
    wfp_prices = None
    wfp_proxy_flags = None
    try:
        iso3_codes_for_wfp = set()
        if countries_info:
            iso3_codes_for_wfp = {v["code"] for v in countries_info.values()}
        wfp_prices, wfp_proxy_flags = fetch_wfp_prices(iso3_codes_for_wfp, countries_info)
    except Exception as e:
        print(f"  ❌ WFP Prices error: {e}")
        wfp_prices = None
        wfp_proxy_flags = None
        errors.append(f"WFP Prices: {str(e)}")

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
                "wfp_prices": {
                    "name": "WFP Food Prices (HDX)",
                    "url": "https://data.humdata.org/dataset/wfp-food-prices",
                    "description": "Market food prices from WFP VAM — farmgate-adjusted (×0.50) for revenue estimates",
                    "status": "ok" if wfp_prices else "failed",
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

    if price_estimates:
        output["priceEstimates"] = price_estimates
    elif "priceEstimates" in existing:
        output["priceEstimates"] = existing["priceEstimates"]
        print("  ⚠️ Using previous price estimates data")

    if wfp_prices:
        output["wfpPrices"] = wfp_prices
        if wfp_proxy_flags:
            output["wfpProxyFlags"] = wfp_proxy_flags
    elif "wfpPrices" in existing:
        output["wfpPrices"] = existing["wfpPrices"]
        if "wfpProxyFlags" in existing:
            output["wfpProxyFlags"] = existing["wfpProxyFlags"]
        print("  ⚠️ Using previous WFP prices data (fetch failed)")
    
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp_db = DB_FILE + ".tmp"
    if os.path.exists(tmp_db):
        os.remove(tmp_db)
    
    conn = sqlite3.connect(tmp_db)
    cur = conn.cursor()
    cur.executescript(DB_SCHEMA)

    # Insert metadata
    cur.execute("INSERT INTO metadata (key, value) VALUES (?, ?)", ("lastUpdated", output["metadata"]["lastUpdated"]))
    cur.execute("INSERT INTO metadata (key, value) VALUES (?, ?)", ("sources", json.dumps(output["metadata"]["sources"])))
    cur.execute("INSERT INTO metadata (key, value) VALUES (?, ?)", ("countries", json.dumps(output["metadata"]["countries"])))
    cur.execute("INSERT INTO metadata (key, value) VALUES (?, ?)", ("crops", json.dumps(output["metadata"]["crops"])))
    cur.execute("INSERT INTO metadata (key, value) VALUES (?, ?)", ("years", json.dumps(output["metadata"]["years"])))
    cur.execute("INSERT INTO metadata (key, value) VALUES (?, ?)", ("errors", json.dumps(output["metadata"]["errors"])))

    # Insert crop_data
    if "cropData" in output:
        for country, crops in output["cropData"].items():
            for crop, elements in crops.items():
                for element, years in elements.items():
                    for year, val in years.items():
                        cur.execute("INSERT INTO crop_metrics (country, crop, element, year, value) VALUES (?, ?, ?, ?, ?)",
                                    (country, crop, element, int(year), val))

    # Insert tradeData
    if "tradeData" in output:
        for country, crops in output["tradeData"].items():
            for crop, years in crops.items():
                for year, val in years.items():
                    cur.execute("INSERT INTO trade_metrics (country, crop, element, year, value_usd_millions) VALUES (?, ?, ?, ?, ?)",
                                (country, crop, "export", int(year), val))

    if "importData" in output:
        for country, crops in output["importData"].items():
            for crop, years in crops.items():
                for year, val in years.items():
                    cur.execute("INSERT INTO trade_metrics (country, crop, element, year, value_usd_millions) VALUES (?, ?, ?, ?, ?)",
                                (country, crop, "import", int(year), val))

    # Insert price_metrics
    if "producerPrices" in output:
        for country, crops in output["producerPrices"].items():
            for crop, years in crops.items():
                for year, val in years.items():
                    cur.execute("INSERT INTO price_metrics (country, crop, source, year, price_usd_tonne) VALUES (?, ?, ?, ?, ?)",
                                (country, crop, "faostat", int(year), val))

    if "wfpPrices" in output:
        flags = output.get("wfpProxyFlags", {})
        for country, crops in output["wfpPrices"].items():
            for crop, years in crops.items():
                is_proxy = 1 if flags.get(country, {}).get(crop) else 0
                for year, val in years.items():
                    cur.execute("INSERT INTO price_metrics (country, crop, source, year, price_usd_tonne, is_proxy) VALUES (?, ?, ?, ?, ?, ?)",
                                (country, crop, "wfp", int(year), val, is_proxy))

    if "priceEstimates" in output:
        for country, crops in output["priceEstimates"].items():
            for crop, estimate in crops.items():
                cur.execute("INSERT INTO price_metrics (country, crop, source, year, price_usd_tonne, is_proxy) VALUES (?, ?, ?, ?, ?, ?)",
                            (country, crop, estimate["source"], int(estimate["year"]), estimate["price"], 1))

    # Insert world_bank_metrics
    if "worldBankData" in output:
        for country, indicators in output["worldBankData"].items():
            for indicator, years in indicators.items():
                if isinstance(years, dict):
                    for year, val in years.items():
                        cur.execute("INSERT INTO world_bank_metrics (country, indicator, year, value) VALUES (?, ?, ?, ?)",
                                    (country, indicator, int(year), val))
                else:
                    cur.execute("INSERT INTO world_bank_metrics (country, indicator, year, value) VALUES (?, ?, ?, ?)",
                                (country, indicator, int(YEAR_END), years))

    # Insert global_avg_yields
    if "globalAvgYields" in output:
        for crop, yield_val in output["globalAvgYields"].items():
            cur.execute("INSERT INTO global_avg_yields (crop, yield_hg_ha) VALUES (?, ?)", (crop, yield_val))

    conn.commit()
    conn.close()

    os.replace(tmp_db, DB_FILE)
    
    file_size = os.path.getsize(DB_FILE)
    print(f"\n{'=' * 60}")
    print(f"✅ {DB_FILE}")
    print(f"   Size: {file_size/1024/1024:.1f} MB")
    print(f"   Countries: {len(countries_list)}")
    print(f"   Crops: {len(crops_list)}")
    print(f"   Years: {available_years[0] if available_years else '?'}–{available_years[-1] if available_years else '?'}")
    if errors:
        print(f"   ⚠️ {errors}")
    print("=" * 60)
    
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
