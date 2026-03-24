# SQLite Migration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the single giant `live-data.json` into a fast, relational SQLite database (`afrixplorer.db`) to fix slow server boots, deep memory usage, and enable fast filtering.

**Architecture:** Change `refresh-data.py` to `INSERT` records into SQLite tables instead of dumping a big nested Dict. Change `server/data.ts` to connect to SQLite using `better-sqlite3` and query those tables, reshaping the data to match the existing API interfaces so downstream systems continue working seamlessly.

**Tech Stack:** Python 3 (sqlite3), Node.js (better-sqlite3)

---

## Chunk 1: Database Generation Script (`refresh-data.py`)

**Files:**
- Modify: `scripts/refresh-data.py`
- Modify: `package.json`

- [ ] **Step 1: Add sqlite3 and schema definition to Python**
Edit `scripts/refresh-data.py` to import `sqlite3`. Define the `afrixplorer.db` schema at the top of the file, matching the design spec (tables: `crop_metrics`, `trade_metrics`, `price_metrics`, `world_bank_metrics`, `global_avg_yields`, `metadata`).

- [ ] **Step 2: Rewrite JSON dumping to SQL inserts**
Find the block at the bottom of `refresh-data.py` where `output` is built. Replace the `json.dump` logic. 
- Create a temporary database (`data/afrixplorer.db.tmp`).
- Create all tables.
- Iterate through `crop_data` and insert into `crop_metrics`.
- Iterate through `trade_data` and insert into `trade_metrics`.
- Iterate through `producer_prices` and `wfp_prices` and insert into `price_metrics`.
- Ensure transactions (`BEGIN`/`COMMIT`) are used so insertions are fast.
- Once complete, `os.replace` the tmp file to `data/afrixplorer.db`.

- [ ] **Step 3: Run Python script**
Run `./scripts/refresh-data.py` to generate the new `afrixplorer.db`. Verify it was created successfully using the `sqlite3` CLI: `sqlite3 server/data/afrixplorer.db "SELECT count(*) FROM crop_metrics;"`

- [ ] **Step 4: Install better-sqlite3 in Node project**
Run `npm i better-sqlite3` and `npm i -D @types/better-sqlite3` from the root directory.

- [ ] **Step 5: Commit Phase 1**
```bash
git add scripts/refresh-data.py package.json package-lock.json
git commit -m "feat(data): py script now generates SQLite db instead of JSON"
```

## Chunk 2: Node.js Read Path (`server/data.ts`)

**Files:**
- Modify: `server/data.ts`

- [ ] **Step 1: Replace liveData memory store with SQLite connection**
Remove the `_liveData` global variable and `loadLiveData()` function. Import `better-sqlite3` and establish a connection to `server/data/afrixplorer.db`. Open it in `readonly` mode. Keep a module-level `db` instance.

- [ ] **Step 2: Rewrite World Bank, Yield, and Lookup getters**
Rewrite the simple accessors first:
- `getCropData()`: Query `crop_metrics` and format the response back into the giant nested json shape for compatibility.
- `getWorldBankData()`: Query `world_bank_metrics` and format for compatibility.
- `getGlobalAvgYields()`: Query `global_avg_yields`.
- `getCountries()`: Create a distinct list of countries from DB or a static list.
- `getCrops()`: Create a distinct list of crops from DB or static list.

- [ ] **Step 3: Rewrite Trade Data getter**
Rewrite `getTradeData()` to query `trade_metrics` and format into the expected `Record<string, Record<string, Record<string, number>>>` shape.

- [ ] **Step 4: Rewrite Price getters**
Rewrite `getProducerPrices()`, `getWfpPrices()`, and `getWfpProxyFlags()`. Query `price_metrics` and return the data in the existing nested dictionary shapes expected by `getBestPrice()`.

- [ ] **Step 5: Fix getBestPrice() signature (Optional but recommended)**
*Note: Since the backend is now SQLite, returning the entire database of prices just to find one price is highly inefficient. If you find `getBestPrice` is too nested in `data.ts`, you can rewrite `getBestPrice(country, crop)` to execute direct SQL `SELECT` queries for that specific country+crop, greatly simplifying the data layer.*

- [ ] **Step 6: Test Data API**
Start the server `npm run dev`. Verify it boots instantly compared to before.

- [ ] **Step 7: Verify endpoints**
Run:
`curl -s localhost:3001/api/leaderboard | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))"`
Ensure it returns the expected ~100 array items. Ensure Top Crops still works.

- [ ] **Step 8: Commit Phase 2**
```bash
git add server/data.ts
git commit -m "feat(api): connect node server to sqlite for data lookups"
```
