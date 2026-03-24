"""Fetch FAOSTAT import data and add it to live-data.json."""
import csv
import io
import json
import os
import zipfile
from urllib.request import urlopen, Request

YEAR_START, YEAR_END = 2010, 2024
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "server", "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "live-data.json")

# Same M49 map and name map used by refresh-data.py
M49_TO_ISO3 = {
    "012": "DZA", "024": "AGO", "204": "BEN", "072": "BWA", "854": "BFA",
    "108": "BDI", "120": "CMR", "140": "CAF", "148": "TCD", "174": "COM",
    "178": "COG", "180": "COD", "384": "CIV", "262": "DJI", "818": "EGY",
    "226": "GNQ", "232": "ERI", "748": "SWZ", "231": "ETH", "266": "GAB",
    "270": "GMB", "288": "GHA", "324": "GIN", "624": "GNB", "404": "KEN",
    "426": "LSO", "430": "LBR", "450": "MDG", "454": "MWI", "466": "MLI",
    "478": "MRT", "480": "MUS", "504": "MAR", "508": "MOZ", "516": "NAM",
    "562": "NER", "566": "NGA", "646": "RWA", "678": "STP", "686": "SEN",
    "694": "SLE", "706": "SOM", "710": "ZAF", "728": "SSD", "729": "SDN",
    "834": "TZA", "768": "TGO", "788": "TUN", "800": "UGA", "894": "ZMB",
    "716": "ZWE",
}

FAOSTAT_NAMES = {
    "Côte d'Ivoire": "Ivory Coast",
    "Cabo Verde": "Cape Verde",
    "Congo": "Republic of the Congo",
    "Eswatini": "Eswatini",
    "Gambia": "Gambia",
    "Guinea-Bissau": "Guinea-Bissau",
    "Sao Tome and Principe": "Sao Tome and Principe",
    "United Republic of Tanzania": "Tanzania",
    "Democratic Republic of the Congo": "DR Congo",
    "South Sudan": "South Sudan",
}

EXCLUDE_KEYWORDS = [
    "total", "aggregate", "other crops", "products of animal origin",
    "food preparations", "beverages", "residues", "animal feed",
    "ornamental", "cut flowers", "live animals", "hides", "skins",
    "wool", "silk", "feathers", "bones", "ivory", "waxes"
]

def clean_crop_name(name):
    replacements = {
        "Maize (corn)": "Maize",
        "Sugar cane": "Sugarcane",
        "Oil palm fruit": "Palm Oil",
        "Groundnuts, excluding shelled": "Groundnuts",
        "Groundnuts, shelled": "Groundnuts",
    }
    return replacements.get(name, name)


print("Downloading FAOSTAT Trade data (TCL)...")
url = "https://bulks-faostat.fao.org/production/Trade_CropsLivestock_E_Africa.zip"
req = Request(url, headers={"User-Agent": "Afrixplorer/1.0"})
zip_data = urlopen(req, timeout=180).read()
print(f"  Downloaded {len(zip_data)/1024/1024:.1f} MB")

zf = zipfile.ZipFile(io.BytesIO(zip_data))
csv_name = "Trade_CropsLivestock_E_Africa_NOFLAG.csv"
with zf.open(csv_name) as f:
    content = f.read().decode("utf-8-sig")

reader = csv.DictReader(io.StringIO(content))
aggregates = {"Africa", "Eastern Africa", "Western Africa", "Northern Africa",
              "Southern Africa", "Middle Africa", "Sub-Saharan Africa"}
year_cols = [f"Y{y}" for y in range(YEAR_START, YEAR_END + 1)]

import_trade = {}
for row in reader:
    area_name = row.get("Area", "").strip()
    if area_name in aggregates:
        continue
    element_code = row.get("Element Code", "").strip()
    if element_code != "5622":  # Import Value (1000 USD)
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
    if display_name not in import_trade:
        import_trade[display_name] = {}
    import_trade[display_name][crop_clean] = year_data

print(f"  Import data: {len(import_trade)} countries, "
      f"{sum(len(v) for v in import_trade.values())} crop-country pairs")

# Merge into existing live-data.json
data = json.load(open(OUTPUT_FILE))
data["importData"] = import_trade
with open(OUTPUT_FILE, "w") as f:
    json.dump(data, f)
print(f"  ✅ Added importData to {OUTPUT_FILE}")

# Show sample: Rwanda's top imports
for country in ["Rwanda", "Kenya", "Nigeria"]:
    ct = import_trade.get(country, {})
    if ct:
        top = sorted(ct.items(), key=lambda x: max(x[1].values()), reverse=True)[:5]
        print(f"\n{country} top imports:")
        for crop, years in top:
            latest = sorted(years.keys())[-1]
            print(f"  {crop}: ${years[latest]}M ({latest})")
