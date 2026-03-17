import { getCropData, getTradeData, getWorldBankData, getGlobalAvgYields, getCountries, getCrops, getBestPrice, getYears } from "./data";

export interface Insight {
  id: string;
  type: "opportunity" | "growth" | "yield_gap" | "trade" | "warning";
  title: string;
  description: string;
  country: string;
  region?: string;
  crop?: string;
  score: number;
  metrics?: Record<string, any>;
}

function calcCAGR(start: number, end: number, years: number): number {
  if (start <= 0 || end <= 0 || years <= 0) return 0;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

function calcYieldGap(localYield: number, globalYield: number): number {
  if (globalYield <= 0) return 0;
  return ((globalYield - localYield) / globalYield) * 100;
}

// Scale factor: penalizes tiny production volumes, rewards meaningful scale
// 1K tonnes → ~0.3, 10K → ~0.55, 100K → ~0.75, 1000K → ~0.9, 10000K → ~1.0
function scaleBonus(productionK: number): number {
  if (productionK <= 0) return 0;
  return Math.min(1, Math.log10(Math.max(1, productionK)) / 4.5 + 0.1);
}

export function generateInsights(country?: string, crop?: string): Insight[] {
  const insights: Insight[] = [];
  let id = 0;

  const CROP_DATA = getCropData();
  const TRADE_DATA = getTradeData();
  const WORLD_BANK_DATA = getWorldBankData();
  const GLOBAL_AVG_YIELDS = getGlobalAvgYields();
  const COUNTRIES = getCountries();
  const CROPS = getCrops();

  const countryLookup: Record<string, string> = {};
  for (const c of COUNTRIES) {
    countryLookup[c.name] = c.region;
  }

  const countryList = country ? [country] : COUNTRIES.map(c => c.name);
  const cropList = crop ? [crop] : [...CROPS];

  for (const c of countryList) {
    const countryData = CROP_DATA[c];
    if (!countryData) continue;
    const region = countryLookup[c] || "";
    const wb = WORLD_BANK_DATA[c];

    for (const cr of cropList) {
      const cropData = countryData[cr];
      if (!cropData) continue;

      const prodValues = Object.entries(cropData.production).sort((a, b) => a[0].localeCompare(b[0]));
      const yieldValues = Object.entries(cropData.yield).sort((a, b) => a[0].localeCompare(b[0]));
      const areaValues = Object.entries(cropData.area).sort((a, b) => a[0].localeCompare(b[0]));

      if (prodValues.length < 2) continue;

      const firstProd = prodValues[0][1];
      const lastProd = prodValues[prodValues.length - 1][1];
      const firstYield = yieldValues[0][1];
      const lastYield = yieldValues[yieldValues.length - 1][1];
      const firstArea = areaValues[0][1];
      const lastArea = areaValues[areaValues.length - 1][1];

      if (firstProd === 0 && lastProd === 0) continue;

      const prodCAGR = calcCAGR(firstProd, lastProd, prodValues.length - 1);
      const yieldCAGR = calcCAGR(firstYield, lastYield, yieldValues.length - 1);
      const areaCAGR = calcCAGR(firstArea, lastArea, areaValues.length - 1);
      const scale = scaleBonus(lastProd);

      // Governance bonus for opportunity scoring
      const polStab = typeof wb?.politicalStability === 'number' ? wb.politicalStability : null;
      const logIdx = typeof wb?.logisticsIndex === 'number' ? wb.logisticsIndex : null;
      const govBonus = (
        (polStab != null ? (polStab / 100) * 0.5 : 0) +
        (logIdx != null ? (logIdx / 5) * 0.5 : 0)
      ) * 20; // up to 20 pts

      // 1. Strong production growth
      // Score factors in growth rate AND absolute scale to avoid tiny-base inflation
      if (prodCAGR > 3 && lastProd >= 5) {
        const rawScore = 45 + prodCAGR * 3 + scale * 25 + govBonus;
        const score = Math.min(98, Math.round(rawScore));
        insights.push({
          id: `insight-${++id}`,
          type: "growth",
          title: `${cr} production rising in ${c}`,
          description: `${cr} production has grown at ${prodCAGR.toFixed(1)}% annually (${prodValues[0][0]}-${prodValues[prodValues.length-1][0]}), from ${firstProd.toLocaleString()}K to ${lastProd.toLocaleString()}K tonnes. ${yieldCAGR > 2 ? "Yield improvements are driving growth." : "Growth is mainly from area expansion."}`,
          country: c,
          region,
          crop: cr,
          score,
          metrics: { prodCAGR: +prodCAGR.toFixed(1), yieldCAGR: +yieldCAGR.toFixed(1), areaCAGR: +areaCAGR.toFixed(1), latestProd: lastProd }
        });
      }

      // 2. Yield gap opportunity — meaningful only with real production volume
      const globalAvg = GLOBAL_AVG_YIELDS[cr];
      if (globalAvg && lastYield > 0 && lastProd >= 10) {
        const gap = calcYieldGap(lastYield, globalAvg);
        if (gap > 30) {
          const rawScore = 35 + gap * 0.5 + scale * 20;
          const score = Math.min(90, Math.round(rawScore));
          insights.push({
            id: `insight-${++id}`,
            type: "yield_gap",
            title: `${cr} yield gap in ${c}: ${gap.toFixed(0)}% below Africa average`,
            description: `${c}'s ${cr} yield is ${lastYield.toLocaleString()} hg/ha vs the Africa average of ${globalAvg.toLocaleString()} hg/ha. This ${gap.toFixed(0)}% gap suggests potential for improvement through better inputs, varieties, or practices.`,
            country: c,
            region,
            crop: cr,
            score,
            metrics: { localYield: lastYield, globalAvg, gapPct: +gap.toFixed(1), latestProd: lastProd }
          });
        }
      }

      // 3. Trade opportunity
      const tradeForCountry = TRADE_DATA[c];
      if (tradeForCountry && tradeForCountry[cr]) {
        const tradeEntries = Object.entries(tradeForCountry[cr]).sort((a, b) => a[0].localeCompare(b[0]));
        if (tradeEntries.length >= 2) {
          const firstTrade = tradeEntries[0][1];
          const lastTrade = tradeEntries[tradeEntries.length - 1][1];
          if (firstTrade > 0) {
            const tradeGrowth = ((lastTrade - firstTrade) / firstTrade) * 100;
            if (tradeGrowth > 20 && lastTrade >= 5) {
              // Trade value matters a lot for trade signals
              const tradeScale = Math.min(1, Math.log10(Math.max(1, lastTrade)) / 3.5 + 0.15);
              const rawScore = 50 + tradeGrowth * 0.2 + tradeScale * 25;
              const score = Math.min(92, Math.round(rawScore));
              insights.push({
                id: `insight-${++id}`,
                type: "trade",
                title: `${cr} exports surging from ${c}`,
                description: `${cr} export value from ${c} grew ${tradeGrowth.toFixed(0)}% from $${firstTrade}M to $${lastTrade}M (${tradeEntries[0][0]}-${tradeEntries[tradeEntries.length-1][0]}). Rising global demand and competitive pricing are driving growth.`,
                country: c,
                region,
                crop: cr,
                score,
                metrics: { exportGrowth: +tradeGrowth.toFixed(1), latestExport: lastTrade }
              });
            }
          }
        }
      }

      // 4. High agriculture GDP + declining yields = warning
      if (wb && yieldCAGR < -1 && lastProd >= 10) {
        const agGdpYears = Object.keys(wb.agGdpPct || {}).sort();
        const latestAgGdpYear = agGdpYears[agGdpYears.length - 1];
        const agGdp = latestAgGdpYear ? wb.agGdpPct?.[latestAgGdpYear] : null;
        if (agGdp && agGdp > 20) {
          insights.push({
            id: `insight-${++id}`,
            type: "warning",
            title: `Declining ${cr} yields in ${c}`,
            description: `${cr} yields in ${c} are declining (${yieldCAGR.toFixed(1)}% CAGR) while agriculture represents ${agGdp}% of GDP. This signals potential challenges that may require investment in improved farming practices.`,
            country: c,
            region,
            crop: cr,
            score: 45,
            metrics: { yieldCAGR: +yieldCAGR.toFixed(1), agGdpPct: agGdp }
          });
        }
      }

      // 5. Expanding area + growing production = investment opportunity
      // Uses composite Opportunity Score: production + yield CAGR + governance indicators
      if (areaCAGR > 1.5 && prodCAGR > 3 && lastProd >= 20) {
        const rawScore = 50 + (areaCAGR + prodCAGR) * 2 + scale * 20 + govBonus;
        const score = Math.min(98, Math.round(rawScore));
        const govLabel = polStab != null || logIdx != null
          ? ` Political stability: ${polStab != null ? Math.round(polStab) + 'th pctl' : 'N/A'}${logIdx != null ? ', logistics: ' + Number(logIdx).toFixed(1) + '/5' : ''}.`
          : '';
        insights.push({
          id: `insight-${++id}`,
          type: "opportunity",
          title: `${cr} expansion opportunity in ${c}`,
          description: `Both cultivated area (+${areaCAGR.toFixed(1)}%/yr) and production (+${prodCAGR.toFixed(1)}%/yr) for ${cr} in ${c} are growing. Combined with ${lastYield > (globalAvg || 0) ? "above-average" : "below-average"} yields, this signals active investment and potential for scaling.${govLabel}`,
          country: c,
          region,
          crop: cr,
          score,
          metrics: { areaCAGR: +areaCAGR.toFixed(1), prodCAGR: +prodCAGR.toFixed(1), latestProd: lastProd, politicalStability: polStab, logisticsIndex: logIdx }
        });
      }
    }

    // 6. Country-level opportunity: high ag GDP + large rural population
    if (wb) {
      const agGdpYears = Object.keys(wb.agGdpPct || {}).sort();
      const ruralYears = Object.keys(wb.ruralPct || {}).sort();
      const agEmpYears = Object.keys(wb.agEmployPct || {}).sort();
      
      const agGdp = agGdpYears.length ? wb.agGdpPct?.[agGdpYears[agGdpYears.length - 1]] : null;
      const ruralPct = ruralYears.length ? wb.ruralPct?.[ruralYears[ruralYears.length - 1]] : null;
      const agEmploy = agEmpYears.length ? wb.agEmployPct?.[agEmpYears[agEmpYears.length - 1]] : null;
      
      if (agGdp && ruralPct && agGdp > 22 && ruralPct > 60) {
        insights.push({
          id: `insight-${++id}`,
          type: "opportunity",
          title: `${c}: large agricultural economy with rural workforce`,
          description: `Agriculture contributes ${typeof agGdp === 'number' ? agGdp.toFixed(1) : agGdp}% of GDP in ${c} with ${typeof ruralPct === 'number' ? ruralPct.toFixed(1) : ruralPct}% rural population and ${agEmploy ? (typeof agEmploy === 'number' ? agEmploy.toFixed(1) : agEmploy) : "N/A"}% agricultural employment. The scale of the agricultural sector, combined with underutilized potential, presents structural opportunities.`,
          country: c,
          region: countryLookup[c] || "",
          score: 72,
          metrics: { agGdpPct: agGdp, ruralPct, agEmployPct: agEmploy }
        });
      }
    }
  }

  // Sort by score descending
  return insights.sort((a, b) => b.score - a.score);
}

/**
 * Diversified insights for the Overview dashboard.
 * Ensures geographic spread: max 2 per country, at least 1 from each represented region,
 * and a mix of insight types.
 */
export function generateDiverseInsights(limit: number = 6): Insight[] {
  const all = generateInsights()
    // Filter out overly generic FAOSTAT aggregate categories
    .filter(ins => !['Other Vegetables', 'Other Cereals', 'Other Crops'].includes(ins.crop || ''));
  if (all.length <= limit) return all;

  const COUNTRIES = getCountries();
  const regionMap: Record<string, string> = {};
  for (const c of COUNTRIES) {
    regionMap[c.name] = c.region;
  }

  const selected: Insight[] = [];
  const usedIds = new Set<string>();
  const countryCount: Record<string, number> = {};
  const cropCount: Record<string, number> = {};
  const typeCovered = new Set<string>();

  function addInsight(ins: Insight): boolean {
    if (usedIds.has(ins.id)) return false;
    if ((countryCount[ins.country] || 0) >= 2) return false;
    if (ins.crop && (cropCount[ins.crop] || 0) >= 1) return false;  // max 1 per crop
    selected.push(ins);
    usedIds.add(ins.id);
    countryCount[ins.country] = (countryCount[ins.country] || 0) + 1;
    if (ins.crop) cropCount[ins.crop] = (cropCount[ins.crop] || 0) + 1;
    typeCovered.add(ins.type);
    return true;
  }

  // Pass 1: Pick the BEST signal from each distinct type (ensures variety)
  // Priority order ensures we get a mix
  const typeOrder: string[] = ["growth", "yield_gap", "trade", "opportunity", "warning"];
  for (const t of typeOrder) {
    if (selected.length >= limit) break;
    const best = all.find(ins => ins.type === t && !usedIds.has(ins.id) && (countryCount[ins.country] || 0) < 2 && (!ins.crop || (cropCount[ins.crop] || 0) < 1));
    if (best) addInsight(best);
  }

  // Pass 2: Fill remaining with highest-scoring, max 2 per country, avoid same type as slot 1
  // Try to get at least one signal from each region
  const regionCovered = new Set(selected.map(ins => ins.region || regionMap[ins.country] || ""));
  const allRegions = new Set(all.map(ins => ins.region || regionMap[ins.country] || "").filter(Boolean));
  
  for (const region of Array.from(allRegions)) {
    if (selected.length >= limit) break;
    if (regionCovered.has(region)) continue;
    const best = all.find(ins => 
      (ins.region || regionMap[ins.country]) === region && 
      !usedIds.has(ins.id) && 
      (countryCount[ins.country] || 0) < 2
    );
    if (best) {
      addInsight(best);
      regionCovered.add(region);
    }
  }

  // Pass 3: Fill remaining with highest-scoring insights, max 2 per country
  if (selected.length < limit) {
    for (const ins of all) {
      if (selected.length >= limit) break;
      if (usedIds.has(ins.id)) continue;
      if ((countryCount[ins.country] || 0) >= 2) continue;
      addInsight(ins);
    }
  }

  // Re-sort: put diversity first but keep relative score order within groups
  selected.sort((a, b) => b.score - a.score);

  // Reassign stable IDs
  return selected.map((ins, i) => ({ ...ins, id: `overview-insight-${i + 1}` }));
}

// ===== LEADERBOARD =====

export interface LeaderboardEntry {
  rank: number;
  country: string;
  region: string;
  crop: string;
  signalType: string;
  score: number;
  revenuePerHa: number | null;
  prodGrowth: number;
  exportValue: number | null;
  politicalStability: number | null;
  logisticsIndex: number | null;
}

const GENERIC_CROPS = ['Other Vegetables', 'Other Cereals', 'Other Crops', 'Vegetables Primary', 'Fruit Primary', 'Other Fruits', 'Other Oil Crops', 'Other Fibre Crops'];

export function generateLeaderboard(): LeaderboardEntry[] {
  const all = generateInsights();
  const CROP_DATA = getCropData();
  const TRADE_DATA = getTradeData();
  const WORLD_BANK_DATA = getWorldBankData();
  const YEARS = getYears();
  const COUNTRIES = getCountries();

  const regionMap: Record<string, string> = {};
  for (const c of COUNTRIES) regionMap[c.name] = c.region;

  // Filter: crop-specific only, no warnings, no generics
  const filtered = all.filter(ins =>
    ins.crop &&
    ins.type !== 'warning' &&
    !GENERIC_CROPS.includes(ins.crop)
  );

  // Deduplicate by country+crop — keep highest score
  const bestByPair = new Map<string, typeof filtered[0]>();
  for (const ins of filtered) {
    const key = `${ins.country}|${ins.crop}`;
    const existing = bestByPair.get(key);
    if (!existing || ins.score > existing.score) {
      bestByPair.set(key, ins);
    }
  }

  // Enrich with revenue/ha, exports, risk
  const entries: LeaderboardEntry[] = [];
  for (const ins of Array.from(bestByPair.values())) {
    const country = ins.country;
    const crop = ins.crop!;

    // Revenue/ha
    let revenuePerHa: number | null = null;
    const bestPrice = getBestPrice(country, crop);
    const cropData = CROP_DATA[country]?.[crop];
    if (bestPrice && cropData) {
      const yieldYears = Object.keys(cropData.yield).sort();
      const latestYield = cropData.yield[yieldYears[yieldYears.length - 1]] || 0;
      if (latestYield > 0) {
        revenuePerHa = Math.round((latestYield / 10000) * bestPrice.price);
      }
    }

    // Export value
    let exportValue: number | null = null;
    const tradeData = TRADE_DATA[country]?.[crop];
    if (tradeData) {
      const tradeYears = Object.keys(tradeData).sort();
      exportValue = tradeData[tradeYears[tradeYears.length - 1]] || null;
    }

    // Risk indicators
    const wb = WORLD_BANK_DATA[country];
    const politicalStability = typeof wb?.politicalStability === 'number' ? wb.politicalStability : null;
    const logisticsIndex = typeof wb?.logisticsIndex === 'number' ? wb.logisticsIndex : null;

    // Production growth
    let prodGrowth = ins.metrics?.prodCAGR ?? 0;
    if (prodGrowth === 0 && cropData) {
      // Compute if not in metrics (yield_gap and trade types don't always have it)
      const prodValues = Object.entries(cropData.production).sort((a, b) => a[0].localeCompare(b[0]));
      if (prodValues.length >= 2) {
        prodGrowth = +calcCAGR(prodValues[0][1], prodValues[prodValues.length - 1][1], prodValues.length - 1).toFixed(1);
      }
    }

    entries.push({
      rank: 0, // set after sort
      country,
      region: ins.region || regionMap[country] || '',
      crop,
      signalType: ins.type,
      score: ins.score,
      revenuePerHa,
      prodGrowth,
      exportValue,
      politicalStability,
      logisticsIndex,
    });
  }

  // Sort by score desc, assign ranks, return top 100
  entries.sort((a, b) => b.score - a.score);
  return entries.slice(0, 100).map((e, i) => ({ ...e, rank: i + 1 }));
}

// ===== TOP CROPS FOR INVESTMENT =====

export interface TopCrop {
  crop: string;
  fitScore: number;
  revenuePerHa: number | null;
  prodGrowth: number;
  yieldGap: number | null;
  exportValue: number | null;
  reason: string;
}

export function generateTopCrops(country: string): TopCrop[] {
  const CROP_DATA = getCropData();
  const TRADE_DATA = getTradeData();
  const GLOBAL_AVG_YIELDS = getGlobalAvgYields();

  const countryData = CROP_DATA[country];
  if (!countryData) return [];

  // Compute raw metrics for each crop
  const raw: Array<{
    crop: string;
    revenuePerHa: number | null;
    prodGrowth: number;
    yieldGap: number | null;
    exportValue: number | null;
  }> = [];

  for (const [cropName, data] of Object.entries(countryData)) {
    if (GENERIC_CROPS.includes(cropName)) continue;

    const prodValues = Object.entries(data.production).sort((a, b) => a[0].localeCompare(b[0]));
    if (prodValues.length < 2) continue;
    const lastProd = prodValues[prodValues.length - 1][1];
    if (lastProd < 1) continue; // skip negligible production

    // Revenue/ha
    let revenuePerHa: number | null = null;
    const bestPrice = getBestPrice(country, cropName);
    const yieldValues = Object.entries(data.yield).sort((a, b) => a[0].localeCompare(b[0]));
    const latestYield = yieldValues.length > 0 ? yieldValues[yieldValues.length - 1][1] : 0;
    if (bestPrice && latestYield > 0) {
      revenuePerHa = Math.round((latestYield / 10000) * bestPrice.price);
    }

    // Production growth
    const prodGrowth = +calcCAGR(
      prodValues[0][1], prodValues[prodValues.length - 1][1], prodValues.length - 1
    ).toFixed(1);

    // Yield gap
    let yieldGap: number | null = null;
    const globalAvg = GLOBAL_AVG_YIELDS[cropName];
    if (globalAvg && latestYield > 0) {
      yieldGap = +calcYieldGap(latestYield, globalAvg).toFixed(1);
    }

    // Export value
    let exportValue: number | null = null;
    const tradeData = TRADE_DATA[country]?.[cropName];
    if (tradeData) {
      const tradeYears = Object.keys(tradeData).sort();
      exportValue = tradeData[tradeYears[tradeYears.length - 1]] || null;
    }

    raw.push({ crop: cropName, revenuePerHa, prodGrowth, yieldGap, exportValue });
  }

  if (raw.length === 0) return [];

  // Normalize each metric to 0-100 (max-scaling)
  const maxRev = Math.max(...raw.map(r => r.revenuePerHa ?? 0), 1);
  const maxGrowth = Math.max(...raw.map(r => Math.max(0, r.prodGrowth)), 1);
  const maxGap = Math.max(...raw.map(r => Math.max(0, r.yieldGap ?? 0)), 1);
  const maxExport = Math.max(...raw.map(r => r.exportValue ?? 0), 1);
  const revQuartile = [...raw.map(r => r.revenuePerHa ?? 0)].sort((a, b) => a - b);
  const topQuartileThreshold = revQuartile[Math.floor(revQuartile.length * 0.75)];

  const scored = raw.map(r => {
    const revScore = ((r.revenuePerHa ?? 0) / maxRev) * 100;
    const growthScore = (Math.max(0, r.prodGrowth) / maxGrowth) * 100;
    const gapScore = (Math.max(0, r.yieldGap ?? 0) / maxGap) * 100;
    const exportScore = ((r.exportValue ?? 0) / maxExport) * 100;
    const fitScore = Math.round(0.3 * revScore + 0.3 * growthScore + 0.2 * gapScore + 0.2 * exportScore);

    // Reason decision tree
    let reason = 'Consistent performer';
    if ((r.exportValue ?? 0) > 10 && r.prodGrowth > 50) {
      reason = 'Strong export growth + rising production';
    } else if ((r.yieldGap ?? 0) > 30 && (r.revenuePerHa ?? 0) > 500) {
      reason = 'Large yield gap — high upside potential';
    } else if ((r.revenuePerHa ?? 0) >= topQuartileThreshold && topQuartileThreshold > 0) {
      reason = 'High value crop for this region';
    } else if (r.prodGrowth > 100) {
      reason = 'Rapidly expanding production';
    }

    return { ...r, fitScore, reason };
  });

  scored.sort((a, b) => b.fitScore - a.fitScore);
  return scored.slice(0, 3);
}

// ===== SIMILAR OPPORTUNITIES =====

export interface SimilarOpportunity {
  country: string;
  crop: string;
  reason: string;
  score: number;
  revenuePerHa: number | null;
  prodGrowth: number;
}

export function generateSimilarOpportunities(country: string, crop: string): SimilarOpportunity[] {
  const all = generateInsights();
  const CROP_DATA = getCropData();
  const COUNTRIES = getCountries();
  const GLOBAL_AVG_YIELDS = getGlobalAvgYields();

  const regionMap: Record<string, string> = {};
  for (const c of COUNTRIES) regionMap[c.name] = c.region;
  const currentRegion = regionMap[country] || '';

  // Only crop-specific, no warnings, no generics, not the current one
  const candidates = all.filter(ins =>
    ins.crop &&
    ins.type !== 'warning' &&
    !GENERIC_CROPS.includes(ins.crop) &&
    !(ins.country === country && ins.crop === crop)
  );

  // Deduplicate candidates by country+crop, keep highest
  const bestByPair = new Map<string, typeof candidates[0]>();
  for (const ins of candidates) {
    const key = `${ins.country}|${ins.crop}`;
    const existing = bestByPair.get(key);
    if (!existing || ins.score > existing.score) {
      bestByPair.set(key, ins);
    }
  }
  const deduped = Array.from(bestByPair.values()).sort((a, b) => b.score - a.score);

  const results: SimilarOpportunity[] = [];
  const usedKeys = new Set<string>();

  function enrichAndAdd(ins: typeof candidates[0], reason: string): boolean {
    const key = `${ins.country}|${ins.crop}`;
    if (usedKeys.has(key)) return false;
    usedKeys.add(key);

    let revenuePerHa: number | null = null;
    const bestPrice = getBestPrice(ins.country, ins.crop!);
    const cropData = CROP_DATA[ins.country]?.[ins.crop!];
    if (bestPrice && cropData) {
      const yieldYears = Object.keys(cropData.yield).sort();
      const latestYield = cropData.yield[yieldYears[yieldYears.length - 1]] || 0;
      if (latestYield > 0) revenuePerHa = Math.round((latestYield / 10000) * bestPrice.price);
    }

    let prodGrowth = ins.metrics?.prodCAGR ?? 0;
    if (prodGrowth === 0 && cropData) {
      const pv = Object.entries(cropData.production).sort((a, b) => a[0].localeCompare(b[0]));
      if (pv.length >= 2) prodGrowth = +calcCAGR(pv[0][1], pv[pv.length - 1][1], pv.length - 1).toFixed(1);
    }

    results.push({ country: ins.country, crop: ins.crop!, reason, score: ins.score, revenuePerHa, prodGrowth });
    return true;
  }

  // Type 1: Same region, different crop (cross-sell)
  const sameRegionDiffCrop = deduped.find(ins =>
    (ins.region || regionMap[ins.country]) === currentRegion &&
    ins.crop !== crop
  );
  if (sameRegionDiffCrop) {
    enrichAndAdd(sameRegionDiffCrop, `Top performer in ${currentRegion}`);
  }

  // Type 2: Same crop, different country (benchmark)
  const sameCropDiffCountry = deduped.find(ins =>
    ins.crop === crop &&
    ins.country !== country &&
    !usedKeys.has(`${ins.country}|${ins.crop}`)
  );
  if (sameCropDiffCountry) {
    const localYield = CROP_DATA[country]?.[crop]?.yield;
    const otherYield = CROP_DATA[sameCropDiffCountry.country]?.[crop]?.yield;
    let reason = `${crop} in ${sameCropDiffCountry.country}`;
    if (localYield && otherYield) {
      const localYrs = Object.keys(localYield).sort();
      const otherYrs = Object.keys(otherYield).sort();
      const localLast = localYield[localYrs[localYrs.length - 1]] || 0;
      const otherLast = otherYield[otherYrs[otherYrs.length - 1]] || 0;
      if (localLast > 0 && otherLast > 0) {
        const diff = Math.round(((otherLast - localLast) / localLast) * 100);
        reason = diff > 0
          ? `${diff}% higher yield than ${country}`
          : `${crop} benchmark — ${sameCropDiffCountry.country}`;
      }
    }
    enrichAndAdd(sameCropDiffCountry, reason);
  }

  // Type 3: Any high-scoring not yet used (discovery)
  for (const ins of deduped) {
    if (results.length >= 3) break;
    const key = `${ins.country}|${ins.crop}`;
    if (usedKeys.has(key)) continue;
    enrichAndAdd(ins, `High-scoring opportunity (${ins.type.replace('_', ' ')})`);
  }

  return results.slice(0, 3);
}
