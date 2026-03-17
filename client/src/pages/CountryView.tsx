import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { TrendingUp, TrendingDown, ArrowRight, ChevronRight, Globe, Users, Briefcase, Sprout, Info, Search, ChevronDown, Download, Ship, ArrowUpDown } from "lucide-react";
import { downloadCSV } from "@/lib/export";
import UpgradePrompt from "@/components/UpgradePrompt";
import { useToast } from "@/hooks/use-toast";
import { useMonetization } from "@/hooks/useMonetization";

const FLAG_MAP: Record<string, string> = {
  UGA: "🇺🇬", KEN: "🇰🇪", RWA: "🇷🇼", NGA: "🇳🇬", GHA: "🇬🇭", TZA: "🇹🇿",
  ETH: "🇪🇹", ZAF: "🇿🇦", EGY: "🇪🇬", MAR: "🇲🇦", DZA: "🇩🇿", TUN: "🇹🇳",
  LBY: "🇱🇾", SDN: "🇸🇩", SSD: "🇸🇸", CMR: "🇨🇲", CIV: "🇨🇮", SEN: "🇸🇳",
  MLI: "🇲🇱", BFA: "🇧🇫", NER: "🇳🇪", TCD: "🇹🇩", GIN: "🇬🇳", BEN: "🇧🇯",
  TGO: "🇹🇬", SLE: "🇸🇱", LBR: "🇱🇷", MRT: "🇲🇷", GMB: "🇬🇲", GNB: "🇬🇼",
  CPV: "🇨🇻", AGO: "🇦🇴", COD: "🇨🇩", COG: "🇨🇬", GAB: "🇬🇦", GNQ: "🇬🇶",
  CAF: "🇨🇫", STP: "🇸🇹", MDG: "🇲🇬", MOZ: "🇲🇿", ZMB: "🇿🇲", ZWE: "🇿🇼",
  MWI: "🇲🇼", BWA: "🇧🇼", NAM: "🇳🇦", SWZ: "🇸🇿", LSO: "🇱🇸", MUS: "🇲🇺",
  SYC: "🇸🇨", COM: "🇰🇲", DJI: "🇩🇯", ERI: "🇪🇷", SOM: "🇸🇴", BDI: "🇧🇮",
};

function getLatestTradeYear(tradeData: Record<string, any> | undefined): string | null {
  if (!tradeData) return null;
  const keys = Object.keys(tradeData).sort();
  return keys.length > 0 ? keys[keys.length - 1] : null;
}

function getLatestValue(obj: Record<string, number> | undefined): number | null {
  if (!obj) return null;
  const keys = Object.keys(obj).sort();
  if (keys.length === 0) return null;
  return obj[keys[keys.length - 1]];
}

function formatNumber(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}M`;
  return `${n.toLocaleString()}K`;
}

export default function CountryView() {
  const params = useParams<{ country: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isMonetizationEnabled } = useMonetization();

  // Fetch countries list to find default (top producer)
  const { data: countriesData } = useQuery<any[]>({
    queryKey: ["/api/countries"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: overviewData } = useQuery<any>({
    queryKey: ["/api/overview"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Fix 4: Smart default — route to top producer if no country specified
  const topProducer = useMemo(() => {
    if (!countriesData || !overviewData?.countryProduction) return null;
    const sorted = [...countriesData].sort((a, b) => {
      const aProd = overviewData.countryProduction[a.name] || 0;
      const bProd = overviewData.countryProduction[b.name] || 0;
      return bProd - aProd;
    });
    return sorted[0]?.name || null;
  }, [countriesData, overviewData?.countryProduction]);

  const country = params.country || topProducer || "Nigeria";

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cropSort, setCropSort] = useState<"production" | "revenue" | "yield" | "growth">("production");
  const [cropFilter, setCropFilter] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch metadata for year range
  const { data: metaData } = useQuery<any>({
    queryKey: ["/api/metadata"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const allYears = useMemo(() => metaData?.years || [], [metaData?.years]);
  const minYearIdx = 0;
  const maxYearIdx = allYears.length - 1;
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);

  // Initialize year range once years are loaded
  useEffect(() => {
    if (allYears.length > 0 && yearRange === null) {
      setYearRange([minYearIdx, maxYearIdx]);
    }
  }, [allYears.length]);

  const startIdx = yearRange?.[0] ?? minYearIdx;
  const endIdx = yearRange?.[1] ?? maxYearIdx;
  const startYear = allYears[startIdx] || "2010";
  const endYear = allYears[endIdx] || "2024";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/country", country],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const filteredCountries = useMemo(() => {
    if (!countriesData) return [];
    if (!searchQuery) return countriesData;
    return countriesData.filter(
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [countriesData, searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (searchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [searchOpen]);

  const currentCountryInfo = countriesData?.find((c) => c.name === country);
  const currentFlag = currentCountryInfo ? FLAG_MAP[currentCountryInfo.code] || "" : "";

  const crops = data?.crops || [];
  const worldBank = data?.worldBank || {};
  const countryInfo = data?.countryInfo;
  const topImports = data?.topImports || [];
  const wb = worldBank;
  const latestPop = getLatestValue(wb.population);
  const latestAgGdp = getLatestValue(wb.agGdpPct);
  const latestRural = getLatestValue(wb.ruralPct);
  const latestAgEmp = getLatestValue(wb.agEmployPct);

  // Build Ag GDP over time chart - filtered by year range
  const agGdpTimeSeries = useMemo(() => {
    if (!wb.agGdpPct) return [];
    return Object.entries(wb.agGdpPct)
      .filter(([year]) => year >= startYear && year <= endYear)
      .map(([year, value]) => ({ year, value }));
  }, [wb.agGdpPct, startYear, endYear]);

  // Extract trade data for the trade section
  const cropsWithTrade = useMemo(() => {
    if (!crops.length) return [];
    return crops
      .filter((c: any) => c.tradeData && Object.keys(c.tradeData).length > 0)
      .map((c: any) => {
        const keys = Object.keys(c.tradeData).sort();
        const tradeYear = keys.length > 0 ? keys[keys.length - 1] : null;
        return {
          name: c.name,
          tradeValue: tradeYear ? c.tradeData[tradeYear] : 0,
          tradeYear,
          latestProduction: c.latestProduction,
        };
      })
      .filter((c: any) => c.tradeValue > 0)
      .sort((a: any, b: any) => b.tradeValue - a.tradeValue);
  }, [crops]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }

  function handleExport() {
    if (isMonetizationEnabled) {
      toast({
        title: "Pro Feature",
        description: "CSV export is available on Pro. Upgrade to unlock.",
      });
      return;
    }
    
    // Allow free export when monetization is disabled
    const exportData = crops.map((c: any) => ({
      Crop: c.name,
      Production_tonnes: c.latestProduction,
      Yield_hgha: c.latestYield,
      Area_ha: c.latestArea,
      ProductionGrowth_pct: c.productionGrowth || 0,
      YieldGrowth_pct: c.yieldGrowth || 0
    }));
    downloadCSV(exportData, `${country}_agricultural_data`);
  }

  return (
    <div className="space-y-6">
      {/* Country search selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => { setSearchOpen((v) => !v); setSearchQuery(""); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card text-sm hover:border-primary/30 transition-colors min-w-[200px]"
            data-testid="country-selector"
          >
            <Search size={14} className="text-muted-foreground" />
            <span className="flex-1 text-left truncate">
              {currentFlag} {country}
            </span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>

          {searchOpen && (
            <div className="absolute top-full left-0 mt-1 w-80 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="p-2 border-b">
                <Input
                  ref={inputRef}
                  placeholder="Search countries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-country-search"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredCountries.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => {
                      setLocation(`/country/${c.name}`);
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors ${
                      c.name === country ? "bg-primary/10 text-primary font-medium" : ""
                    }`}
                    data-testid={`tab-country-${c.name.toLowerCase()}`}
                  >
                    <span>{FLAG_MAP[c.code] || ""}</span>
                    <span className="truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{c.region}</span>
                  </button>
                ))}
                {filteredCountries.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">No countries found</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Export */}
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card text-sm hover:border-primary/30 transition-colors ml-auto"
          data-testid="export-csv"
        >
          <Download size={13} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" data-testid="text-country-name">
          <span className="text-2xl">{currentFlag}</span>
          {country}
        </h1>
        <p className="text-sm text-muted-foreground">{countryInfo?.region} — Agricultural overview</p>
      </div>

      {/* Country KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniKPI icon={Users} label="Population" value={latestPop ? `${(latestPop / 1000).toFixed(1)}M` : "\u2014"} />
        <MiniKPI icon={Sprout} label="Ag % of GDP" value={latestAgGdp ? `${latestAgGdp}%` : "\u2014"} />
        <MiniKPI icon={Globe} label="Rural Population" value={latestRural ? `${latestRural.toFixed(0)}%` : "\u2014"} />
        <MiniKPI icon={Briefcase} label="Ag Employment" value={latestAgEmp ? `${latestAgEmp}%` : "\u2014"} />
      </div>

      {/* Year range slider */}
      {allYears.length > 1 && yearRange !== null && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground">Time Range</p>
              <p className="text-xs font-medium tabular-nums">{startYear} — {endYear}</p>
            </div>
            <Slider
              min={minYearIdx}
              max={maxYearIdx}
              step={1}
              value={yearRange}
              onValueChange={(val) => setYearRange(val as [number, number])}
              className="w-full"
              data-testid="year-range-slider"
            />
            <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
              <span>{allYears[0]}</span>
              <span>{allYears[allYears.length - 1]}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ag GDP trend */}
      {agGdpTimeSeries.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Agriculture Share of GDP Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={agGdpTimeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={['auto', 'auto']} unit="%" />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                    formatter={(val: any) => [`${val}%`, "Ag % of GDP"]}
                  />
                  <Line type="monotone" dataKey="value" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Investment Climate */}
      {(wb.politicalStability || wb.logisticsIndex || wb.irrigatedLand || wb.agValueGrowth) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Investment Climate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              {wb.politicalStability != null && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Political Stability</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{Math.round(wb.politicalStability)}th pctl</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      wb.politicalStability >= 60 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : wb.politicalStability >= 30 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>{wb.politicalStability >= 60 ? 'LOW RISK' : wb.politicalStability >= 30 ? 'MEDIUM' : 'HIGH RISK'}</span>
                  </div>
                </div>
              )}
              {wb.ruleOfLaw != null && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Rule of Law</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{Math.round(wb.ruleOfLaw)}th pctl</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      wb.ruleOfLaw >= 60 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : wb.ruleOfLaw >= 30 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>{wb.ruleOfLaw >= 60 ? 'LOW RISK' : wb.ruleOfLaw >= 30 ? 'MEDIUM' : 'HIGH RISK'}</span>
                  </div>
                </div>
              )}
              {wb.logisticsIndex != null && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Logistics Score</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{wb.logisticsIndex.toFixed(1)} / 5.0</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      wb.logisticsIndex >= 3.0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : wb.logisticsIndex >= 2.0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>{wb.logisticsIndex >= 3.0 ? 'GOOD' : wb.logisticsIndex >= 2.0 ? 'MEDIUM' : 'POOR'}</span>
                  </div>
                </div>
              )}
              {wb.irrigatedLand != null && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Irrigated Land</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{wb.irrigatedLand.toFixed(1)}%</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      wb.irrigatedLand >= 20 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : wb.irrigatedLand >= 5 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>{wb.irrigatedLand >= 20 ? 'Irrigated' : wb.irrigatedLand >= 5 ? 'Partial' : 'Rain-dependent'}</span>
                  </div>
                </div>
              )}
              {wb.agValueGrowth != null && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">Ag Sector Growth</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{wb.agValueGrowth > 0 ? '+' : ''}{wb.agValueGrowth.toFixed(1)}%</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      wb.agValueGrowth >= 3 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : wb.agValueGrowth >= 0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>{wb.agValueGrowth >= 3 ? 'GROWING' : wb.agValueGrowth >= 0 ? 'STABLE' : 'DECLINING'}</span>
                  </div>
                </div>
              )}
              {wb.fdiInflows != null && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground">FDI Inflows (% GDP)</span>
                  <span className="font-medium tabular-nums">{wb.fdiInflows.toFixed(1)}%</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">Source: World Bank Governance & Development Indicators</p>
          </CardContent>
        </Card>
      )}

      {/* Trade data section — Pro only */}
      {cropsWithTrade.length > 0 && (
        <UpgradePrompt feature="Export Trade Data" description="Full trade analytics with export values available on Pro.">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Ship size={14} className="text-violet-600 dark:text-violet-400" />
                Export Trade (top exported crops)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-56" style={{ height: Math.max(200, Math.min(cropsWithTrade.length, 10) * 28) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={cropsWithTrade.slice(0, 10).map((c: any) => ({
                      name: c.name,
                      value: c.tradeValue,
                    }))}
                    layout="vertical"
                    margin={{ left: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={90} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                      formatter={(val: any) => [`$${Number(val).toLocaleString()}M`, "Export Value"]}
                    />
                    <Bar dataKey="value" fill="hsl(270, 45%, 50%)" radius={[0, 4, 4, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Source: FAOSTAT Trade ({cropsWithTrade[0]?.tradeYear || "latest available"})
              </p>
            </CardContent>
          </Card>
        </UpgradePrompt>
      )}

      {/* Import trade data section */}
      {topImports.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Ship size={14} className="text-amber-600 dark:text-amber-400" />
              Import Trade (top imported crops)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56" style={{ height: Math.max(200, Math.min(topImports.length, 10) * 32) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topImports.slice(0, 10).map((i: any) => ({
                    name: i.crop.length > 18 ? i.crop.slice(0, 16) + '…' : i.crop,
                    fullName: i.crop,
                    value: i.value,
                  }))}
                  layout="vertical"
                  margin={{ left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={120} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                    formatter={(val: any) => [`$${Number(val).toLocaleString()}M`, "Import Value"]}
                    labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Bar dataKey="value" fill="hsl(35, 80%, 50%)" radius={[0, 4, 4, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              Source: FAOSTAT Trade ({topImports[0]?.year || "latest available"})
            </p>
          </CardContent>
        </Card>
      )}

      {/* Crop cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-medium">Crop Performance</h2>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Input
              placeholder="Search crops…"
              value={cropFilter}
              onChange={e => setCropFilter(e.target.value)}
              className="h-7 w-36 text-xs"
            />
            {(["production", "revenue", "yield", "growth"] as const).map(s => (
              <Button
                key={s}
                variant={cropSort === s ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setCropSort(s)}
              >
                {s === "production" ? "Production" : s === "revenue" ? "Revenue" : s === "yield" ? "Yield" : "Growth"}
              </Button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {crops?.filter((c: any) => c.latestProduction > 0 && (!cropFilter || c.name.toLowerCase().includes(cropFilter.toLowerCase())))
            .sort((a: any, b: any) => {
              switch (cropSort) {
                case "revenue": return (b.revenuePerHa || 0) - (a.revenuePerHa || 0);
                case "yield": return (b.latestYield || 0) - (a.latestYield || 0);
                case "growth": return (b.productionGrowth || 0) - (a.productionGrowth || 0);
                default: return (b.latestProduction || 0) - (a.latestProduction || 0);
              }
            })
            .map((crop: any) => {
            const yieldGap = crop.globalAvgYield
              ? ((crop.globalAvgYield - crop.latestYield) / crop.globalAvgYield * 100)
              : null;
            const tradeYear = getLatestTradeYear(crop.tradeData);
            return (
              <Link key={crop.name} href={`/explore/${country}/${crop.name}`}>
                <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full" data-testid={`card-crop-${crop.name.toLowerCase()}`}>
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{crop.name}</p>
                      <ChevronRight size={14} className="text-muted-foreground" />
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Production</p>
                        <p className="font-medium tabular-nums">{formatNumber(crop.latestProduction)} t</p>
                        <GrowthBadge value={crop.productionGrowth} />
                      </div>
                      <div>
                        <p className="text-muted-foreground">Yield</p>
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium tabular-nums">{crop.latestYield.toLocaleString()} hg/ha</p>
                          {yieldGap !== null && yieldGap > 10 && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">↓{yieldGap.toFixed(0)}%</span>
                          )}
                        </div>
                        <GrowthBadge value={crop.yieldGrowth} />
                      </div>
                    </div>

                    {crop.tradeData && tradeYear && crop.tradeData[tradeYear] > 0 && (
                      <div className="flex items-center gap-1.5 text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 rounded px-2 py-1">
                        <Ship size={11} />
                        <span>Exports: ${crop.tradeData[tradeYear]}M ({tradeYear})</span>
                        {crop.exportOrientation && (
                          <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                            crop.exportOrientation === 'Export-oriented'
                              ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                              : crop.exportOrientation === 'Mixed market'
                              ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                          }`}>{crop.exportOrientation}</span>
                        )}
                      </div>
                    )}

                    {crop.revenuePerHa && (
                      <div className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded px-2 py-1">
                        <span>~${crop.revenuePerHa.toLocaleString()}/ha{crop.pricePerTonne ? ` (FAOSTAT ${crop.priceYear}: $${crop.pricePerTonne}/t)` : ''}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MiniKPI({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Icon size={13} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function GrowthBadge({ value }: { value: number }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium mt-0.5 ${
      isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
    }`}>
      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isPositive ? "+" : ""}{value}%
    </span>
  );
}
