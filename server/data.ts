// Data layer that loads from live-data.json (refreshed periodically from FAOSTAT, World Bank, UN Comtrade)
// Falls back to embedded baseline data if the live file is missing or corrupt

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ──────────────────── Types ────────────────────

type CropTimeSeries = Record<string, number>;
type CropElements = { production: CropTimeSeries; yield: CropTimeSeries; area: CropTimeSeries };
type CountryCrops = Record<string, CropElements>;

export interface DataMetadata {
  lastUpdated: string;
  sources: Record<string, { name: string; url: string; description: string; status: string }>;
  countries: { name: string; code: string; region: string }[];
  crops: string[];
  years: string[];
  errors: string[];
}

// ──────────────────── Live Data Loader ────────────────────

const __filename_esm = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
const __dirname_esm = typeof __dirname !== 'undefined' ? __dirname : path.dirname(__filename_esm);
const LIVE_DATA_PATH = path.join(__dirname_esm, "data", "live-data.json");

let _liveData: any = null;
let _lastLoadTime = 0;
const RELOAD_INTERVAL = 5 * 60 * 1000; // Re-read file every 5 minutes

function loadLiveData(): any {
  const now = Date.now();
  if (_liveData && now - _lastLoadTime < RELOAD_INTERVAL) {
    return _liveData;
  }

  try {
    if (fs.existsSync(LIVE_DATA_PATH)) {
      const raw = fs.readFileSync(LIVE_DATA_PATH, "utf-8");
      _liveData = JSON.parse(raw);
      _lastLoadTime = now;
      console.log(`[data] Loaded live data (updated: ${_liveData?.metadata?.lastUpdated})`);
      return _liveData;
    }
  } catch (e) {
    console.warn("[data] Failed to load live-data.json, using fallback:", e);
  }

  return null;
}

// ──────────────────── Exported Data ────────────────────

export function getMetadata(): DataMetadata {
  const live = loadLiveData();
  if (live?.metadata) return live.metadata;
  return {
    lastUpdated: "2022-12-31T00:00:00Z",
    sources: {},
    countries: COUNTRIES_FALLBACK.map(c => ({ name: c.name, code: c.code, region: c.region })),
    crops: [...CROPS_FALLBACK],
    years: [...YEARS_FALLBACK],
    errors: ["Live data not available, using embedded baseline"],
  };
}

export function getCountries() {
  const live = loadLiveData();
  if (live?.metadata?.countries) return live.metadata.countries;
  return COUNTRIES_FALLBACK;
}

export function getCrops(): string[] {
  const live = loadLiveData();
  if (live?.metadata?.crops) return live.metadata.crops;
  return [...CROPS_FALLBACK];
}

export function getYears(): string[] {
  const live = loadLiveData();
  if (live?.metadata?.years) return live.metadata.years;
  return [...YEARS_FALLBACK];
}

export function getCropData(): Record<string, CountryCrops> {
  const live = loadLiveData();
  if (live?.cropData) return live.cropData;
  return CROP_DATA_FALLBACK;
}

export function getGlobalAvgYields(): Record<string, number> {
  const live = loadLiveData();
  if (live?.globalAvgYields) return live.globalAvgYields;
  return GLOBAL_AVG_YIELDS_FALLBACK;
}

export function getWorldBankData(): Record<string, Record<string, Record<string, number | null>>> {
  const live = loadLiveData();
  if (live?.worldBankData) return live.worldBankData;
  return WORLD_BANK_FALLBACK;
}

export function getTradeData(): Record<string, Record<string, Record<string, number>>> {
  const live = loadLiveData();
  if (live?.tradeData) return live.tradeData;
  return TRADE_DATA_FALLBACK;
}

export function getProducerPrices(): Record<string, Record<string, Record<string, number>>> {
  const live = loadLiveData();
  if (live?.producerPrices) return live.producerPrices;
  return {};
}

export function getImportData(): Record<string, Record<string, Record<string, number>>> {
  const live = loadLiveData();
  if (live?.importData) return live.importData;
  return {};
}

// ──────────────────── Fallback Constants ────────────────────

const COUNTRIES_FALLBACK = [
  { name: "Uganda", code: "UGA", region: "East Africa" },
  { name: "Kenya", code: "KEN", region: "East Africa" },
  { name: "Rwanda", code: "RWA", region: "East Africa" },
  { name: "Nigeria", code: "NGA", region: "West Africa" },
  { name: "Ghana", code: "GHA", region: "West Africa" },
  { name: "Tanzania", code: "TZA", region: "East Africa" },
];

const CROPS_FALLBACK = ["Maize", "Coffee", "Rice", "Cassava", "Cocoa", "Beans"];

const YEARS_FALLBACK = ["2010","2011","2012","2013","2014","2015","2016","2017","2018","2019","2020","2021","2022"];

const GLOBAL_AVG_YIELDS_FALLBACK: Record<string, number> = {
  "Maize": 5900, "Coffee": 1100, "Rice": 4700, "Cassava": 11500, "Cocoa": 480, "Beans": 800,
};

const CROP_DATA_FALLBACK: Record<string, CountryCrops> = {};
const WORLD_BANK_FALLBACK: Record<string, Record<string, Record<string, number | null>>> = {};
const TRADE_DATA_FALLBACK: Record<string, Record<string, Record<string, number>>> = {};
