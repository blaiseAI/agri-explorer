import type { Express } from "express";
import { createServer, type Server } from "http";
import { getCropData, getTradeData, getImportData, getWorldBankData, getGlobalAvgYields, getCountries, getCrops, getYears, getMetadata, getProducerPrices } from "./data";
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

    const PRODUCER_PRICES = getProducerPrices();
    const cropPrices = PRODUCER_PRICES[country]?.[crop] || null;
    const WORLD_BANK_DATA = getWorldBankData();
    const wbCountry = WORLD_BANK_DATA[country];

    res.json({
      country,
      crop,
      timeSeries,
      globalAvgYield: GLOBAL_AVG_YIELDS[crop] || null,
      producerPrices: cropPrices,
      riskFactors: wbCountry ? {
        politicalStability: wbCountry.politicalStability ?? null,
        ruleOfLaw: wbCountry.ruleOfLaw ?? null,
        logisticsIndex: wbCountry.logisticsIndex ?? null,
        climateExposure: wbCountry.climateExposure ?? null,
        irrigatedLand: wbCountry.irrigatedLand ?? null,
        fertilizerUse: wbCountry.fertilizerUse ?? null,
      } : null,
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
    const IMPORT_DATA = getImportData();
    const imports = IMPORT_DATA[country];
    const PRODUCER_PRICES = getProducerPrices();

    const crops = Object.entries(countryData).map(([cropName, data]) => {
      const years = Object.keys(data.production).sort();
      const latestYear = years[years.length - 1];
      const firstYear = years[0];

      // Compute revenue per hectare from producer prices
      const priceData = PRODUCER_PRICES[country]?.[cropName];
      let revenuePerHa: number | null = null;
      if (priceData && data.yield[latestYear]) {
        const recentYears = Object.keys(priceData).sort().slice(-3);
        const prices = recentYears.map(y => priceData[y]).filter(Boolean);
        if (prices.length > 0) {
          const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
          const yieldTonnesPerHa = data.yield[latestYear] / 10000;
          revenuePerHa = Math.round(yieldTonnesPerHa * avgPrice);
        }
      }

      // Compute export orientation tag
      const tradeYears = Object.keys(trade?.[cropName] || {}).sort();
      const latestTradeYear = tradeYears[tradeYears.length - 1];
      const tradeVal = latestTradeYear ? trade?.[cropName]?.[latestTradeYear] : null;
      let exportOrientation: string | null = null;
      if (tradeVal && priceData && data.production[latestYear]) {
        const recentYears = Object.keys(priceData).sort().slice(-3);
        const pricesArr = recentYears.map(y => priceData[y]).filter(Boolean);
        if (pricesArr.length > 0) {
          const avgP = pricesArr.reduce((a: number, b: number) => a + b, 0) / pricesArr.length;
          const exportUSD = tradeVal * 1_000_000;
          const prodTonnes = data.production[latestYear] * 1000;
          const ratio = exportUSD / (prodTonnes * avgP);
          exportOrientation = ratio > 0.30 ? 'Export-oriented'
            : ratio > 0.05 ? 'Mixed market' : 'Domestic market';
        }
      }

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
        importData: imports?.[cropName] || null,
        revenuePerHa,
        exportOrientation,
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
        politicalStability: wb.politicalStability,
        ruleOfLaw: wb.ruleOfLaw,
        corruption: wb.corruption,
        logisticsIndex: wb.logisticsIndex,
        irrigatedLand: wb.irrigatedLand,
        precipitation: wb.precipitation,
        climateExposure: wb.climateExposure,
        fertilizerUse: wb.fertilizerUse,
        agValueGrowth: wb.agValueGrowth,
        fdiInflows: wb.fdiInflows,
      } : null,
      topImports: (() => {
        if (!imports) return [];
        const aggregates = new Set([
          'Crops and livestock products', 'Food Excluding Fish',
          'Cereals and Preparations', 'Fats and Oils (excluding Butter)',
          'Sugar and Honey', 'Fruit and Vegetables', 'Meat and Meat Preparations',
          'Dairy Products and Birds Eggs', 'Coffee and Coffee Substitutes',
          'Animal or vegetable fats and oils and their fractions',
          'Vegetables and Fruit', 'Oilseeds', 'Oil Crops', 'Pulses',
        ]);
        return Object.entries(imports)
          .filter(([crop]) => !aggregates.has(crop))
          .map(([crop, years]: [string, any]) => {
            const sortedYears = Object.keys(years).sort();
            const latest = sortedYears[sortedYears.length - 1];
            return { crop, value: years[latest], year: latest };
          })
          .filter(i => i.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 10);
      })(),
    });
  });

  // Compare a single crop across all countries
  app.get("/api/crop/:crop", (req, res) => {
    const { crop } = req.params;
    const CROP_DATA = getCropData();
    const GLOBAL_AVG_YIELDS = getGlobalAvgYields();
    const TRADE_DATA = getTradeData();
    const COUNTRIES = getCountries();
    const PRODUCER_PRICES = getProducerPrices();

    const countries = COUNTRIES.map(c => {
      const data = CROP_DATA[c.name]?.[crop];
      if (!data) return null;

      const years = Object.keys(data.production).sort();
      const latestYear = years[years.length - 1];
      const firstYear = years[0];

      // Get latest trade value
      const tradeYears = Object.keys(TRADE_DATA[c.name]?.[crop] || {}).sort();
      const latestTradeYear = tradeYears[tradeYears.length - 1];

      // Compute revenue per hectare from producer prices
      const priceData = PRODUCER_PRICES[c.name]?.[crop];
      let revenuePerHa: number | null = null;
      if (priceData && data.yield[latestYear]) {
        const recentYears = Object.keys(priceData).sort().slice(-3);
        const prices = recentYears.map(y => priceData[y]).filter(Boolean);
        if (prices.length > 0) {
          const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
          const yieldTonnesPerHa = data.yield[latestYear] / 10000;
          revenuePerHa = Math.round(yieldTonnesPerHa * avgPrice);
        }
      }

      // Compute export orientation tag
      let exportOrientation: string | null = null;
      const tradeValUSD = latestTradeYear ? TRADE_DATA[c.name]?.[crop]?.[latestTradeYear] : null;
      if (tradeValUSD && priceData && data.production[latestYear]) {
        const recentPriceYears = Object.keys(priceData).sort().slice(-3);
        const pricesArr = recentPriceYears.map(y => priceData[y]).filter(Boolean);
        if (pricesArr.length > 0) {
          const avgP = pricesArr.reduce((a: number, b: number) => a + b, 0) / pricesArr.length;
          const exportUSD = tradeValUSD * 1_000_000;
          const prodTonnes = data.production[latestYear] * 1000;
          const ratio = exportUSD / (prodTonnes * avgP);
          exportOrientation = ratio > 0.30 ? 'Export-oriented'
            : ratio > 0.05 ? 'Mixed market' : 'Domestic market';
        }
      }

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
        revenuePerHa,
        exportOrientation,
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

    // Compute CAGR for each crop (production growth over the full period)
    const firstYear = YEARS[0];
    const cropGrowth: Record<string, number> = {};
    const firstYearProduction: Record<string, number> = {};
    for (const [_country, crops] of Object.entries(CROP_DATA)) {
      for (const [cropName, data] of Object.entries(crops)) {
        const first = data.production[firstYear] || 0;
        firstYearProduction[cropName] = (firstYearProduction[cropName] || 0) + first;
      }
    }
    const numYears = YEARS.length - 1;
    for (const cropName of Object.keys(totalProduction)) {
      const latest = totalProduction[cropName];
      const first = firstYearProduction[cropName] || 0;
      if (first > 0 && latest > 0 && numYears > 0) {
        cropGrowth[cropName] = +((Math.pow(latest / first, 1 / numYears) - 1) * 100).toFixed(1);
      }
    }

    res.json({
      totalProduction,
      countryProduction,
      topInsights,
      cropGrowth,
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
