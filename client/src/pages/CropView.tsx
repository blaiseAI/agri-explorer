import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useParams, Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { ChevronRight, TrendingUp, TrendingDown, Info, Search, ChevronDown, Download, ArrowUpDown, Filter } from "lucide-react";
import { downloadCSV } from "@/lib/export";
import UpgradePrompt from "@/components/UpgradePrompt";
import { useToast } from "@/hooks/use-toast";
import { useMonetization } from "@/hooks/useMonetization";

const PRODUCTION_BAR_COLOR = "hsl(152, 55%, 28%)";
const YIELD_ABOVE_AVG = "hsl(152, 55%, 28%)";
const YIELD_BELOW_AVG = "hsl(25, 65%, 42%)";

/* Custom Y-axis tick that truncates long names */
function TruncatedTick({ x, y, payload }: any) {
  const name = payload.value || "";
  const display = name.length > 16 ? name.slice(0, 14) + "…" : name;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">
      {display}
    </text>
  );
}

/* Custom tooltip for production chart */
function ProductionTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      <p className="text-muted-foreground">
        Production: <span className="font-semibold text-foreground tabular-nums">{Number(entry.value).toLocaleString()}K tonnes</span>
      </p>
    </div>
  );
}

/* Custom tooltip for yield chart — distinguishes Africa Average */
function YieldTooltip({ active, payload, label, globalAvg }: any) {
  if (!active || !payload?.length) return null;
  const yieldEntry = payload.find((p: any) => p.dataKey === "yield");
  return (
    <div className="rounded-lg border bg-card px-3 py-2 shadow-lg text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {yieldEntry && (
        <p className="text-muted-foreground">
          Yield: <span className="font-semibold text-foreground tabular-nums">{Number(yieldEntry.value).toLocaleString()} hg/ha</span>
        </p>
      )}
      {globalAvg && (
        <p className="text-muted-foreground/70 mt-0.5 flex items-center gap-1">
          <span className="inline-block w-3 border-t border-dashed border-muted-foreground"></span>
          Avg: <span className="tabular-nums">{globalAvg.toLocaleString()} hg/ha</span>
        </p>
      )}
    </div>
  );
}

const ALL_REGIONS = ["East Africa", "West Africa", "Central Africa", "North Africa", "Southern Africa"];

type SortField = "production" | "yield" | "area" | "yieldGap" | "trade" | "growth" | "revenue";

function getCropEmoji(crop: string): string {
  const map: Record<string, string> = {
    Maize: "🌽", Coffee: "☕", Rice: "🌾", Cassava: "🥔", Cocoa: "🍫",
    Beans: "🫘", Wheat: "🌾", Sorghum: "🌿", Millet: "🌿", Tea: "🍵",
    Cotton: "🏵", Sugarcane: "🎋", Banana: "🍌", Plantain: "🍌",
    Groundnut: "🥜", Soybean: "🫘", "Oil palm": "🌴", Tobacco: "🍂",
    Yam: "🍠", Potato: "🥔", Sesame: "🌰", Cashew: "🥜",
    Sisal: "🌿", Rubber: "🌳", Coconut: "🥥", Pineapple: "🍍",
    Mango: "🥭", Avocado: "🥑", Citrus: "🍊", Tomato: "🍅",
  };
  return map[crop] || "🌱";
}

function SortHeader({ field, label, sortField, sortAsc, onSort }: { field: SortField; label: string; sortField: SortField; sortAsc: boolean; onSort: (f: SortField) => void }) {
  const active = sortField === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
      data-testid={`sort-${field}`}
    >
      {label}
      <ArrowUpDown size={10} className={active ? "text-primary" : "opacity-40"} />
    </button>
  );
}

export default function CropView() {
  const params = useParams<{ crop: string }>();
  const crop = params.crop || "Maize";
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isMonetizationEnabled } = useMonetization();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("production");
  const [sortAsc, setSortAsc] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: overviewData } = useQuery<any>({
    queryKey: ["/api/overview"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const allCrops = useMemo(() => {
    if (!overviewData?.totalProduction) return [];
    return Object.entries(overviewData.totalProduction)
      .sort(([, a]: any, [, b]: any) => b - a)
      .map(([name]) => name);
  }, [overviewData?.totalProduction]);

  const filteredCropList = useMemo(() => {
    if (!searchQuery) return allCrops;
    return allCrops.filter((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [allCrops, searchQuery]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/crop", crop],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (regionRef.current && !regionRef.current.contains(e.target as Node)) {
        setRegionDropdownOpen(false);
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

  const globalAvgYield = data?.globalAvgYield;
  const countries = data?.countries || [];

  // Apply region filter
  const regionFiltered = useMemo(() => {
    if (regionFilter === "all") return countries;
    return countries.filter((c: any) => c.region === regionFilter);
  }, [countries, regionFilter]);

  // Available regions from data
  const availableRegions = useMemo(() => {
    const regions = new Set<string>();
    countries.forEach((c: any) => { if (c.region) regions.add(c.region); });
    return ALL_REGIONS.filter(r => regions.has(r));
  }, [countries]);

  // Compute yield gap for sorting
  const withYieldGap = useMemo(() => {
    return regionFiltered
      .filter((c: any) => c.latestProduction > 0 || c.latestYield > 0 || c.latestArea > 0)
      .map((c: any) => ({
      ...c,
      yieldGap: globalAvgYield && c.latestYield > 0
        ? ((globalAvgYield - c.latestYield) / globalAvgYield * 100)
        : 0,
    }));
  }, [regionFiltered, globalAvgYield]);

  // Sort logic
  const sortedCountries = useMemo(() => {
    const sorted = [...withYieldGap].sort((a: any, b: any) => {
      let aVal = 0, bVal = 0;
      switch (sortField) {
        case "production": aVal = a.latestProduction; bVal = b.latestProduction; break;
        case "yield": aVal = a.latestYield; bVal = b.latestYield; break;
        case "area": aVal = a.latestArea; bVal = b.latestArea; break;
        case "yieldGap": aVal = a.yieldGap; bVal = b.yieldGap; break;
        case "trade": aVal = a.tradeValue || 0; bVal = b.tradeValue || 0; break;
        case "growth": aVal = a.productionGrowth || 0; bVal = b.productionGrowth || 0; break;
        case "revenue": aVal = a.revenuePerHa || 0; bVal = b.revenuePerHa || 0; break;
      }
      return sortAsc ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [withYieldGap, sortField, sortAsc]);

  // Chart data
  const chartData = useMemo(() => {
    return sortedCountries.slice(0, 15).map((c: any) => ({
      name: c.country,
      production: c.latestProduction,
    }));
  }, [sortedCountries]);

  const yieldChartData = useMemo(() => {
    return [...regionFiltered]
      .sort((a: any, b: any) => b.latestYield - a.latestYield)
      .slice(0, 15)
      .map((c: any) => ({
        name: c.country,
        yield: c.latestYield,
        globalAvg: globalAvgYield,
      }));
  }, [regionFiltered, globalAvgYield]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
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
    const exportData = sortedCountries.map((c: any) => ({
      Country: c.country,
      Region: c.region,
      Production_tonnes: c.latestProduction,
      Yield_hgha: c.latestYield,
      Area_ha: c.latestArea,
      ExportValue_M: c.tradeValue || 0,
      YieldGap_pct: c.yieldGap || 0
    }));
    downloadCSV(exportData, `${crop}_global_comparison`);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Crop search selector + controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => { setSearchOpen((v) => !v); setSearchQuery(""); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card text-sm hover:border-primary/30 transition-colors w-full max-w-xs"
            data-testid="crop-selector"
          >
            <Search size={14} className="text-muted-foreground" />
            <span className="flex-1 text-left truncate">
              {getCropEmoji(crop)} {crop}
            </span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>

          {searchOpen && (
            <div className="absolute top-full left-0 mt-1 w-full max-w-xs bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
              <div className="p-2 border-b">
                <Input
                  ref={inputRef}
                  placeholder="Search crops..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-crop-search"
                />
              </div>
              <div className="max-h-64 overflow-y-auto">
                {filteredCropList.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setLocation(`/crop/${c}`);
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className={`flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors ${
                      c === crop ? "bg-primary/10 text-primary font-medium" : ""
                    }`}
                    data-testid={`tab-crop-${c.toLowerCase()}`}
                  >
                    <span>{getCropEmoji(c)}</span>
                    <span className="truncate">{c}</span>
                  </button>
                ))}
                {filteredCropList.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">No crops found</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Region filter */}
        <div className="relative" ref={regionRef}>
          <button
            onClick={() => setRegionDropdownOpen(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
              regionFilter !== "all" ? "border-primary/40 bg-primary/5 text-primary" : "bg-card hover:border-primary/30"
            }`}
            data-testid="region-filter"
          >
            <Filter size={13} />
            <span>{regionFilter === "all" ? "All regions" : regionFilter}</span>
            <ChevronDown size={12} />
          </button>
          {regionDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
              <button
                onClick={() => { setRegionFilter("all"); setRegionDropdownOpen(false); }}
                className={`w-full px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors ${regionFilter === "all" ? "bg-primary/10 text-primary font-medium" : ""}`}
              >
                All regions
              </button>
              {availableRegions.map(r => (
                <button
                  key={r}
                  onClick={() => { setRegionFilter(r); setRegionDropdownOpen(false); }}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-muted/60 transition-colors ${regionFilter === r ? "bg-primary/10 text-primary font-medium" : ""}`}
                >
                  {r}
                </button>
              ))}
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
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" data-testid="text-crop-name">
          <span className="text-2xl">{getCropEmoji(crop)}</span>
          {crop}
        </h1>
        <p className="text-sm text-muted-foreground">
          Comparing {crop} across {sortedCountries.length} countries
          {regionFilter !== "all" && ` in ${regionFilter}`}
          {globalAvgYield && ` \u2014 Africa average yield: ${globalAvgYield.toLocaleString()} hg/ha`}
        </p>
      </div>

      {/* Production comparison chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Production by Country (top {chartData.length}, thousands tonnes)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64" style={{ height: Math.max(256, chartData.length * 28) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" tick={<TruncatedTick />} stroke="hsl(var(--muted-foreground))" width={110} />
                <Tooltip content={<ProductionTooltip />} cursor={false} />
                <Bar dataKey="production" fill={PRODUCTION_BAR_COLOR} radius={[0, 4, 4, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Yield comparison chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Yield Comparison (top {yieldChartData.length}, hg/ha)
            {globalAvgYield && (
              <span className="ml-2 font-normal text-muted-foreground">
                — dashed line = Africa average ({globalAvgYield.toLocaleString()})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64" style={{ height: Math.max(256, yieldChartData.length * 28) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yieldChartData} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" tick={<TruncatedTick />} stroke="hsl(var(--muted-foreground))" width={110} />
                <Tooltip content={<YieldTooltip globalAvg={globalAvgYield} />} cursor={false} />
                {globalAvgYield && (
                  <ReferenceLine x={globalAvgYield} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                )}
                <Bar dataKey="yield" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {yieldChartData.map((entry: any, index: number) => (
                    <Cell
                      key={index}
                      fill={entry.yield < (globalAvgYield || 0) ? YIELD_BELOW_AVG : YIELD_ABOVE_AVG}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {globalAvgYield && (
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
              <div className="w-5 h-0 border-t-2 border-dashed border-muted-foreground"></div>
              <span>Africa average: {globalAvgYield.toLocaleString()} hg/ha</span>
              <span className="mx-1">|</span>
              <div className="w-3 h-3 rounded-sm" style={{ background: "hsl(152, 55%, 28%)" }}></div>
              <span>Above average</span>
              <div className="w-3 h-3 rounded-sm" style={{ background: "hsl(25, 65%, 42%)" }}></div>
              <span>Below average</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Country detail table with sorting */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Country Details ({sortedCountries.length} countries with data)</h2>
        
        {/* Sort controls */}
        <div className="flex flex-wrap items-center gap-4 px-1">
          <span className="text-xs text-muted-foreground">Sort by:</span>
          <SortHeader field="production" label="Production" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
          <SortHeader field="yield" label="Yield" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
          <SortHeader field="area" label="Area" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
          <SortHeader field="yieldGap" label="Yield Gap" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
          <SortHeader field="trade" label="Exports" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
          <SortHeader field="growth" label="Growth" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
          <SortHeader field="revenue" label="Revenue/Ha" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedCountries.slice(0, isMonetizationEnabled ? 5 : sortedCountries.length).map((c: any) => (
            <Link key={c.country} href={`/explore/${c.country}/${crop}`}>
              <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full" data-testid={`card-country-${c.country.toLowerCase()}`}>
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{c.country}</p>
                      {c.region && (
                        <span className="text-[10px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{c.region}</span>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Production</p>
                      <p className="font-medium tabular-nums">{c.latestProduction.toLocaleString()}K t</p>
                      <GrowthIndicator value={c.productionGrowth} />
                    </div>
                    <div>
                      <p className="text-muted-foreground">Yield</p>
                      <p className="font-medium tabular-nums">{c.latestYield.toLocaleString()}</p>
                      {c.yieldGap > 10 && (
                        <span className="text-[10px] text-amber-600 dark:text-amber-400">-{c.yieldGap.toFixed(0)}% gap</span>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Area</p>
                      <p className="font-medium tabular-nums">{c.latestArea.toLocaleString()}K ha</p>
                    </div>
                  </div>
                  {c.tradeValue ? (
                    <div className="flex items-center gap-1.5 text-xs bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 rounded px-2 py-1">
                      <span className="font-medium">Export: ${c.tradeValue}M</span>
                      {c.exportOrientation && (
                        <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          c.exportOrientation === 'Export-oriented'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                            : c.exportOrientation === 'Mixed market'
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>{c.exportOrientation}</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted-foreground/60 px-2">No export data available</div>
                  )}
                  {c.revenuePerHa > 0 && (
                    <div className="flex items-center gap-1.5 text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded px-2 py-1">
                      <span>~${c.revenuePerHa.toLocaleString()}/ha revenue</span>
                    </div>
                  )}
                  {c.productionGrowth < -20 && (
                    <div className="flex items-center gap-1.5 text-xs bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded px-2 py-1">
                      <span>⚠ Sharp decline ({c.productionGrowth.toFixed(0)}%). Verify with local sources.</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
          {isMonetizationEnabled && sortedCountries.length > 5 && (
            <UpgradePrompt feature={`All ${sortedCountries.length} Countries`} description={`See the full ${crop} comparison across all producers.`}>
              <Card className="h-full">
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{sortedCountries[5]?.country || "More countries"}</p>
                    <ChevronRight size={14} className="text-muted-foreground" />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Production</p>
                      <p className="font-medium tabular-nums">—</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Yield</p>
                      <p className="font-medium tabular-nums">—</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Area</p>
                      <p className="font-medium tabular-nums">—</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </UpgradePrompt>
          )}
        </div>
      </div>
    </div>
  );
}

function GrowthIndicator({ value }: { value: number }) {
  if (!value) return null;
  const isPositive = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${
      isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
    }`}>
      {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
      {isPositive ? "+" : ""}{value}%
    </span>
  );
}
