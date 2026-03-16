import type { Express } from "express";
import { createServer, type Server } from "http";
import { getCropData, getTradeData, getWorldBankData, getGlobalAvgYields, getCountries, getCrops, getYears, getMetadata } from "./data";
import { generateInsights, generateDiverseInsights } from "./insights";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Get metadata (last updated, sources, etc.)
  app.get("/api/metadata", (_req, res) => {
    res.json(getMetadata());
  });

  // Get all countries
  app.get("/api/countries", (_req, res) => {
    res.json(getCountries());
  });

  // Get all crops
  app.get("/api/crops", (_req, res) => {
    res.json(getCrops());
  });

  // Get crop data for a specific country and crop
  app.get("/api/crop-data/:country/:crop", (req, res) => {
    const { country, crop } = req.params;
    const CROP_DATA = getCropData();
    const YEARS = getYears();
    const GLOBAL_AVG_YIELDS = getGlobalAvgYields();

    const countryData = CROP_DATA[country];
    if (!countryData) return res.status(404).json({ error: "Country not found" });
    const cropData = countryData[crop];
    if (!cropData) return res.status(404).json({ error: "Crop not found for this country" });

    // Transform to array format for charts
    const timeSeries = YEARS.map(year => ({
      year,
      production: cropData.production[year] || 0,
      yield: cropData.yield[year] || 0,
      area: cropData.area[year] || 0,
    })).filter(d => d.production > 0 || d.yield > 0 || d.area > 0);

    res.json({
      country,
      crop,
      timeSeries,
      globalAvgYield: GLOBAL_AVG_YIELDS[crop] || null,
    });
  });

  // Get all crop data for one country (overview)
  app.get("/api/country/:country", (req, res) => {
    const { country } = req.params;
    const CROP_DATA = getCropData();
    const GLOBAL_AVG_YIELDS = getGlobalAvgYields();
    const TRADE_DATA = getTradeData();
    const WORLD_BANK_DATA = getWorldBankData();
    const COUNTRIES = getCountries();

    const countryData = CROP_DATA[country];
    if (!countryData) return res.status(404).json({ error: "Country not found" });

    const wb = WORLD_BANK_DATA[country];
    const trade = TRADE_DATA[country];

    const crops = Object.entries(countryData).map(([cropName, data]) => {
      const years = Object.keys(data.production).sort();
      const latestYear = years[years.length - 1];
      const firstYear = years[0];
      return {
        name: cropName,
        latestProduction: data.production[latestYear] || 0,
        latestYield: data.yield[latestYear] || 0,
        latestArea: data.area[latestYear] || 0,
        globalAvgYield: GLOBAL_AVG_YIELDS[cropName] || null,
        productionGrowth: years.length > 1
          ? +(((data.production[latestYear] - data.production[firstYear]) / data.production[firstYear]) * 100).toFixed(1)
          : 0,
        yieldGrowth: years.length > 1 && data.yield[firstYear] > 0
          ? +(((data.yield[latestYear] - data.yield[firstYear]) / data.yield[firstYear]) * 100).toFixed(1)
          : 0,
        tradeData: trade?.[cropName] || null,
      };
    }).filter(c => c.latestProduction > 0);

    res.json({
      country,
      countryInfo: COUNTRIES.find(c => c.name === country),
      crops,
      worldBank: wb ? {
        agGdpPct: wb.agGdpPct,
        ruralPct: wb.ruralPct,
        agEmployPct: wb.agEmployPct,
        population: wb.population,
      } : null,
    });
  });

  // Compare a single crop across all countries
  app.get("/api/crop/:crop", (req, res) => {
    const { crop } = req.params;
    const CROP_DATA = getCropData();
    const GLOBAL_AVG_YIELDS = getGlobalAvgYields();
    const TRADE_DATA = getTradeData();
    const COUNTRIES = getCountries();

    const countries = COUNTRIES.map(c => {
      const data = CROP_DATA[c.name]?.[crop];
      if (!data) return null;

      const years = Object.keys(data.production).sort();
      const latestYear = years[years.length - 1];
      const firstYear = years[0];

      // Get latest trade value
      const tradeYears = Object.keys(TRADE_DATA[c.name]?.[crop] || {}).sort();
      const latestTradeYear = tradeYears[tradeYears.length - 1];

      return {
        country: c.name,
        code: c.code,
        region: c.region,
        latestProduction: data.production[latestYear] || 0,
        latestYield: data.yield[latestYear] || 0,
        latestArea: data.area[latestYear] || 0,
        productionGrowth: years.length > 1 && data.production[firstYear] > 0
          ? +(((data.production[latestYear] - data.production[firstYear]) / data.production[firstYear]) * 100).toFixed(1)
          : 0,
        tradeValue: latestTradeYear ? TRADE_DATA[c.name]?.[crop]?.[latestTradeYear] : null,
      };
    }).filter(Boolean);

    res.json({
      crop,
      globalAvgYield: GLOBAL_AVG_YIELDS[crop] || null,
      countries,
    });
  });

  // Get insights
  app.get("/api/insights", (req, res) => {
    const country = req.query.country as string | undefined;
    const crop = req.query.crop as string | undefined;
    const insights = generateInsights(country, crop);
    res.json(insights);
  });

  // Overview dashboard data
  app.get("/api/overview", (_req, res) => {
    const CROP_DATA = getCropData();
    const YEARS = getYears();
    const metadata = getMetadata();

    const latestYear = YEARS[YEARS.length - 1];
    const prevYear = YEARS.length > 1 ? YEARS[YEARS.length - 2] : null;

    // Summary stats for the hero section
    const totalProduction: Record<string, number> = {};
    const countryProduction: Record<string, number> = {};

    for (const [country, crops] of Object.entries(CROP_DATA)) {
      let countryTotal = 0;
      for (const [cropName, data] of Object.entries(crops)) {
        const latest = data.production[latestYear] || 0;
        totalProduction[cropName] = (totalProduction[cropName] || 0) + latest;
        countryTotal += latest;
      }
      countryProduction[country] = countryTotal;
    }

    const topInsights = generateDiverseInsights(6);

    res.json({
      totalProduction,
      countryProduction,
      topInsights,
      countriesCount: getCountries().length,
      cropsCount: getCrops().length,
      yearsRange: `${YEARS[0]}-${latestYear}`,
      lastUpdated: metadata.lastUpdated,
      sources: metadata.sources,
      latestYear,
    });
  });

  return httpServer;
}
