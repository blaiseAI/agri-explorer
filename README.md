# AgriScope — African Agricultural Investment Explorer

Discover agricultural investment opportunities across **54 African countries** and **136 crops**. AgriScope surfaces production trends, yield gaps, trade signals, and economic indicators to help people understand where opportunities may exist — without making financial advice.

**[View Live Demo](https://agriscope.blaise.ai)**

---

## Features

### Overview Dashboard
- Continental summary: total production across top crops, country count, data range
- **Top Investment Signals** — algorithmically scored insights with geographic diversity (covers East, West, Central, North, and Southern Africa)
- Explore by country (grouped by region) or by crop with search

### Country Explorer
- Per-country breakdown of all crops grown, with production, yield, and area data
- World Bank economic indicators: agriculture GDP %, rural population %, agricultural employment %
- Trade data visualization (export values over time)
- Interactive year-range slider to focus on specific time periods
- CSV export of all data tables

### Crop Comparison
- Compare any crop across all 54 countries
- Sort by production, yield, growth, area, or trade value
- Filter by African region (East, West, Central, North, Southern)
- Trade value badges on country cards
- CSV export

### Crop Detail
- Full time-series charts for production, yield, and area harvested
- Yield comparison against the Africa-wide average
- Year-range slider for focused analysis

### Investment Signals
- **5 signal types**: Growth, Yield Gap, Trade Opportunity, Expansion Opportunity, Warning
- Scale-aware scoring that penalizes tiny-base inflation (a crop going from 1K to 5K tonnes scores lower than one going from 100K to 500K, even at the same growth rate)
- Geographic diversity algorithm: max 2 signals per country, at least 1 from each African region

---

## Data Sources

| Source | Data | Update Frequency |
|--------|------|------------------|
| [FAOSTAT](https://www.fao.org/faostat/) | Crop production, yields, area harvested | Weekly (automated) |
| [World Bank](https://data.worldbank.org/) | Agriculture GDP %, rural population %, ag employment %, population | Weekly (automated) |
| [UN Comtrade](https://comtrade.un.org/) | Export/trade values by country and crop | Weekly (automated) |

Data spans **2010–2024** and is refreshed automatically every Monday via `scripts/refresh-data.py`.

---

## Tech Stack

- **Frontend**: React 18, Tailwind CSS 3, shadcn/ui, Recharts, Framer Motion, Wouter (hash routing)
- **Backend**: Express 5, TypeScript
- **Data**: Python refresh script pulling from FAOSTAT bulk CSV, World Bank API, UN Comtrade API
- **Build**: Vite 7, esbuild, TSX

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.8+ (for data refresh only)
- npm

### Install

```bash
git clone https://github.com/blaiseAI/agri-explorer.git
cd agri-explorer
npm install
```

### Development

```bash
npm run dev
```

This starts both the Express backend and Vite dev server on the same port with hot reload.

### Production Build

```bash
npm run build
mkdir -p dist/data
cp server/data/live-data.json dist/data/
npm start
```

The production server runs on port 5000.

---

## Data Refresh

The included Python script pulls fresh data from all three sources:

```bash
python3 scripts/refresh-data.py
```

This outputs `server/data/live-data.json` (~1.5 MB) containing all 54 countries, 136 crops, and economic indicators. The script handles API rate limits, retries, and graceful fallbacks (e.g., if World Bank times out, existing data is preserved).

---

## Project Structure

```
agri-explorer/
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/         # UI components (shadcn/ui + custom)
│   │   ├── pages/              # Route pages
│   │   │   ├── Dashboard.tsx   # Overview dashboard
│   │   │   ├── CountryView.tsx # Country detail page
│   │   │   ├── CropView.tsx    # Crop comparison page
│   │   │   └── CropDetail.tsx  # Single crop detail page
│   │   ├── lib/                # Utilities (query client, CSV export)
│   │   └── index.css           # Tailwind + custom theme
│   └── index.html
├── server/
│   ├── data/
│   │   └── live-data.json      # Main dataset (~1.5 MB)
│   ├── data.ts                 # Data loader with ESM/CJS compatibility
│   ├── insights.ts             # Investment signal scoring + diversity algorithm
│   ├── routes.ts               # Express API routes
│   └── index.ts                # Server entry point
├── scripts/
│   └── refresh-data.py         # Automated data refresh from FAOSTAT/WorldBank/Comtrade
├── shared/
│   └── schema.ts               # TypeScript types shared between client and server
└── package.json
```

---

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/overview` | Dashboard summary: production totals, top insights, metadata |
| `GET /api/countries` | List of all 54 countries with regions and codes |
| `GET /api/crops` | List of all 136 crops |
| `GET /api/country/:country` | All crop data + economic indicators for a country |
| `GET /api/crop/:crop` | Cross-country comparison for a single crop |
| `GET /api/crop-data/:country/:crop` | Time-series data for a specific country-crop pair |
| `GET /api/insights?country=&crop=` | Investment signals, optionally filtered |
| `GET /api/metadata` | Data freshness, sources, last updated timestamp |

---

## Design

- **Typography**: General Sans (Fontshare) + Inter fallback
- **Color palette**: Earth-toned green primary, terra/amber accents
- **Dark mode**: System-preference aware with manual toggle
- **Flags**: Emoji flags for all 54 countries
- **Crop icons**: Emoji mapping for 136 crops

---

## Disclaimer

AgriScope is an informational tool that surfaces publicly available agricultural data. It does **not** provide financial advice. Investment signals are algorithmically generated based on historical trends and should not be interpreted as recommendations. Always conduct your own due diligence before making investment decisions.

---

## License

MIT

---

Created by Blaise Sebagabo
