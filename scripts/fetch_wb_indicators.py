#!/usr/bin/env python3
"""Quick script to fetch the 10 new World Bank indicators and merge into live-data.json."""
import json, os, time
from urllib.request import urlopen, Request
from urllib.error import HTTPError

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "server", "data", "live-data.json")

NEW_INDICATORS = {
    "PV.PER.RNK":          "politicalStability",
    "RL.PER.RNK":          "ruleOfLaw",
    "CC.PER.RNK":          "corruption",
    "LP.LPI.OVRL.XQ":      "logisticsIndex",
    "AG.LND.IRIG.AG.ZS":   "irrigatedLand",
    "AG.LND.PRCP.MM":      "precipitation",
    "EN.CLC.MDAT.ZS":      "climateExposure",
    "AG.CON.FERT.ZS":      "fertilizerUse",
    "NV.AGR.TOTL.KD.ZG":   "agValueGrowth",
    "BX.KLT.DINV.WD.GD.ZS": "fdiInflows",
}

# Load existing data to get country codes
with open(DATA_FILE, "r") as f:
    existing = json.load(f)

# Get country ISO3 codes from metadata
countries = existing.get("metadata", {}).get("countries", [])
iso3_codes = [c["code"] for c in countries if c.get("code")]

# Build ISO3 -> country name map
iso3_to_name = {c["code"]: c["name"] for c in countries if c.get("code")}
wb_data = existing.get("worldBankData", {})

print(f"📊 Fetching {len(NEW_INDICATORS)} new World Bank indicators for {len(iso3_codes)} countries...")

for indicator_id, indicator_name in NEW_INDICATORS.items():
    print(f"  Fetching {indicator_name} ({indicator_id})...")
    
    # Batch in groups of 50
    for i in range(0, len(iso3_codes), 50):
        batch = ";".join(iso3_codes[i:i+50])
        url = (
            f"https://api.worldbank.org/v2/country/{batch}"
            f"/indicator/{indicator_id}"
            f"?format=json&mrv=1&per_page=300"
        )
        try:
            req = Request(url, headers={"User-Agent": "AgriScope/1.0"})
            with urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode())
            
            if len(data) >= 2 and data[1]:
                count = 0
                for entry in data[1]:
                    iso3 = entry.get("countryiso3code", "")
                    value = entry.get("value")
                    name = iso3_to_name.get(iso3)
                    if name and value is not None:
                        if name not in wb_data:
                            wb_data[name] = {}
                        wb_data[name][indicator_name] = round(float(value), 2)
                        count += 1
                print(f"    ✅ {count} countries")
            else:
                print(f"    ⚠️ No data returned")
            
            time.sleep(0.5)
        except HTTPError as e:
            print(f"    ❌ HTTP {e.code}")
        except Exception as e:
            print(f"    ❌ {e}")

# Save
existing["worldBankData"] = wb_data

with open(DATA_FILE, "w") as f:
    json.dump(existing, f)

# Summary
indicators_present = set()
for country_data in wb_data.values():
    indicators_present.update(country_data.keys())

print(f"\n✅ World Bank data: {len(wb_data)} countries, {len(indicators_present)} indicators")
print(f"   Indicators: {sorted(indicators_present)}")
file_size = os.path.getsize(DATA_FILE) / 1024 / 1024
print(f"   File size: {file_size:.1f} MB")
