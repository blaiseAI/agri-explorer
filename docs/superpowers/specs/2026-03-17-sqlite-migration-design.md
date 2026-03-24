# SQLite Migration Architecture

## Goal
Migrate Afrixplorer's data backend from a single giant `live-data.json` file loaded into memory to a structured `afrixplorer.db` SQLite database. This solves slow server boot times, excessive memory usage, and enables complex filtering/querying capabilities needed for future features like the "Find My Opportunity" quiz.

## Current vs Proposed Architecture

**Current (JSON):**
- `refresh-data.py` completes 5+ API fetches (FAOSTAT, WB, Comtrade, HDX) and dumps a 50MB+ JSON object to disk.
- Node.js server reads the entire file into RAM on boot (`_liveData`).
- Filter operations run in JavaScript memory arrays.

**Proposed (SQLite):**
- `refresh-data.py` parses the API fetches and inserts rows into relational SQLite tables. It writes directly to a temporary `.db.tmp`, creating indexes, and renames it atomically to `.db`.
- Node.js uses `better-sqlite3` to perform sub-1ms lookups directly from disk.
- Replaces heavy array mapping with standard SQL queries.

## Database Schema

Database path: `server/data/afrixplorer.db`

### 1. `crop_metrics`
Consolidates production, yield, and area data.
- `id` (PK)
- `country` (TEXT)
- `crop` (TEXT)
- `year` (INTEGER)
- `production_tonnes` (REAL)
- `yield_hg_ha` (REAL)
- `area_harvested_ha` (REAL)
- **Indexes:** `idx_crop_metrics_ccy (country, crop, year)`

### 2. `trade_metrics`
- `id` (PK)
- `country` (TEXT)
- `crop` (TEXT)
- `year` (INTEGER)
- `export_value_usd` (REAL)
- `import_value_usd` (REAL)
- **Indexes:** `idx_trade_metrics_ccy (country, crop, year)`

### 3. `price_metrics`
- `id` (PK)
- `country` (TEXT)
- `crop` (TEXT)
- `year` (INTEGER)
- `producer_price_usd` (REAL)    // FAOSTAT official
- `wfp_price_usd` (REAL)         // HDX VAM (farmgate adjusted)
- `wfp_is_proxy` (BOOLEAN)       // Flag for processed forms (e.g. maize flour)
- **Indexes:** `idx_price_metrics_ccy (country, crop, year)`

### 4. `world_bank_metrics`
- `country` (TEXT)
- `indicator` (TEXT)   // e.g., 'politicalStability', 'agGdpPct'
- `value` (REAL)
- **Indexes:** `idx_wb_metrics (country, indicator)`

### 5. `global_avg_yields`
- `crop` (TEXT PRIMARY KEY)
- `avg_yield_hg_ha` (REAL)

### 6. `metadata`
- `key` (TEXT PRIMARY KEY)
- `value` (TEXT)    // Stores JSON stringified stats: last_updated, errors, counts

## Implementation Plan (Phases)

### Phase 1: Data Generation (`refresh-data.py`)
1. Import `sqlite3` natively in the Python script.
2. Build schema creation block (`CREATE TABLE IF NOT EXISTS...`).
3. Refactor the `output` JSON construction into batched `cursor.executemany` inserts.
4. Add transactions so the DB isn't committed unless all core data passes.

### Phase 2: Server Read Path (`server/data.ts`)
1. Install `better-sqlite3` via npm.
2. Replace `loadLiveData()` with a persistent DB connection.
3. Rewrite accessors (`getCropData`, `getTradeData`, etc.) to run `SELECT` queries and format the result to match the expected interface, so downstream components (`insights.ts`, `Dashboard.tsx`) don't break.
4. *Stretch:* Refactor `generateLeaderboard()` and `generateTopCrops()` in `insights.ts` to push computation down to the SQL layer where appropriate.

## Testing & Verification
- Run `refresh-data.py` and verify `afrixplorer.db` size and schema via `sqlite3` CLI.
- Verify `npm run dev` boot time drops from ~2s to ~50ms.
- API snapshot tests: `/api/leaderboard` and `/api/country/Kenya` must return identical data structures as before.
