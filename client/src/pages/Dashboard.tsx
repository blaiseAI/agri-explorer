import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import UpgradePrompt from "@/components/UpgradePrompt";
import { useMonetization } from "@/hooks/useMonetization";

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
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
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

      {/* Two column: Countries + Crops */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                      <span className="text-xs font-medium text-primary tabular-nums">{insight.score}/100</span>
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

      {/* Disclaimer */}
      <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground leading-relaxed">
        This tool surfaces agricultural data signals to support research and exploration.
        It does not constitute financial advice. Data is sourced from FAOSTAT, World Bank,
        and UN Comtrade and refreshed periodically. Always conduct independent due diligence before making investment decisions.
      </div>
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
