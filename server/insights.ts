import { getCropData, getTradeData, getWorldBankData, getGlobalAvgYields, getCountries, getCrops } from "./data";

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
      const wb = WORLD_BANK_DATA[c];
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
  const all = generateInsights();
  if (all.length <= limit) return all;

  const COUNTRIES = getCountries();
  const regionMap: Record<string, string> = {};
  for (const c of COUNTRIES) {
    regionMap[c.name] = c.region;
  }

  // Collect all regions present in insights
  const allRegions = new Set<string>();
  for (const ins of all) {
    const r = ins.region || regionMap[ins.country] || "";
    if (r) allRegions.add(r);
  }

  const selected: Insight[] = [];
  const usedIds = new Set<string>();
  const countryCount: Record<string, number> = {};
  const regionCovered = new Set<string>();
  const typeCovered = new Set<string>();

  function addInsight(ins: Insight): boolean {
    if (usedIds.has(ins.id)) return false;
    selected.push(ins);
    usedIds.add(ins.id);
    countryCount[ins.country] = (countryCount[ins.country] || 0) + 1;
    const r = ins.region || regionMap[ins.country] || "";
    if (r) regionCovered.add(r);
    typeCovered.add(ins.type);
    return true;
  }

  // Pass 1: Pick the top signal from each region (ensures geographic spread)
  for (const region of allRegions) {
    if (selected.length >= limit) break;
    const regionInsights = all.filter(ins => (ins.region || regionMap[ins.country]) === region);
    if (regionInsights.length > 0) {
      addInsight(regionInsights[0]);
    }
  }

  // Pass 2: Fill remaining slots from uncovered insight types
  if (selected.length < limit) {
    const uncoveredTypes = all.filter(ins => !typeCovered.has(ins.type) && !usedIds.has(ins.id));
    for (const ins of uncoveredTypes) {
      if (selected.length >= limit) break;
      if ((countryCount[ins.country] || 0) >= 2) continue;
      addInsight(ins);
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

  // Re-sort selected by score
  selected.sort((a, b) => b.score - a.score);

  // Reassign stable IDs
  return selected.map((ins, i) => ({ ...ins, id: `overview-insight-${i + 1}` }));
}
