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

export function getWfpPrices(): Record<string, Record<string, Record<string, number>>> {
  const live = loadLiveData();
  if (live?.wfpPrices) return live.wfpPrices;
  return {};
}

export function getWfpProxyFlags(): Record<string, Record<string, boolean>> {
  const live = loadLiveData();
  if (live?.wfpProxyFlags) return live.wfpProxyFlags;
  return {};
}

export interface BestPrice {
  price: number;
  year: string;
  source: string;       // e.g. "FAOSTAT 2024" or "West Africa avg"
  isEstimate: boolean;
  isProcessedProxy: boolean;  // true when e.g. Maize flour → Maize grain
}

/**
 * Get the best available price for a country/crop.
 * Uses actual FAOSTAT data when recent (< 5yr old).
 * Falls back to regional average from peer countries with recent data.
 */
export function getBestPrice(country: string, crop: string): BestPrice | null {
  const currentYear = new Date().getFullYear();
  const staleThreshold = currentYear - 5;

  const allPrices = getProducerPrices();
  const priceData = allPrices[country]?.[crop];

  // Check actual price data first
  if (priceData) {
    const years = Object.keys(priceData).sort();
    const latestYear = years[years.length - 1];
    if (parseInt(latestYear) >= staleThreshold) {
      // Recent data — use as-is (average of last 3 years)
      const recentYears = years.slice(-3);
      const prices = recentYears.map(y => priceData[y]).filter(Boolean);
      if (prices.length > 0) {
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

        // Outlier check: compare against continental median for this crop
        // Catches local-currency-as-USD errors (e.g. Zimbabwe ZWL)
        const allRecentPrices: number[] = [];
        for (const [, countryCrops] of Object.entries(allPrices)) {
          const pd = countryCrops[crop];
          if (!pd) continue;
          const yrs = Object.keys(pd).sort();
          const latest = yrs[yrs.length - 1];
          if (parseInt(latest) >= staleThreshold) {
            allRecentPrices.push(pd[latest]);
          }
        }

        let isOutlier = false;
        if (allRecentPrices.length >= 3) {
          allRecentPrices.sort((a, b) => a - b);
          const median = allRecentPrices[Math.floor(allRecentPrices.length / 2)];
          isOutlier = avgPrice > median * 5;
        }

        if (!isOutlier) {
          return {
            price: Math.round(avgPrice),
            year: recentYears[recentYears.length - 1],
            source: `FAOSTAT ${recentYears[recentYears.length - 1]}`,
            isEstimate: false,
            isProcessedProxy: false,
          };
        }
        // Outlier detected — skip this price and fall through to WFP/regional
      }
    }
  }

  // Check WFP farmgate-adjusted prices
  const wfpPricesData = getWfpPrices();
  const wfpData = wfpPricesData[country]?.[crop];
  if (wfpData) {
    const wfpYears = Object.keys(wfpData).sort();
    const wfpLatest = wfpYears[wfpYears.length - 1];
    if (parseInt(wfpLatest) >= staleThreshold) {
      const recentWfpYears = wfpYears.slice(-3);
      const wfpPriceValues = recentWfpYears.map(y => wfpData[y]).filter(Boolean);
      if (wfpPriceValues.length > 0) {
        const avgWfpPrice = wfpPriceValues.reduce((a, b) => a + b, 0) / wfpPriceValues.length;
        const proxyFlags = getWfpProxyFlags();
        const isProxy = proxyFlags[country]?.[crop] === true;
        const sourceLabel = isProxy
          ? `WFP ${recentWfpYears[recentWfpYears.length - 1]} (est. farmgate, flour proxy)`
          : `WFP ${recentWfpYears[recentWfpYears.length - 1]} (est. farmgate)`;
        return {
          price: Math.round(avgWfpPrice),
          year: recentWfpYears[recentWfpYears.length - 1],
          source: sourceLabel,
          isEstimate: true,
          isProcessedProxy: isProxy,
        };
      }
    }
  }

  // Stale or missing — compute regional proxy
  const countries = getCountries();
  const countryInfo = countries.find((c: { name: string; code: string; region: string }) => c.name === country);
  if (!countryInfo) return null;

  const region = countryInfo.region;
  const peerCountries = countries.filter((c: { name: string; code: string; region: string }) => c.region === region && c.name !== country);

  // Try regional peers first
  let peerPrices: number[] = [];
  for (const peer of peerCountries) {
    const peerData = allPrices[peer.name]?.[crop];
    if (!peerData) continue;
    const peerYears = Object.keys(peerData).sort();
    const peerLatest = peerYears[peerYears.length - 1];
    if (parseInt(peerLatest) >= staleThreshold) {
      peerPrices.push(peerData[peerLatest]);
    }
  }

  let sourceLabel = `${region} avg`;

  // If no regional peers, try continent-wide
  if (peerPrices.length === 0) {
    for (const [peerCountry, peerCrops] of Object.entries(allPrices)) {
      if (peerCountry === country) continue;
      const peerData = peerCrops[crop];
      if (!peerData) continue;
      const peerYears = Object.keys(peerData).sort();
      const peerLatest = peerYears[peerYears.length - 1];
      if (parseInt(peerLatest) >= staleThreshold) {
        peerPrices.push(peerData[peerLatest]);
      }
    }
    sourceLabel = "Africa avg";
  }

  if (peerPrices.length === 0) {
    // Last resort: use the actual stale price if we have one
    if (priceData) {
      const years = Object.keys(priceData).sort();
      const recentYears = years.slice(-3);
      const prices = recentYears.map(y => priceData[y]).filter(Boolean);
      if (prices.length > 0) {
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        return {
          price: Math.round(avgPrice),
          year: recentYears[recentYears.length - 1],
          source: `FAOSTAT ${recentYears[recentYears.length - 1]}`,
          isEstimate: false,
          isProcessedProxy: false,
        };
      }
    }
    return null;
  }

  const avgPrice = peerPrices.reduce((a, b) => a + b, 0) / peerPrices.length;
  return {
    price: Math.round(avgPrice),
    year: String(currentYear),
    source: sourceLabel,
    isEstimate: true,
    isProcessedProxy: false,
  };
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
