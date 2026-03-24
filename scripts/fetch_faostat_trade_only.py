#!/usr/bin/env python3
"""Quick FAOSTAT Trade fetch script — runs standalone without importing refresh-data.py."""
import io, csv, json, zipfile, os, re
from urllib.request import urlopen, Request

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server", "data", "live-data.json")

# Read the existing file to extract country name mappings
with open(DATA_FILE, "r") as f:
    existing = json.load(f)

# Build M49_TO_ISO3 from the metadata countries list
# We'll build display_name mapping from existing crop data keys
crop_data = existing.get("cropData", {})
known_countries = set(crop_data.keys())

# For M49 mapping, we'll extract from refresh-data.py
REFRESH_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "refresh-data.py")

# Parse out the M49_TO_ISO3 dict and FAOSTAT_NAMES from the script
with open(REFRESH_SCRIPT, "r") as f:
    script_src = f.read()

# Extract M49_TO_ISO3 dict
m49_match = re.search(r'M49_TO_ISO3\s*=\s*\{[^}]+\}', script_src, re.DOTALL)
names_match = re.search(r'FAOSTAT_NAMES\s*=\s*\{[^}]+\}', script_src, re.DOTALL)
exclude_match = re.search(r'EXCLUDE_KEYWORDS\s*=\s*\{[^}]+\}', script_src, re.DOTALL)

M49_TO_ISO3 = eval(m49_match.group().split('=', 1)[1].strip()) if m49_match else {}
FAOSTAT_NAMES = eval(names_match.group().split('=', 1)[1].strip()) if names_match else {}
EXCLUDE_KEYWORDS = eval(exclude_match.group().split('=', 1)[1].strip()) if exclude_match else {}

# Simple crop name cleaner (inline)
def clean_crop_name(name):
    name = re.sub(r'\s*\(.*?\)\s*', '', name)
    name = name.split(',')[0].strip()
    for prefix in ['Fruit, ', 'Nut, ', 'Oil, ', 'Fibre, ']:
        if name.startswith(prefix):
            name = name[len(prefix):]
    return name.strip()

YEAR_START = 2010
YEAR_END = 2024

print("📦 Fetching FAOSTAT Trade data (TCL, all Africa)...")
url = "https://bulks-faostat.fao.org/production/Trade_CropsLivestock_E_Africa.zip"
req = Request(url, headers={"User-Agent": "Afrixplorer/1.0"})
with urlopen(req, timeout=180) as resp:
    zip_data = resp.read()
print(f"  Downloaded {len(zip_data)/1024/1024:.1f} MB")

zf = zipfile.ZipFile(io.BytesIO(zip_data))
with zf.open("Trade_CropsLivestock_E_Africa_NOFLAG.csv") as f:
    content = f.read().decode("utf-8-sig")

reader = csv.DictReader(io.StringIO(content))
aggregates = {"Africa", "Eastern Africa", "Western Africa", "Northern Africa",
              "Southern Africa", "Middle Africa", "Sub-Saharan Africa"}
year_cols = [f"Y{y}" for y in range(YEAR_START, YEAR_END + 1)]

trade = {}
for row in reader:
    area_name = row.get("Area", "").strip()
    if area_name in aggregates:
        continue
    element_code = row.get("Element Code", "").strip()
    if element_code != "5922":
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
                val = float(val_str) / 1000.0
                if val > 0:
                    year_data[ycol[1:]] = round(val, 1)
            except ValueError:
                pass
    if not year_data:
        continue
    if display_name not in trade:
        trade[display_name] = {}
    trade[display_name][crop_clean] = year_data

print(f"  ✅ FAOSTAT trade for {len(trade)} countries, "
      f"{sum(len(v) for v in trade.values())} crop-country pairs")

# Merge with existing    
old_trade = existing.get("tradeData", {})
print(f"  Existing trade: {len(old_trade)} countries, {sum(len(v) for v in old_trade.values())} pairs")

merged = {c: dict(crops) for c, crops in trade.items()}
for country, crops in old_trade.items():
    if country not in merged:
        merged[country] = {}
    for crop, years in crops.items():
        if crop not in merged[country]:
            merged[country][crop] = years

print(f"  📊 Merged: {len(merged)} countries, {sum(len(v) for v in merged.values())} pairs")

existing["tradeData"] = merged

# Update metadata
if "metadata" in existing and "sources" in existing["metadata"]:
    existing["metadata"]["sources"]["faostat_trade"] = {
        "name": "FAOSTAT Trade (TCL)",
        "url": "https://www.fao.org/faostat/en/#data/TCL",
        "description": "Primary trade data source — export values (USD) for African crops and livestock",
        "status": "ok",
    }
    if "comtrade" in existing["metadata"]["sources"]:
        existing["metadata"]["sources"]["comtrade"]["description"] = (
            "Bilateral trade flows used for export destination data. "
            "Primary trade data sourced from FAOSTAT TCL for broader African coverage."
        )

with open(DATA_FILE, "w") as f:
    json.dump(existing, f)

file_size = os.path.getsize(DATA_FILE) / 1024 / 1024
print(f"  ✅ Written to {DATA_FILE} ({file_size:.1f} MB)")
