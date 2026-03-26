import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  TrendingUp,
  TrendingDown,
  Target,
  ArrowUpRight,
  Globe,
  Wheat,
  BarChart3,
  Lightbulb,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  RefreshCw,
  Database,
  ExternalLink,
  Search,
  Sparkles,
  Info,
  Download,
  ArrowUpDown,
  Shield,
  Truck,
  Trophy,
} from "lucide-react";
import UpgradePrompt from "@/components/UpgradePrompt";
import { useMonetization } from "@/hooks/useMonetization";
import { downloadCSV } from "@/lib/export";
import NewsFeed from "@/components/NewsFeed";

const INSIGHT_ICONS: Record<string, any> = {
  opportunity: Target,
  growth: TrendingUp,
  yield_gap: BarChart3,
  trade: ArrowUpRight,
  warning: Lightbulb,
};

const INSIGHT_COLORS: Record<string, string> = {
  opportunity: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  growth: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  yield_gap: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  trade: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  warning: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

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

const REGION_ORDER = ["East Africa", "West Africa", "Central Africa", "North Africa", "Southern Africa"];

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}M`;
  return `${n.toLocaleString()}K`;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return "just now";
  } catch {
    return "";
  }
}

export default function Dashboard() {
  const { isMonetizationEnabled } = useMonetization();
  const [countrySearch, setCountrySearch] = useState("");
  const [cropSearch, setCropSearch] = useState("");
  const [showAllCountries, setShowAllCountries] = useState(false);
  const [showAllCrops, setShowAllCrops] = useState(false);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/overview"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: countriesData } = useQuery<any[]>({
    queryKey: ["/api/countries"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Sort countries by total production descending
  const sortedCountries = useMemo(() => {
    if (!countriesData || !data?.countryProduction) return [];
    return [...countriesData].sort((a, b) => {
      const aProd = data.countryProduction[a.name] || 0;
      const bProd = data.countryProduction[b.name] || 0;
      return bProd - aProd;
    });
  }, [countriesData, data?.countryProduction]);

  // Group countries by region
  const countriesByRegion = useMemo(() => {
    const filtered = countrySearch
      ? sortedCountries.filter((c) =>
          c.name.toLowerCase().includes(countrySearch.toLowerCase()) ||
          c.code.toLowerCase().includes(countrySearch.toLowerCase())
        )
      : showAllCountries
        ? sortedCountries
        : sortedCountries.slice(0, 8);

    const grouped: Record<string, typeof sortedCountries> = {};
    for (const c of filtered) {
      const region = c.region || "Other";
      if (!grouped[region]) grouped[region] = [];
      grouped[region].push(c);
    }
    return grouped;
  }, [sortedCountries, countrySearch, showAllCountries]);

  // Get all crop names from totalProduction, sorted by production
  const sortedCrops = useMemo(() => {
    if (!data?.totalProduction) return [];
    return Object.entries(data.totalProduction)
      .sort(([, a]: any, [, b]: any) => b - a)
      .map(([name]) => name);
  }, [data?.totalProduction]);

  const filteredCrops = useMemo(() => {
    if (cropSearch) {
      return sortedCrops.filter((c) => c.toLowerCase().includes(cropSearch.toLowerCase()));
    }
    return showAllCrops ? sortedCrops : sortedCrops.slice(0, 12);
  }, [sortedCrops, cropSearch, showAllCrops]);

  // Top 4 crops by production for KPI cards
  const topKpiCrops = useMemo(() => sortedCrops.slice(0, 4), [sortedCrops]);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-24 max-w-2xl rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-48 mb-2" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[400px] rounded-xl" />)}
        </div>
        <div className="space-y-4">
          <Skeleton className="h-5 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const { totalProduction, countryProduction, topInsights, cropGrowth, countriesCount, cropsCount, yearsRange, lastUpdated, sources, latestYear } = data || {};

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-page-title">
          Agricultural Investment Explorer
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Discover agricultural opportunities across {countriesCount} African countries.
          Explore production trends, yield gaps, and trade signals for {cropsCount} major crops
          spanning {yearsRange}.
        </p>
      </div>

      {/* Data freshness indicator */}
      {lastUpdated && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="data-freshness">
          <RefreshCw size={12} />
          <span>Data last updated: {formatDate(lastUpdated)}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>Latest year: {latestYear}</span>
        </div>
      )}

      {/* KPI Row */}
      <div className="space-y-2">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top African Crops by Volume</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {topKpiCrops.map((crop) => (
          <Link key={crop} href={`/crop/${crop}`}>
            <KPICard
              label={`Total ${crop} Production`}
              value={totalProduction?.[crop] ? formatNumber(totalProduction[crop]) : "\u2014"}
              subtext={`tonnes (${latestYear || "latest"})`}
              cagr={cropGrowth?.[crop]}
              clickable
            />
          </Link>
        ))}
        </div>
      </div>

      {/* Pro upgrade banner */}
      {isMonetizationEnabled && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
          <Sparkles size={16} className="text-primary shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">
            Unlock <span className="font-medium text-foreground">investment signals</span>,{" "}
            <span className="font-medium text-foreground">trade analytics</span>, and{" "}
            <span className="font-medium text-foreground">CSV export</span> with Pro.
          </p>
          <Link href="/pricing">
            <button className="text-xs font-medium text-primary hover:underline whitespace-nowrap">See Pricing →</button>
          </Link>
        </div>
      )}

      {/* Three column: Countries + Crops + News */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Countries */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Globe size={15} className="text-primary" />
              Explore by Country
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search countries..."
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                className="pl-9 h-8 text-sm"
                data-testid="input-country-search"
                aria-label="Search African countries"
              />
            </div>
            <div className="space-y-3">
              {REGION_ORDER.filter((r) => countriesByRegion[r]?.length).map((region) => (
                <div key={region}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">{region}</p>
                  <div className="space-y-0.5">
                    {countriesByRegion[region].map((c) => (
                      <Link key={c.name} href={`/country/${c.name}`}>
                        <div
                          className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer group"
                          data-testid={`link-country-${c.code}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{FLAG_MAP[c.code] || ""}</span>
                            <div>
                              <p className="text-sm font-medium">{c.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {countryProduction?.[c.name]
                                  ? `${formatNumber(countryProduction[c.name])} tonnes total`
                                  : "\u2014"}
                              </p>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
              {/* Also show any regions not in REGION_ORDER */}
              {Object.keys(countriesByRegion)
                .filter((r) => !REGION_ORDER.includes(r))
                .map((region) => (
                  <div key={region}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1 px-1">{region}</p>
                    <div className="space-y-0.5">
                      {countriesByRegion[region].map((c) => (
                        <Link key={c.name} href={`/country/${c.name}`}>
                          <div
                            className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer group"
                            data-testid={`link-country-${c.code}`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-lg">{FLAG_MAP[c.code] || ""}</span>
                              <div>
                                <p className="text-sm font-medium">{c.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {countryProduction?.[c.name]
                                    ? `${formatNumber(countryProduction[c.name])} tonnes total`
                                    : "\u2014"}
                                </p>
                              </div>
                            </div>
                            <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
            {!countrySearch && sortedCountries.length > 8 && (
              <button
                onClick={() => setShowAllCountries((v) => !v)}
                className="flex items-center gap-1 text-xs text-primary font-medium px-1 hover:underline"
                data-testid="toggle-show-all-countries"
              >
                {showAllCountries ? (
                  <>Show top 8 <ChevronUp size={12} /></>
                ) : (
                  <>Show all {sortedCountries.length} countries <ChevronDown size={12} /></>
                )}
              </button>
            )}
          </CardContent>
        </Card>

        {/* Crops */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Wheat size={15} className="text-primary" />
              Explore by Crop
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search crops..."
                value={cropSearch}
                onChange={(e) => setCropSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
                data-testid="input-crop-search"
                aria-label="Search agricultural crops"
              />
            </div>
            <div className="space-y-0.5">
              {filteredCrops.map((crop) => (
                <Link key={crop} href={`/crop/${crop}`}>
                  <div
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer group"
                    data-testid={`link-crop-${crop.toLowerCase()}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg w-6 text-center">{getCropEmoji(crop)}</span>
                      <div>
                        <p className="text-sm font-medium">{crop}</p>
                        <p className="text-xs text-muted-foreground">
                          {totalProduction?.[crop]
                            ? `${formatNumber(totalProduction[crop])} tonnes across ${countriesCount} countries`
                            : "\u2014"}
                        </p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
            {!cropSearch && sortedCrops.length > 12 && (
              <button
                onClick={() => setShowAllCrops((v) => !v)}
                className="flex items-center gap-1 text-xs text-primary font-medium px-1 hover:underline"
                data-testid="toggle-show-all-crops"
              >
                {showAllCrops ? (
                  <>Show top 12 <ChevronUp size={12} /></>
                ) : (
                  <>Show all {sortedCrops.length} crops <ChevronDown size={12} /></>
                )}
              </button>
            )}
          </CardContent>
        </Card>

        {/* Global News Feed */}
        <div className="lg:col-span-1">
          <NewsFeed query="Africa agriculture investment" limit={6} country="Africa" />
        </div>
      </div>

      {/* Top Insights */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Lightbulb size={15} className="text-primary" />
            Top Investment Signals
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {topInsights?.slice(0, 3).map((insight: any) => {
            const Icon = INSIGHT_ICONS[insight.type] || Lightbulb;
            return (
              <Link key={insight.id} href={insight.crop ? `/explore/${insight.country}/${insight.crop}` : `/country/${insight.country}`}>
                <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full" data-testid={`card-insight-${insight.id}`}>
                  <CardContent className="pt-4 pb-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <Badge variant="secondary" className={`text-[11px] px-2 py-0.5 ${INSIGHT_COLORS[insight.type]}`}>
                        <Icon size={11} className="mr-1" />
                        {insight.type.replace("_", " ")}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium leading-snug">{insight.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                      {insight.description}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-primary font-medium pt-1">
                      Explore <ArrowRight size={12} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Investment Leaderboard */}
      <LeaderboardSection lastUpdated={lastUpdated} />

      {/* Data Sources */}
      {sources && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database size={15} className="text-primary" />
              Data Sources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(sources).map(([key, source]: [string, any]) => (
                <div key={key} className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${source.status === "ok" ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <div className="space-y-1 min-w-0">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium flex items-center gap-1 hover:text-primary transition-colors"
                      data-testid={`link-source-${key}`}
                    >
                      {source.name}
                      <ExternalLink size={10} />
                    </a>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {source.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  );
}

function LeaderboardSection({ lastUpdated }: { lastUpdated?: string }) {
  const [, setLocation] = useLocation();
  const { data: leaderboard, isLoading } = useQuery<any[]>({
    queryKey: ["/api/leaderboard"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const [region, setRegion] = useState("All");
  const [signalType, setSignalType] = useState("All");
  const [minStability, setMinStability] = useState(25);
  const [minLogistics, setMinLogistics] = useState(2.0);
  const [sortKey, setSortKey] = useState<string>("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    if (!leaderboard) return [];
    let data = leaderboard.filter((e: any) => {
      if (region !== "All" && e.region !== region) return false;
      if (signalType !== "All" && e.signalType !== signalType) return false;
      if (e.politicalStability !== null && e.politicalStability < minStability) return false;
      if (e.logisticsIndex !== null && e.logisticsIndex < minLogistics) return false;
      return true;
    });
    data.sort((a: any, b: any) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    // Re-rank after filtering
    return data.map((e: any, i: number) => ({ ...e, rank: i + 1 }));
  }, [leaderboard, region, signalType, minStability, minLogistics, sortKey, sortDir]);

  const visible = showAll ? filtered : filtered.slice(0, 20);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const SortHeader = ({ label, field, className = "" }: { label: string; field: string; className?: string }) => (
    <th
      className={`px-3 py-2 text-left text-[11px] font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${className}`}
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {label}
        {sortKey === field ? (
          sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />
        ) : (
          <ArrowUpDown size={9} className="opacity-30" />
        )}
      </span>
    </th>
  );

  const stabilityColor = (v: number | null) => {
    if (v === null) return "text-muted-foreground";
    if (v < 25) return "text-red-600 dark:text-red-400";
    if (v < 50) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
  };

  const logisticsColor = (v: number | null) => {
    if (v === null) return "text-muted-foreground";
    if (v < 2.5) return "text-red-600 dark:text-red-400";
    if (v < 3.5) return "text-amber-600 dark:text-amber-400";
    return "text-emerald-600 dark:text-emerald-400";
  };

  const handleExportCSV = () => {
    if (!filtered.length) return;
    const exportData = filtered.map((e: any) => ({
      Rank: e.rank, Country: e.country, Region: e.region, Crop: e.crop,
      Signal: e.signalType, Score: e.score, "Rev/ha ($)": e.revenuePerHa ?? "",
      "Growth (%)": e.prodGrowth, "Exports ($M)": e.exportValue ?? "",
      "Stability (pctl)": e.politicalStability ?? "", "Logistics (1-5)": e.logisticsIndex ?? "",
    }));
    downloadCSV(exportData, "agri-leaderboard");
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Trophy size={15} className="text-primary" />
          Investment Leaderboard
        </h2>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Trophy size={15} className="text-primary" />
            Investment Leaderboard
          </h2>
          {lastUpdated && (
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Data as of 2024 · Scores updated {formatDate(lastUpdated)}
            </p>
          )}
        </div>
        <button
          onClick={handleExportCSV}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <Download size={12} /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-[160px] h-8 text-xs">
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All Regions</SelectItem>
            {REGION_ORDER.map(r => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1">
          {["All", "growth", "yield_gap", "trade", "opportunity"].map(t => (
            <button
              key={t}
              onClick={() => setSignalType(t)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                signalType === t
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "All" ? "All" : t.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <div className="flex items-center gap-1.5">
            <Shield size={11} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Stability ≥{minStability}</span>
            <Slider
              value={[minStability]}
              onValueChange={([v]) => setMinStability(v)}
              max={100}
              step={5}
              className="w-[80px]"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Truck size={11} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">Logistics ≥{minLogistics.toFixed(1)}</span>
            <Slider
              value={[minLogistics * 10]}
              onValueChange={([v]) => setMinLogistics(v / 10)}
              max={50}
              step={5}
              className="w-[80px]"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No opportunities match your filters — try adjusting region or risk thresholds.
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <SortHeader label="#" field="rank" className="w-10" />
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">Country + Crop</th>
                  <th className="px-3 py-2 text-left text-[11px] font-medium text-muted-foreground">Signal</th>
                  <SortHeader label="Score" field="score" />
                  <SortHeader label="Rev/ha" field="revenuePerHa" />
                  <SortHeader label="Growth" field="prodGrowth" />
                  <SortHeader label="Exports" field="exportValue" />
                  <SortHeader label="Stability" field="politicalStability" />
                  <SortHeader label="Logistics" field="logisticsIndex" />
                </tr>
              </thead>
              <tbody>
                {visible.map((e: any) => {
                  const Icon = INSIGHT_ICONS[e.signalType] || Lightbulb;
                  return (
                    <tr
                      key={`${e.country}-${e.crop}`}
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setLocation(`/explore/${e.country}/${e.crop}`)}
                    >
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{e.rank}</td>
                      <td className="px-3 py-2">
                        <span className="font-medium text-sm">{e.country}</span>
                        <span className="text-muted-foreground mx-1.5">·</span>
                        <span className="text-sm">{e.crop}</span>
                        <span className="text-[11px] text-muted-foreground ml-1.5">{e.region}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${INSIGHT_COLORS[e.signalType] || ""}`}>
                          <Icon size={9} className="mr-0.5" />
                          {e.signalType.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs font-medium">
                        <span className="inline-flex items-center gap-1">
                          {e.score}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Info size={9} className="opacity-30 hover:opacity-100 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-xs">
                              Composite score: production growth, revenue/ha, yield gap vs Africa avg, and export market strength.
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs">
                        <span className="inline-flex items-center gap-1">
                          {e.revenuePerHa != null ? `$${e.revenuePerHa.toLocaleString()}` : "—"}
                          {e.revenuePerHa != null && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info size={9} className="opacity-30 hover:opacity-100 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[240px] text-xs">
                                Revenue per hectare = latest yield (t/ha) × producer price ($/t). Price from FAOSTAT when available; regional average otherwise. Outlier yields and estimated prices are capped for reliability.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </span>
                      </td>
                      <td className={`px-3 py-2 tabular-nums text-xs ${e.prodGrowth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {e.prodGrowth >= 0 ? "+" : ""}{Number(e.prodGrowth).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 tabular-nums text-xs">
                        {e.exportValue != null ? `$${e.exportValue}M` : "—"}
                      </td>
                      <td className={`px-3 py-2 tabular-nums text-xs ${stabilityColor(e.politicalStability)}`}>
                        {e.politicalStability != null ? `${Math.round(e.politicalStability)}th` : "—"}
                      </td>
                      <td className={`px-3 py-2 tabular-nums text-xs ${logisticsColor(e.logisticsIndex)}`}>
                        {e.logisticsIndex != null ? Number(e.logisticsIndex).toFixed(1) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length > 20 && (
            <div className="px-3 py-2 border-t text-center">
              <button
                onClick={() => setShowAll(!showAll)}
                className="text-xs text-primary font-medium hover:underline"
              >
                {showAll ? "Show top 20" : `Show all ${filtered.length} opportunities`}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function KPICard({ label, value, subtext, cagr, clickable }: { label: string; value: string; subtext: string; cagr?: number; clickable?: boolean }) {
  return (
    <Card className={clickable ? "hover:border-primary/30 transition-colors cursor-pointer group" : ""}>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums tracking-tight">{value}</span>
          {cagr !== undefined && (
            <span className={`text-[11px] font-medium tabular-nums flex items-center gap-0.5 ${
              cagr >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {cagr >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {cagr >= 0 ? '+' : ''}{cagr}%/yr
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-muted-foreground">{subtext}</p>
          {clickable && (
            <span className="text-xs text-primary font-medium flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              Explore <ArrowRight size={10} />
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

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
