# `/rankings/{crop}` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build global "which country produces the most X" ranking pages for 14 launch crops, per `docs/superpowers/specs/2026-09-07-rankings-page-design.md`, with real automated tests on the new logic (this repo has none today).

**Architecture:** Extend `scripts/refresh-data.py` with a pure, testable global-ranking filter/rank function plus a thin network-fetch wrapper, feeding a new `global_crop_rankings` SQLite table (same one-shot rebuild pattern the rest of the pipeline already uses). Server-side, follow the exact pattern already shipped for `/country`, `/crop`, `/explore`: a pure content-rendering function, a `resolveCrop()`-validated `seo.ts` branch, a `redirects.ts` clause, and a wouter+React page on top. Tests target the new pure logic specifically (Python: `unittest`, zero new deps; TypeScript: `vitest`, one new devDependency) — thin route handlers and the React page follow the same untested-glue convention every existing route/page in this codebase already has, so no test framework is added for those.

**Tech Stack:** Node/TypeScript (Express, `better-sqlite3`, wouter, React 18, `@tanstack/react-query`) + Python 3 stdlib (`csv`, `zipfile`, `urllib`, `sqlite3`, `unittest`). New: `vitest` as a devDependency for the TS/Node test suite.

---

### Task 1: Add vitest test infrastructure

**Files:**
- Modify: `package.json` (add `vitest` devDependency, `test` script)
- Create: `vitest.config.ts`
- Create: `server/resolve.test.ts` (smoke test to prove the harness works — real assertions, not a placeholder)

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Add the test script**

In `package.json`'s `"scripts"` block, add:

```json
"test": "vitest run"
```

(Keep existing scripts as-is — `dev`, `build`, `start`, `check`, `db:push`.)

- [ ] **Step 3: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["server/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write a real smoke test — `server/resolve.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { resolveCountry, resolveCrop } from "./resolve";

describe("resolveCountry", () => {
  it("matches by exact ISO3 code", () => {
    const result = resolveCountry("NGA");
    expect(result?.name).toBe("Nigeria");
    expect(result?.code).toBe("NGA");
  });

  it("matches by full name, case-insensitively", () => {
    expect(resolveCountry("nigeria")?.code).toBe("NGA");
    expect(resolveCountry("NIGERIA")?.code).toBe("NGA");
  });

  it("returns null for an unknown identifier", () => {
    expect(resolveCountry("Atlantis")).toBeNull();
  });

  it("returns null rather than throwing on a malformed percent-encoded identifier", () => {
    expect(resolveCountry("%")).toBeNull();
  });
});

describe("resolveCrop", () => {
  it("matches by exact name", () => {
    expect(resolveCrop("Rice")).toBe("Rice");
  });

  it("matches case-insensitively and returns the canonical stored casing", () => {
    expect(resolveCrop("rice")).toBe("Rice");
    expect(resolveCrop("RICE")).toBe("Rice");
  });

  it("returns null for an unknown crop", () => {
    expect(resolveCrop("Unobtainium")).toBeNull();
  });
});
```

Note: this test relies on `Nigeria`/`NGA` and `Rice` actually existing in whatever `server/data/afrixplorer.db` is present in the environment running the tests (via `getCountries()`/`getCrops()`'s live-DB-or-fallback behavior from `server/data.ts`). Both are present in `COUNTRIES_FALLBACK`/`CROPS_FALLBACK` in `server/data.ts` even if the live DB is unavailable, so this test is safe to run without the DB file.

- [ ] **Step 5: Run it**

Run: `npx vitest run`
Expected: 7 passing tests, 0 failures, in `server/resolve.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts server/resolve.test.ts
git commit -m "$(cat <<'EOF'
test: add vitest and cover server/resolve.ts

First test infrastructure in this repo. Starting with resolve.ts
since it's small, pure, and already load-bearing for security-relevant
URL validation (crop/country identifier resolution) added in the SEO
Phase 1 work.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 2: Python data pipeline — pure global-ranking filter/rank function, TDD

**Files:**
- Modify: `scripts/refresh-data.py`
- Create: `scripts/test_refresh_data.py`

**Why split pure logic from network I/O:** `fetch_faostat_data()` (the existing Africa fetch) mixes downloading, parsing, and filtering in one function, which is why nothing in this script has ever been unit-tested. For the new global-ranking logic, separate a pure function that takes already-parsed CSV rows (a list of dicts, same shape `csv.DictReader` produces) and returns the ranked result — testable with synthetic data, no network call, no zip file.

- [ ] **Step 1: Write the failing tests — `scripts/test_refresh_data.py`**

```python
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from refresh_data import filter_and_rank_global_rows, RANKING_CROPS, GLOBAL_AGGREGATES


def make_row(area, item, element_code, m49, **year_vals):
    row = {
        "Area": area,
        "Item": item,
        "Element Code": element_code,
        "Area Code (M49)": m49,
    }
    for year, val in year_vals.items():
        row[f"Y{year}"] = str(val)
    return row


class TestFilterAndRankGlobalRows(unittest.TestCase):
    def test_ranks_countries_by_latest_production_descending(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2023=3000000, Y2024=3200000),
            make_row("Vietnam", "Coffee, green", "5510", "'704", Y2023=1800000, Y2024=1900000),
            make_row("Colombia", "Coffee, green", "5510", "'170", Y2023=800000, Y2024=850000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        coffee = result["Coffee"]
        self.assertEqual([r["country"] for r in coffee], ["Brazil", "Vietnam", "Colombia"])
        self.assertEqual([r["rank"] for r in coffee], [1, 2, 3])

    def test_skips_continental_and_world_aggregates(self):
        rows = [
            make_row("World", "Coffee, green", "5510", "'001", Y2024=10000000),
            make_row("Americas", "Coffee, green", "5510", "'019", Y2024=6000000),
            make_row("European Union (27)", "Coffee, green", "5510", "'097", Y2024=0),
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3200000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        countries = [r["country"] for r in result["Coffee"]]
        self.assertEqual(countries, ["Brazil"])

    def test_only_keeps_launch_crops(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3200000),
            make_row("France", "Sorghum", "5510", "'250", Y2024=100000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertIn("Coffee", result)
        self.assertNotIn("Sorghum", result)

    def test_attaches_iso3_code_for_known_african_countries_only(self):
        rows = [
            make_row("Ethiopia", "Coffee, green", "5510", "'231", Y2024=500000),
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3200000),
        ]
        africa_countries = {"Ethiopia": {"code": "ETH", "region": "East Africa"}}
        result = filter_and_rank_global_rows(rows, africa_countries=africa_countries)
        by_country = {r["country"]: r for r in result["Coffee"]}
        self.assertEqual(by_country["Ethiopia"]["code"], "ETH")
        self.assertIsNone(by_country["Brazil"]["code"])

    def test_computes_year_over_year_percent_change(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2023=3000000, Y2024=3300000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertAlmostEqual(result["Coffee"][0]["yoy_pct"], 10.0, places=1)

    def test_yoy_is_none_when_prior_year_missing(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3300000),
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertIsNone(result["Coffee"][0]["yoy_pct"])

    def test_caps_at_top_30_countries_per_crop(self):
        rows = [
            make_row(f"Country{i}", "Coffee, green", "5510", f"'{i:03d}", Y2024=1000 - i)
            for i in range(40)
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        self.assertEqual(len(result["Coffee"]), 30)
        self.assertEqual(result["Coffee"][0]["country"], "Country0")

    def test_includes_yield_and_area_alongside_production(self):
        rows = [
            make_row("Brazil", "Coffee, green", "5510", "'076", Y2024=3200000),  # production, tonnes
            make_row("Brazil", "Coffee, green", "5412", "'076", Y2024=850),      # yield, kg/ha
            make_row("Brazil", "Coffee, green", "5312", "'076", Y2024=3800),     # area, ha
        ]
        result = filter_and_rank_global_rows(rows, africa_countries={})
        row = result["Coffee"][0]
        self.assertEqual(row["production"], 3200.0)   # tonnes / 1000
        self.assertEqual(row["yield"], 8500)           # kg/ha * 10 -> hg/ha
        self.assertEqual(row["area"], 3.8)             # ha / 1000


if __name__ == "__main__":
    unittest.main()
```

`Element Code` values used throughout these fixtures come directly from the `ELEMENTS` dict already defined in `scripts/refresh-data.py` (line 92): `"5510"` = production (tonnes), `"5412"` = yield (kg/ha), `"5312"` = area (ha). The unit-conversion factors in the assertions above (`/1000` for production and area, `*10` for yield kg/ha→hg/ha) match `fetch_faostat_data()`'s existing conversion logic exactly — `filter_and_rank_global_rows` must apply the same conversions for the two datasets to be comparable.

- [ ] **Step 2: Run it, confirm it fails with an import error**

Run: `python3 scripts/test_refresh_data.py`
Expected: `ImportError` or `AttributeError` — `filter_and_rank_global_rows`, `RANKING_CROPS`, `GLOBAL_AGGREGATES` don't exist yet.

- [ ] **Step 3: Implement in `scripts/refresh-data.py`**

Note the test imports from a module named `refresh_data` (Python import syntax can't have a hyphen) while the actual file is `refresh-data.py`. Since `sys.path.insert` + `import refresh_data` won't resolve a hyphenated filename, add this at the very top of `scripts/test_refresh_data.py` instead of a plain import:

```python
import importlib.util
spec = importlib.util.spec_from_file_location(
    "refresh_data", os.path.join(os.path.dirname(os.path.abspath(__file__)), "refresh-data.py")
)
refresh_data = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh_data)

filter_and_rank_global_rows = refresh_data.filter_and_rank_global_rows
RANKING_CROPS = refresh_data.RANKING_CROPS
GLOBAL_AGGREGATES = refresh_data.GLOBAL_AGGREGATES
```

(Replace the plain `from refresh_data import ...` line from Step 1 with this loader — the rest of the test file is unchanged.)

Add to `scripts/refresh-data.py`, near `clean_crop_name` (after it, before `fetch_faostat_data`):

```python
# ──────────────────── Global Rankings ────────────────────

RANKING_CROPS = {
    "Coffee", "Cocoa", "Rice", "Wheat", "Sugar Cane", "Bananas", "Tea",
    "Seed Cotton", "Maize", "Potatoes", "Olives", "Grapes", "Cassava", "Oil Palm",
}

GLOBAL_AGGREGATES = {
    "World", "Africa", "Eastern Africa", "Western Africa", "Northern Africa",
    "Southern Africa", "Middle Africa",
    "Americas", "Northern America", "Central America", "South America", "Caribbean",
    "Asia", "Eastern Asia", "South-eastern Asia", "Southern Asia", "Western Asia", "Central Asia",
    "Europe", "Eastern Europe", "Northern Europe", "Southern Europe", "Western Europe",
    "Oceania", "Australia and New Zealand", "Melanesia", "Micronesia", "Polynesia",
    "European Union (27)",
    "Least Developed Countries (LDCs)", "Land Locked Developing Countries (LLDCs)",
    "Small Island Developing States (SIDS)", "Low Income Food Deficit Countries (LIFDCs)",
    "Net Food Importing Developing Countries (NFIDCs)",
}

GLOBAL_RANKING_TOP_N = 30


def filter_and_rank_global_rows(rows, africa_countries):
    """Pure function: takes csv.DictReader-shaped rows (already read into a list),
    returns {crop_clean_name: [ranked row dicts]} for the RANKING_CROPS set only.

    `africa_countries` is the `countries_info` dict already produced by
    fetch_faostat_data() for the same run — {display_name: {"code": iso3, "region": ...}}
    — used to attach an ISO3 code to rows for countries this site already has pages for.
    """
    by_country_crop = {}  # (country, crop) -> {"production": {year: val}, "yield": {...}, "area": {...}}

    for row in rows:
        area_name = row.get("Area", "").strip()
        if area_name in GLOBAL_AGGREGATES:
            continue

        item_name = row.get("Item", "").strip()
        crop_clean = clean_crop_name(item_name)
        if crop_clean not in RANKING_CROPS:
            continue

        element_code = row.get("Element Code", "").strip()
        if element_code not in ELEMENTS:
            continue
        element = ELEMENTS[element_code]

        key = (area_name, crop_clean)
        if key not in by_country_crop:
            by_country_crop[key] = {"production": {}, "yield": {}, "area": {}}

        for col, val_str in row.items():
            if not col.startswith("Y") or not col[1:].isdigit():
                continue
            val_str = (val_str or "").strip()
            if not val_str:
                continue
            try:
                val = float(val_str)
            except ValueError:
                continue
            year = col[1:]
            if element == "production":
                by_country_crop[key]["production"][year] = round(val / 1000, 1)
            elif element == "yield":
                by_country_crop[key]["yield"][year] = round(val * 10)
            elif element == "area":
                by_country_crop[key]["area"][year] = round(val / 1000, 1)

    # Group by crop, compute latest year + YoY, rank by latest production
    by_crop = {}
    for (country, crop), elements in by_country_crop.items():
        prod_years = sorted(elements["production"].keys())
        if not prod_years:
            continue
        latest_year = prod_years[-1]
        latest_prod = elements["production"][latest_year]
        if latest_prod <= 0:
            continue

        prior_year = str(int(latest_year) - 1)
        prior_prod = elements["production"].get(prior_year)
        yoy_pct = round(((latest_prod - prior_prod) / prior_prod) * 100, 1) if prior_prod else None

        africa_info = africa_countries.get(country)
        row_out = {
            "country": country,
            "code": africa_info["code"] if africa_info else None,
            "production": latest_prod,
            "yield": elements["yield"].get(latest_year, 0),
            "area": elements["area"].get(latest_year, 0),
            "yoy_pct": yoy_pct,
            "year": latest_year,
        }
        by_crop.setdefault(crop, []).append(row_out)

    for crop, country_rows in by_crop.items():
        country_rows.sort(key=lambda r: r["production"], reverse=True)
        top = country_rows[:GLOBAL_RANKING_TOP_N]
        for i, r in enumerate(top):
            r["rank"] = i + 1
        by_crop[crop] = top

    return by_crop
```

Adjust the exact `ELEMENTS` dict lookups / element-code strings in the code above to match what's actually defined in this file if they differ from what's assumed here — read the `ELEMENTS` dict definition first.

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `python3 scripts/test_refresh_data.py -v`
Expected: 8 tests, all passing.

- [ ] **Step 5: Commit**

```bash
git add scripts/refresh-data.py scripts/test_refresh_data.py
git commit -m "$(cat <<'EOF'
feat(data): add pure global-ranking filter/rank function, with tests

filter_and_rank_global_rows() is deliberately separated from the
network/zip-download step so it's testable with synthetic rows and no
network call — the first tested function in this pipeline. Covers
aggregate-skipping, launch-crop filtering, ISO3 attachment for known
African countries, YoY computation, and the top-30 cap.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 3: Python data pipeline — wire the global fetch into the refresh run

**Files:**
- Modify: `scripts/refresh-data.py`

**Depends on:** Task 2 (`filter_and_rank_global_rows`, `RANKING_CROPS`, `GLOBAL_AGGREGATES` must exist).

- [ ] **Step 1: Add the network-fetch wrapper**

Add near `fetch_faostat_data()` (after it):

```python
def fetch_global_rankings(africa_countries):
    """Download the FAOSTAT global bulk file and return ranked global production
    data for the RANKING_CROPS set, via filter_and_rank_global_rows()."""
    print("\n🌍 Fetching FAOSTAT global production data (for rankings)...")

    url = "https://bulks-faostat.fao.org/production/Production_Crops_Livestock_E_All_Data.zip"
    zip_data = fetch_url(url, max_retries=3, timeout=180)
    if not zip_data:
        print("  ❌ Failed to download FAOSTAT global bulk data")
        return None

    print(f"  Downloaded {len(zip_data)/1024/1024:.1f} MB")

    zf = zipfile.ZipFile(io.BytesIO(zip_data))
    csv_name = "Production_Crops_Livestock_E_All_Data_NOFLAG.csv"

    with zf.open(csv_name) as f:
        content = f.read().decode("utf-8-sig")

    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)

    result = filter_and_rank_global_rows(rows, africa_countries)
    total_rows = sum(len(v) for v in result.values())
    print(f"  ✅ {len(result)} crops ranked, {total_rows} country rows")
    return result
```

- [ ] **Step 2: Add the `CREATE TABLE` to `DB_SCHEMA`**

In `DB_SCHEMA` (the multi-line string near the top of the file, alongside `crop_metrics`/`trade_metrics`/etc.), add:

```sql
CREATE TABLE global_crop_rankings (
    crop TEXT NOT NULL,
    rank INTEGER NOT NULL,
    country TEXT NOT NULL,
    code TEXT,
    production REAL NOT NULL,
    yield REAL NOT NULL,
    area REAL NOT NULL,
    yoy_pct REAL,
    year TEXT NOT NULL,
    PRIMARY KEY (crop, rank)
);
```

- [ ] **Step 3: Call it from `main()`**

In `main()`, right after the existing FAOSTAT block (the one that sets `crop_data, countries_info, global_avg_yields`), add:

```python
    # 1b. Global rankings (for /rankings/{crop} pages) — depends on countries_info from step 1
    global_rankings = None
    try:
        if countries_info:
            global_rankings = fetch_global_rankings(countries_info)
        else:
            print("  ⚠️ Skipping global rankings — no African country data to cross-reference")
    except Exception as e:
        print(f"  ❌ Global rankings error: {e}")
        errors.append(f"Global rankings: {str(e)}")
```

- [ ] **Step 4: Insert into the output dict and the DB**

In `main()`, alongside the other `if X: output["y"] = X` blocks (after the `globalAvgYields` block), add:

```python
    if global_rankings:
        output["globalRankings"] = global_rankings
    elif "globalRankings" in existing:
        output["globalRankings"] = existing["globalRankings"]
        print("  ⚠️ Using previous global rankings data (fetch failed)")
```

And alongside the other `cur.execute(...)` insert loops (after the `global_avg_yields` insert loop, before `conn.commit()`), add:

```python
    # Insert global_crop_rankings
    if "globalRankings" in output:
        for crop, rows in output["globalRankings"].items():
            for row in rows:
                cur.execute(
                    "INSERT INTO global_crop_rankings (crop, rank, country, code, production, yield, area, yoy_pct, year) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (crop, row["rank"], row["country"], row["code"], row["production"], row["yield"], row["area"], row["yoy_pct"], row["year"]),
                )
```

- [ ] **Step 5: Verify with a real (network-hitting) dry run**

This step genuinely downloads ~25MB from FAOSTAT and writes a real DB file — run it once to confirm the whole pipeline works end to end, not just the unit-tested pure function.

```bash
cd scripts && python3 refresh-data.py
```

Expected: output includes a `🌍 Fetching FAOSTAT global production data...` line, `✅ N crops ranked, M country rows` where N is close to 14 (some launch crops may have zero qualifying rows if FAOSTAT's global file uses a different item name than expected — note any crop that comes back with 0 rows and flag it, don't silently ignore), and the script completes with `✅ server/data/afrixplorer.db`.

Then confirm the table exists and has data:

```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('server/data/afrixplorer.db')
c = conn.cursor()
c.execute('SELECT crop, COUNT(*) FROM global_crop_rankings GROUP BY crop ORDER BY crop')
for row in c.fetchall():
    print(row)
c.execute('SELECT * FROM global_crop_rankings WHERE crop = \"Coffee\" ORDER BY rank LIMIT 5')
for row in c.fetchall():
    print(row)
"
```

Expected: one row per launch crop with a count near 30, and the Coffee top-5 headed by a real major producer (Brazil, Vietnam, Colombia, Indonesia, or Ethiopia — not an aggregate name).

**If any launch crop returns 0 rows:** the FAOSTAT `Item` name for that commodity in the *global* file may not `clean_crop_name()` to the expected string (global file could use slightly different item naming than the Africa-only file for some crops). Investigate by grepping the raw CSV for the crop's expected substring before concluding the crop is genuinely absent — do not silently ship a launch crop with an empty ranking table; either fix the name mapping or drop that crop from `RANKING_CROPS` and note it.

- [ ] **Step 6: Commit**

```bash
git add scripts/refresh-data.py
git commit -m "$(cat <<'EOF'
feat(data): wire global crop rankings into the refresh pipeline

Adds the global_crop_rankings table and a non-fatal fetch step
(matching every other data source's error-handling pattern) that
downloads FAOSTAT's global bulk file and populates it via the
already-tested filter_and_rank_global_rows(). Verified end-to-end
against real FAOSTAT data, not just the unit tests.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 4: `server/data.ts` — `getGlobalRankings()`

**Files:**
- Modify: `server/data.ts`

**Depends on:** Task 3 (the `global_crop_rankings` table must exist in the DB used for manual verification, though this task's code doesn't require it to compile).

- [ ] **Step 1: Add the type and getter**

Add to `server/data.ts`, near the other exported getters (e.g. after `getGlobalAvgYields`):

```typescript
export interface GlobalRankingRow {
  rank: number;
  country: string;
  code: string | null;
  production: number;
  yield: number;
  area: number;
  yoyPct: number | null;
  year: string;
}

export function getGlobalRankings(crop: string): GlobalRankingRow[] {
  const c = getDb();
  if (!c) return [];
  const rows = c.prepare(
    "SELECT rank, country, code, production, yield, area, yoy_pct, year FROM global_crop_rankings WHERE crop = ? ORDER BY rank"
  ).all(crop) as any[];
  return rows.map((r) => ({
    rank: r.rank,
    country: r.country,
    code: r.code,
    production: r.production,
    yield: r.yield,
    area: r.area,
    yoyPct: r.yoy_pct,
    year: r.year,
  }));
}
```

This follows the existing null-safe pattern in this file exactly (`getProducerPrices`, `getWfpPrices`, etc. all return `{}`/`[]` when `getDb()` is null, rather than throwing) — no fallback constant is added for this one, since there's no meaningful static fallback for a ranking table the way there is for the small `COUNTRIES_FALLBACK`/`CROPS_FALLBACK` lists (an empty array is the correct "no data yet" state, matching the spec's error-handling table).

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Manual verification against the real DB from Task 3**

```bash
node -e "
const { getGlobalRankings } = require('./server/data.ts');
" 2>&1 || true
```

(This will fail directly since `data.ts` is TypeScript and not runnable via plain `node -e` — instead, verify via a quick throwaway script using `tsx`, which is already a project dependency:)

```bash
npx tsx -e "
import { getGlobalRankings } from './server/data';
console.log(getGlobalRankings('Coffee').slice(0, 5));
"
```

Expected: an array of up to 5 objects with `rank: 1..5`, real country names, and non-zero `production`.

- [ ] **Step 4: Commit**

```bash
git add server/data.ts
git commit -m "$(cat <<'EOF'
feat(data): add getGlobalRankings() reading the new rankings table

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 5: `server/content.ts` — `renderRankingsContent()`, TDD

**Files:**
- Modify: `server/content.ts`
- Create: `server/content.test.ts`

**Depends on:** Task 4 (`GlobalRankingRow` type).

- [ ] **Step 1: Write the failing tests — `server/content.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { renderRankingsContent } from "./content";
import type { GlobalRankingRow } from "./data";

function row(overrides: Partial<GlobalRankingRow>): GlobalRankingRow {
  return {
    rank: 1,
    country: "Brazil",
    code: null,
    production: 3200,
    yield: 15000,
    area: 200,
    yoyPct: 5.0,
    year: "2024",
    ...overrides,
  };
}

describe("renderRankingsContent", () => {
  it("returns empty string when there are no rows", () => {
    expect(renderRankingsContent("Coffee", [])).toBe("");
  });

  it("includes an H1 naming the crop", () => {
    const html = renderRankingsContent("Coffee", [row({})]);
    expect(html).toContain("<h1>Coffee Production by Country — World Ranking</h1>");
  });

  it("names the #1 producer and its production figure in the lead paragraph", () => {
    const html = renderRankingsContent("Coffee", [
      row({ rank: 1, country: "Brazil", production: 3200 }),
      row({ rank: 2, country: "Vietnam", production: 1900 }),
    ]);
    expect(html).toContain("Brazil");
    expect(html).toContain("3,200");
  });

  it("renders one table row per country", () => {
    const rows = [
      row({ rank: 1, country: "Brazil" }),
      row({ rank: 2, country: "Vietnam" }),
      row({ rank: 3, country: "Colombia" }),
    ];
    const html = renderRankingsContent("Coffee", rows);
    expect((html.match(/<tr>/g) || []).length).toBeGreaterThanOrEqual(3);
  });

  it("links African-country rows to their /country/:code page, but not non-African rows", () => {
    const rows = [
      row({ rank: 1, country: "Brazil", code: null }),
      row({ rank: 6, country: "Ethiopia", code: "ETH" }),
    ];
    const html = renderRankingsContent("Coffee", rows);
    expect(html).toContain('href="/country/ETH"');
    expect(html).not.toContain('href="/country/null"');
    expect(html).not.toContain("href=\"/country/Brazil\"");
  });

  it("includes an Africa-in-context subsection listing only African rows", () => {
    const rows = [
      row({ rank: 1, country: "Brazil", code: null }),
      row({ rank: 6, country: "Ethiopia", code: "ETH" }),
      row({ rank: 12, country: "Uganda", code: "UGA" }),
    ];
    const html = renderRankingsContent("Coffee", rows);
    expect(html).toContain("Ethiopia");
    expect(html).toContain("Uganda");
    expect(html).toContain("#6");
  });

  it("does not throw and returns empty-ish content when no rows have a code (no African producers in top 30)", () => {
    const rows = [row({ rank: 1, country: "Brazil", code: null })];
    expect(() => renderRankingsContent("Coffee", rows)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run server/content.test.ts`
Expected: fails — `renderRankingsContent` is not exported yet.

- [ ] **Step 3: Implement `renderRankingsContent` in `server/content.ts`**

Add the import at the top of `server/content.ts`:

```typescript
import { getCropData, getYears, getGlobalAvgYields, getMetadata, type GlobalRankingRow } from "./data";
```

(Extends the existing import line — `GlobalRankingRow` is a type-only addition alongside the existing value imports.)

Add the function (after the existing three render functions):

```typescript
/** Renders the static fallback body content for a /rankings/:crop page. */
export function renderRankingsContent(crop: string, rows: GlobalRankingRow[]): string {
  if (rows.length === 0) return "";

  const top = rows[0];
  const africanRows = rows.filter((r) => r.code !== null);

  const worldRows = rows
    .map((r) => {
      const countryCell = r.code
        ? `<a href="/country/${r.code}">${r.country}</a>`
        : r.country;
      const yoy = r.yoyPct !== null ? `${r.yoyPct > 0 ? "+" : ""}${r.yoyPct}%` : "—";
      return `<tr><td>${r.rank}</td><td>${countryCell}</td><td>${r.production.toLocaleString()}</td><td>${r.yield.toLocaleString()}</td><td>${r.area.toLocaleString()}</td><td>${yoy}</td></tr>`;
    })
    .join("");

  const africaSection = africanRows.length > 0
    ? `
    <h2>${crop} in Africa</h2>
    <p>${africanRows.length} African ${africanRows.length === 1 ? "country ranks" : "countries rank"} in the global top ${rows.length}: ${africanRows.map((r) => `${r.country} (#${r.rank})`).join(", ")}.</p>
    <table>
      <thead><tr><th>Rank</th><th>Country</th><th>Production (K tonnes)</th></tr></thead>
      <tbody>${africanRows.map((r) => `<tr><td>${r.rank}</td><td><a href="/explore/${r.code}/${crop}">${r.country}</a></td><td>${r.production.toLocaleString()}</td></tr>`).join("")}</tbody>
    </table>
    `
    : `<p>No African country appears in the global top ${rows.length} for ${crop} in this dataset.</p>`;

  return `
    <h1>${crop} Production by Country — World Ranking</h1>
    <p>${top.country} is the world's largest ${crop} producer, at ${top.production.toLocaleString()} thousand tonnes in ${top.year}${rows.length > 1 ? `, followed by ${rows[1].country}${rows.length > 2 ? ` and ${rows[2].country}` : ""}` : ""}.</p>
    <table>
      <thead><tr><th>Rank</th><th>Country</th><th>Production (K tonnes)</th><th>Yield (hg/ha)</th><th>Area (K ha)</th><th>YoY</th></tr></thead>
      <tbody>${worldRows}</tbody>
    </table>
    ${africaSection}
  `;
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run server/content.test.ts`
Expected: all passing. If the "links African rows" test fails because of exact string matching (e.g. attribute quoting), adjust the test's expected string to match real output — but do not weaken the underlying assertion (it must still fail if a `null` code is ever rendered into an href).

- [ ] **Step 5: Commit**

```bash
git add server/content.ts server/content.test.ts
git commit -m "$(cat <<'EOF'
feat(seo): add renderRankingsContent for /rankings/:crop pages

TDD'd against synthetic GlobalRankingRow fixtures. Covers the empty
case, the lead-sentence naming the #1 producer, world-table rendering,
and the Africa-in-context subsection — including the specific
guarantee that only rows with a real ISO3 code get a /country/:code
link, never a country name or null baked into an href.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 6: `server/redirects.ts` — `rankings` clause, TDD

**Files:**
- Modify: `server/redirects.ts`
- Create: `server/redirects.test.ts`

- [ ] **Step 1: Write the failing tests — `server/redirects.test.ts`**

```typescript
import { describe, it, expect, vi } from "vitest";
import { canonicalRedirect } from "./redirects";

function mockReqRes(path: string) {
  const req: any = { path, url: path };
  const redirectCalls: [number, string][] = [];
  const res: any = {
    redirect: (status: number, location: string) => {
      redirectCalls.push([status, location]);
    },
  };
  const next = vi.fn();
  return { req, res, next, redirectCalls };
}

describe("canonicalRedirect — rankings", () => {
  it("redirects a lowercase crop to canonical casing", () => {
    const { req, res, next, redirectCalls } = mockReqRes("/rankings/rice");
    canonicalRedirect(req, res, next);
    expect(redirectCalls).toEqual([[301, "/rankings/Rice"]]);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not redirect an already-canonical rankings URL", () => {
    const { req, res, next, redirectCalls } = mockReqRes("/rankings/Rice");
    canonicalRedirect(req, res, next);
    expect(redirectCalls).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it("falls through to next() for an unknown crop rather than redirecting", () => {
    const { req, res, next, redirectCalls } = mockReqRes("/rankings/Unobtainium");
    canonicalRedirect(req, res, next);
    expect(redirectCalls).toEqual([]);
    expect(next).toHaveBeenCalled();
  });

  it("preserves query strings on redirect", () => {
    const { req, res, next, redirectCalls } = mockReqRes("/rankings/rice?utm_source=x");
    req.path = "/rankings/rice";
    canonicalRedirect(req, res, next);
    expect(redirectCalls).toEqual([[301, "/rankings/Rice?utm_source=x"]]);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run server/redirects.test.ts`
Expected: fails — no `rankings` handling exists in `canonicalRedirect` yet, so `/rankings/rice` currently falls through to `next()` unconditionally.

- [ ] **Step 3: Implement the `rankings` clause in `server/redirects.ts`**

Add a new `else if` branch after the existing `explore` branch, before the final `next();`:

```typescript
  } else if (parts[0] === "rankings" && parts.length === 2) {
    const canonical = resolveCrop(parts[1]);
    if (canonical) {
      const decoded = decodeURIComponent(parts[1]);
      if (decoded !== canonical) {
        return res.redirect(301, `/rankings/${encodeURIComponent(canonical)}${req.url.slice(path.length)}`);
      }
    }
  }
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run server/redirects.test.ts`
Expected: all passing.

- [ ] **Step 5: Run the full suite to confirm no regression on the existing `country`/`crop`/`explore` behavior**

Run: `npx vitest run`
Expected: all tests across all files passing.

- [ ] **Step 6: Commit**

```bash
git add server/redirects.ts server/redirects.test.ts
git commit -m "$(cat <<'EOF'
feat(seo): canonical-redirect /rankings/:crop, with tests

Mirrors the existing crop clause exactly. Also the first tests on
canonicalRedirect itself — this is the exact class of function where
Phase 1's manual review found real bugs, so it's worth locking down
with assertions now that the harness exists.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 7: `server/seo.ts` — `isKnownRoute` rankings validation, TDD

**Files:**
- Modify: `server/seo.ts`
- Create: `server/seo.test.ts`

**Depends on:** Task 6 conceptually (same crop-resolution logic), but no code dependency — can run independently.

- [ ] **Step 1: Write the failing tests — `server/seo.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { isKnownRoute } from "./seo";

describe("isKnownRoute — rankings", () => {
  it("returns true for a launch crop's rankings page", () => {
    expect(isKnownRoute("/rankings/Rice")).toBe(true);
    expect(isKnownRoute("/rankings/Coffee")).toBe(true);
  });

  it("is case-insensitive, matching how canonicalRedirect resolves before this ever runs", () => {
    expect(isKnownRoute("/rankings/rice")).toBe(true);
  });

  it("returns false for a real crop that is not one of the 14 launch crops", () => {
    expect(isKnownRoute("/rankings/Sorghum")).toBe(false);
  });

  it("returns false for a crop that doesn't exist at all", () => {
    expect(isKnownRoute("/rankings/Unobtainium")).toBe(false);
  });

  it("returns false for a malformed rankings path with no crop segment", () => {
    expect(isKnownRoute("/rankings")).toBe(false);
    expect(isKnownRoute("/rankings/")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run server/seo.test.ts`
Expected: fails — `isKnownRoute` has no `rankings` branch, so `/rankings/Rice` currently falls through to the final `return false;`.

- [ ] **Step 3: Implement**

In `server/seo.ts`, add a `RANKING_CROPS` constant near the top of the file (after the existing `STATIC_ROUTES` set), matching the Python side's list exactly:

```typescript
const RANKING_CROPS = new Set([
  "Coffee", "Cocoa", "Rice", "Wheat", "Sugar Cane", "Bananas", "Tea",
  "Seed Cotton", "Maize", "Potatoes", "Olives", "Grapes", "Cassava", "Oil Palm",
]);
```

Note this list is duplicated from `scripts/refresh-data.py`'s `RANKING_CROPS` set by necessity — Python and this TypeScript codebase can't share a literal constant across the language boundary. Keep the two lists in sync manually if either ever changes; there's no automated check for drift, so this is a known, accepted limitation, not an oversight.

Add a new branch in `isKnownRoute`, after the existing `explore` branch, before the final `return false;`:

```typescript
  if (parts[0] === "rankings" && parts.length === 2) {
    const crop = resolveCrop(parts[1]);
    return crop !== null && RANKING_CROPS.has(crop);
  }
```

(This requires `resolveCrop` to be imported into `server/seo.ts` — it already is, from the Task-3-era crop-validation fix in Phase 1; if for some reason it isn't, add `import { resolveCrop } from "./resolve";` alongside the existing imports.)

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npx vitest run server/seo.test.ts`
Expected: all passing.

- [ ] **Step 5: Wire the `rankings` branch into `injectSEO` itself**

This isn't test-covered directly (it's HTML string assembly identical in shape to the already-tested `renderRankingsContent`, and `injectSEO` as a whole has no existing tests to extend — consistent with the scope boundary already set for this plan), but is necessary for the feature to work. Add a new branch in `injectSEO`, after the existing `explore` branch, before the `pricing` branch:

```typescript
    // /rankings/:cropName
    else if (parts[0] === "rankings" && parts[1]) {
      const cropName = resolveCrop(parts[1]);
      if (cropName && RANKING_CROPS.has(cropName)) {
        const rankings = getGlobalRankings(cropName);
        title = `${cropName} Production by Country — World Ranking | Afrixplorer`;
        description = `See which countries produce the most ${cropName} globally, with African producers ranked in context. Updated from FAOSTAT data.`;
        if (rankings.length > 0) {
          schemas.push({
            "@context": "https://schema.org/",
            "@type": "Dataset",
            "name": `${cropName} Production by Country — World Ranking`,
            "description": description,
            "keywords": [cropName, "Ranking", "World Production", "Agriculture"],
            ...baseDatasetFields(),
          });
          schemas.push({
            "@context": "https://schema.org",
            "@type": "ItemList",
            "itemListElement": rankings.slice(0, 10).map((r) => ({
              "@type": "ListItem",
              "position": r.rank,
              "name": r.country,
            })),
          });
          schemas.push(buildBreadcrumbs([
            { name: "Home", url: "/" },
            { name: "Crops", url: "/crops" },
            { name: `${cropName} Rankings`, url: `/rankings/${encodeURIComponent(cropName)}` },
          ]));
        }
        bodyContent = renderRankingsContent(cropName, rankings);
      }
    }
```

Add the corresponding imports at the top of `server/seo.ts`:

```typescript
import { renderExploreContent, renderCountryContent, renderCropContent, renderRankingsContent } from "./content";
```

(extend the existing import line) and:

```typescript
import { getGlobalRankings } from "./data";
```

(extend whatever `server/data.ts` import line already exists in this file, if one does — `seo.ts` may not currently import anything from `./data` directly if `getCountries`/`getCrops` are only used via `isKnownRoute`'s existing top-of-file import; check and extend the correct existing import statement rather than adding a duplicate one).

- [ ] **Step 6: Run `npx tsc --noEmit` and the full vitest suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean.

- [ ] **Step 7: Manual verification against the dev server**

Run `npm run dev`, then:

```bash
curl -s "http://localhost:PORT/rankings/Coffee" | grep -A2 "<h1>"
curl -s "http://localhost:PORT/rankings/Coffee" | grep -c "<tr>"
curl -sI "http://localhost:PORT/rankings/Sorghum" | grep "^HTTP"
curl -sI "http://localhost:PORT/rankings/rice" | grep -i "^location\|^HTTP"
```

Expected: real H1 + table for Coffee; `Sorghum` (a real crop, not a launch crop) returns 404; lowercase `rice` 301s to `/rankings/Rice`.

- [ ] **Step 8: Commit**

```bash
git add server/seo.ts server/seo.test.ts
git commit -m "$(cat <<'EOF'
feat(seo): wire /rankings/:crop into injectSEO and isKnownRoute

isKnownRoute's new rankings branch is TDD'd; injectSEO's rankings
branch follows the same shape as the existing country/crop/explore
branches and isn't separately tested, consistent with this plan's
scope (injectSEO as a whole has no test coverage in this codebase,
and this branch's only new logic — content selection — is already
covered via renderRankingsContent's own tests).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 8: `server/routes.ts` — API route + sitemap entries

**Files:**
- Modify: `server/routes.ts`

**Depends on:** Task 4 (`getGlobalRankings`), Task 7 (`RANKING_CROPS` — but that's defined in `server/seo.ts`; this task defines its own copy for the sitemap loop, same accepted-duplication rationale as Task 7's Python/TS split).

- [ ] **Step 1: Add the API route**

Add to `server/routes.ts`, near the other `/api/crop/:crop`-style routes:

```typescript
  // Get global production rankings for a crop (top 30 countries)
  app.get("/api/rankings/:crop", (req, res) => {
    const crop = resolveCrop(req.params.crop);
    if (!crop) return res.status(404).json({ error: "Crop not found" });
    const rankings = getGlobalRankings(crop);
    if (rankings.length === 0) return res.status(404).json({ error: "No ranking data for this crop" });
    res.json({ crop, rankings });
  });
```

This requires `resolveCrop` and `getGlobalRankings` to be imported — add `resolveCrop` to whatever import brings in `resolveCountryName`'s sibling functions (or import fresh from `./resolve` if this file doesn't already import from there), and add `getGlobalRankings` to the existing `from "./data"` import line at the top of the file.

- [ ] **Step 2: Add sitemap entries**

In the `/sitemap.xml` handler, after the existing "Country+Crop specific routes" loop, add:

```typescript
    // Rankings routes
    const RANKING_CROPS = [
      "Coffee", "Cocoa", "Rice", "Wheat", "Sugar Cane", "Bananas", "Tea",
      "Seed Cotton", "Maize", "Potatoes", "Olives", "Grapes", "Cassava", "Oil Palm",
    ];
    RANKING_CROPS.forEach(crop => {
      const encodedCrop = encodeURIComponent(crop);
      xml += `  <url>\n    <loc>${siteUrl}/rankings/${encodedCrop}</loc>${lastmodTag}\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    });
```

(Placed after `<loc>`, matching the element order fix from Phase 1's sitemap work — `${lastmodTag}` goes right after `</loc>`, not after `<priority>`.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

Run `npm run dev`, then:

```bash
curl -s "http://localhost:PORT/api/rankings/Coffee" | python3 -m json.tool | head -20
curl -s "http://localhost:PORT/api/rankings/Sorghum" -w "\n%{http_code}\n"
curl -s http://localhost:PORT/sitemap.xml | grep -c "<loc>.*rankings"
```

Expected: real JSON with `crop: "Coffee"` and a `rankings` array; `Sorghum` returns 404; sitemap count is 14.

- [ ] **Step 4: Commit**

```bash
git add server/routes.ts
git commit -m "$(cat <<'EOF'
feat(seo): add /api/rankings/:crop route and sitemap entries

The route validates the crop segment via resolveCrop() before
touching data, from day one — the class of fix Phase 1 had to
retrofit into seo.ts is applied here proactively.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 9: Client page — `RankingsView.tsx`

**Files:**
- Create: `client/src/pages/RankingsView.tsx`
- Modify: `client/src/App.tsx`

**Depends on:** Task 8 (`/api/rankings/:crop`).

**No new test framework for this task** — this component follows the same shape as `client/src/pages/CropView.tsx`, and no existing page component in this codebase has test coverage; adding React Testing Library for one new page would be inconsistent scope creep relative to the rest of the client codebase. Verification is manual/browser-based, matching every other client page in this repo.

- [ ] **Step 1: Register the route in `client/src/App.tsx`**

Add the lazy import alongside the others:

```typescript
const RankingsView = lazy(() => import("@/pages/RankingsView"));
```

Add the route inside `<Switch>`, near `/crop/:crop`:

```tsx
          <Route path="/rankings/:crop" component={RankingsView} />
```

- [ ] **Step 2: Write `client/src/pages/RankingsView.tsx`**

```tsx
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Trophy, ChevronRight } from "lucide-react";

interface RankingRow {
  rank: number;
  country: string;
  code: string | null;
  production: number;
  yield: number;
  area: number;
  yoyPct: number | null;
  year: string;
}

export default function RankingsView() {
  const params = useParams<{ crop: string }>();
  const crop = params.crop || "Coffee";

  useEffect(() => {
    document.title = `${crop} Production by Country — World Ranking | Afrixplorer`;
  }, [crop]);

  const { data, isLoading } = useQuery<{ crop: string; rankings: RankingRow[] }>({
    queryKey: ["/api/rankings", crop],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  const rankings = data?.rankings || [];
  const top = rankings[0];
  const africanRows = rankings.filter((r) => r.code !== null);
  const chartData = rankings.slice(0, 10).map((r) => ({ name: r.country, production: r.production, isAfrican: r.code !== null }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-rankings-title">
          {crop} Production by Country — World Ranking
        </h1>
        {top && (
          <p className="text-sm text-muted-foreground">
            {top.country} leads at {top.production.toLocaleString()}K tonnes ({top.year})
          </p>
        )}
      </div>

      {rankings.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-sm text-muted-foreground">
            Ranking data for {crop} is not available yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top 10 Producers (thousands of tonnes)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={100} />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()}K tonnes`, "Production"]}
                    />
                    <Bar dataKey="production" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.isAfrican ? "hsl(152, 55%, 28%)" : "hsl(var(--muted-foreground))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Full Ranking</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3">Rank</th>
                    <th className="py-2 pr-3">Country</th>
                    <th className="py-2 pr-3 text-right">Production (K t)</th>
                    <th className="py-2 pr-3 text-right">Yield (hg/ha)</th>
                    <th className="py-2 pr-3 text-right">YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r) => (
                    <tr key={r.country} className="border-b last:border-0">
                      <td className="py-2 pr-3 tabular-nums">{r.rank}</td>
                      <td className="py-2 pr-3">
                        {r.code ? (
                          <Link href={`/country/${r.code}`}>
                            <span className="text-primary hover:underline cursor-pointer">{r.country}</span>
                          </Link>
                        ) : (
                          r.country
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.production.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.yield.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.yoyPct !== null ? `${r.yoyPct > 0 ? "+" : ""}${r.yoyPct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {africanRows.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Trophy size={14} className="text-primary" />
                  {crop} in Africa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {africanRows.map((r) => (
                  <Link key={r.country} href={`/explore/${r.code}/${crop}`}>
                    <div className="flex items-center justify-between text-sm py-1.5 hover:text-primary cursor-pointer transition-colors">
                      <span>{r.country} — #{r.rank} globally</span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {r.production.toLocaleString()}K t <ChevronRight size={12} />
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="text-sm">
            <Link href={`/crop/${crop}`}>
              <span className="text-primary hover:underline cursor-pointer">See the full Africa view for {crop} →</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Manual browser verification**

Run `npm run dev`, open `http://localhost:PORT/rankings/Coffee`:
- Confirm the tab title, H1, bar chart (African bars in green, others in gray), full table, and "Coffee in Africa" section all render.
- Confirm clicking an African country name/row navigates to its `/country/:code` or `/explore/:code/Coffee` page.
- Confirm "See the full Africa view for Coffee →" navigates to `/crop/Coffee`.
- Check the browser console for errors.
- Try `http://localhost:PORT/rankings/Sorghum` — confirm it 404s (via the server-side `isKnownRoute`/route-not-matched behavior already wired in Task 7/8) rather than showing a broken client page.

- [ ] **Step 4: Run `npx tsc --noEmit` and the full vitest suite one more time**

Run: `npx tsc --noEmit && npx vitest run`
Expected: both clean — confirms the new client file doesn't break the server-side type-checking or test suite (it shouldn't, since it's an isolated new file, but confirm rather than assume).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/RankingsView.tsx client/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(seo): add RankingsView client page for /rankings/:crop

Follows the existing CropView.tsx shape: bar chart of the top 10,
full sortable-by-nothing-yet table, an Africa-specific subsection
linking into existing country/explore pages, and a cross-link back
to the crop's Africa-only view. No new test framework added for
this component, consistent with every other page in this codebase.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01N7DsbbLzgiSxUQLbuMnUrd
EOF
)"
```

---

### Task 10: End-to-end verification against a production build

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite one final time**

```bash
npx vitest run
python3 scripts/test_refresh_data.py -v
npx tsc --noEmit
```

Expected: all green.

- [ ] **Step 2: Build and run production mode**

```bash
npm run build
npm start
```

- [ ] **Step 3: Re-verify the key behaviors against the production server**

```bash
curl -s "http://localhost:PORT/rankings/Coffee" | grep -A2 "<h1>"
curl -s "http://localhost:PORT/rankings/Coffee" | wc -c
curl -sI "http://localhost:PORT/rankings/rice" | grep -i "^location"
curl -sI "http://localhost:PORT/rankings/Sorghum" | grep "^HTTP"
curl -s http://localhost:PORT/sitemap.xml | grep -c "rankings"
curl -s "http://localhost:PORT/rankings/%3Cscript%3Ealert(1)%3C%2Fscript%3E" | grep -c "<script>alert"
```

Expected: real content; thousands of bytes (not empty); lowercase redirects; unknown/non-launch crop 404s; 14 sitemap entries; zero occurrences of an unescaped script tag (confirms the `resolveCrop`-first validation pattern holds here too, same as the Phase 1 security fix).

- [ ] **Step 4: No commit for this task** — verification gate only. If anything fails, return to the relevant task, fix, and re-verify.

---

## What this plan does not cover

- Expanding the site's core African per-country data (trade, prices, World Bank indicators, full 2010-2024 series) to non-African countries. Global data stays scoped to the narrow rankings use case (latest 2 years, production/yield/area).
- Rankings pages for any crop outside the 14-crop launch list — extending later only requires adding to `RANKING_CROPS` in both `refresh-data.py` and `server/seo.ts`/`server/routes.ts`, then re-running the refresh; no new pipeline code.
- Automated tests for `injectSEO` as a whole, the new API route handler, or the `RankingsView` React component — each follows an existing, consistently untested pattern in this codebase (thin glue code / page components), and adding a second (supertest) or third (React Testing Library) test framework for this one feature would be inconsistent scope expansion relative to what was asked. Tests are concentrated on the new pure logic: the Python filter/rank function, `renderRankingsContent`, and the `rankings` clauses in `canonicalRedirect`/`isKnownRoute`.
