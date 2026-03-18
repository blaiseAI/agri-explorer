import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, ReferenceLine,
} from "recharts";
import { ArrowLeft, TrendingUp, TrendingDown, Target, Info, BarChart3, Lightbulb, Download, Sparkles, Zap, AlertTriangle, Ship, DollarSign, ChevronRight, Compass } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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

const INSIGHT_CONFIG: Record<string, { badge: string; bg: string; icon: any; accent: string }> = {
  opportunity: {
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    bg: "bg-gradient-to-br from-emerald-50/50 to-transparent dark:from-emerald-950/20 dark:to-transparent",
    icon: Sparkles,
    accent: "text-emerald-500 dark:text-emerald-400",
  },
  growth: {
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    bg: "bg-gradient-to-br from-blue-50/50 to-transparent dark:from-blue-950/20 dark:to-transparent",
    icon: TrendingUp,
    accent: "text-blue-500 dark:text-blue-400",
  },
  yield_gap: {
    badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    bg: "bg-gradient-to-br from-amber-50/50 to-transparent dark:from-amber-950/20 dark:to-transparent",
    icon: Target,
    accent: "text-amber-500 dark:text-amber-400",
  },
  trade: {
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
    bg: "bg-gradient-to-br from-violet-50/50 to-transparent dark:from-violet-950/20 dark:to-transparent",
    icon: Ship,
    accent: "text-violet-500 dark:text-violet-400",
  },
  warning: {
    badge: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    bg: "bg-gradient-to-br from-red-50/50 to-transparent dark:from-red-950/20 dark:to-transparent",
    icon: AlertTriangle,
    accent: "text-red-500 dark:text-red-400",
  },
};

export default function CropDetail() {
  const params = useParams<{ country: string; crop: string }>();
  const country = params.country || "Nigeria";
  const crop = params.crop || "Maize";
  const { toast } = useToast();
  const { isMonetizationEnabled } = useMonetization();

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/crop-data", country, crop],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: insights } = useQuery<any[]>({
    queryKey: ["/api/insights", `?country=${country}&crop=${crop}`],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: similarOps } = useQuery<any[]>({
    queryKey: ["/api/similar", country, crop],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!country && !!crop,
  });

  // Cross-link: other crops in same country
  const { data: countryData } = useQuery<any>({
    queryKey: ["/api/country", country],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  // Cross-link: same crop in other countries
  const { data: cropData } = useQuery<any>({
    queryKey: ["/api/crop", crop],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const otherCrops = useMemo(() => {
    if (!countryData?.crops) return [];
    return countryData.crops
      .filter((c: any) => c.name !== crop && c.latestProduction > 0)
      .sort((a: any, b: any) => (b.revenuePerHa || 0) - (a.revenuePerHa || 0))
      .slice(0, 6);
  }, [countryData?.crops, crop]);

  const otherCountries = useMemo(() => {
    if (!cropData?.countries) return [];
    return cropData.countries
      .filter((c: any) => c.country !== country && c.latestProduction > 0)
      .sort((a: any, b: any) => (b.latestYield || 0) - (a.latestYield || 0))
      .slice(0, 6);
  }, [cropData?.countries, country]);

  // Year range state
  const allSeries = data?.timeSeries || [];
  const allYears = useMemo(() => allSeries.map((d: any) => d.year), [allSeries]);
  const [yearRange, setYearRange] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (allYears.length > 0 && yearRange === null) {
      setYearRange([0, allYears.length - 1]);
    }
  }, [allYears.length]);

  // Reset year range when country/crop changes
  useEffect(() => {
    setYearRange(null);
  }, [country, crop]);

  const startIdx = yearRange?.[0] ?? 0;
  const endIdx = yearRange?.[1] ?? Math.max(0, allYears.length - 1);

  // Filter series by year range
  const series = useMemo(() => {
    if (!allSeries.length) return [];
    return allSeries.slice(startIdx, endIdx + 1);
  }, [allSeries, startIdx, endIdx]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  const { globalAvgYield } = data || {};

  // Calculate summary stats from filtered series
  const first = series[0];
  const last = series[series.length - 1];
  const prodGrowth = first?.production > 0
    ? (((last?.production - first?.production) / first?.production) * 100).toFixed(1)
    : "0";
  const yieldGrowth = first?.yield > 0
    ? (((last?.yield - first?.yield) / first?.yield) * 100).toFixed(1)
    : "0";
  const areaGrowth = first?.area > 0
    ? (((last?.area - first?.area) / first?.area) * 100).toFixed(1)
    : "0";
  const yieldGap = globalAvgYield && last?.yield
    ? ((globalAvgYield - last.yield) / globalAvgYield * 100).toFixed(0)
    : null;

  // Revenue per hectare from best available price (includes regional proxy for stale data)
  const bestPrice = data?.bestPrice;
  let revenuePerHa: number | null = null;
  let avgPriceUsed: number | null = null;
  let priceYearUsed: string | null = null;
  let priceIsEstimate = false;
  let priceSource: string | null = null;
  if (bestPrice && last?.yield) {
    avgPriceUsed = bestPrice.price;
    const yieldTonnesPerHa = last.yield / 10000;
    revenuePerHa = Math.round(yieldTonnesPerHa * bestPrice.price);
    priceYearUsed = bestPrice.year;
    priceIsEstimate = bestPrice.isEstimate;
    priceSource = bestPrice.source;
  }

  function handleExport() {
    if (isMonetizationEnabled) {
      toast({
        title: "Pro Feature",
        description: "CSV export is available on Pro. Upgrade to unlock.",
      });
      return;
    }

    const exportData = series.map((s: any) => ({
      Year: s.year,
      Country: country,
      Crop: crop,
      Production_tonnes: s.production,
      Yield_hgha: s.yield,
      Area_ha: s.area,
    }));
    downloadCSV(exportData, `${country}_${crop}_historical_data`);
  }

  return (
    <div className="space-y-6">
      {/* Back links + export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Link href={`/country/${country}`}>
            <span className="flex items-center gap-1 hover:text-foreground cursor-pointer transition-colors">
              <ArrowLeft size={14} /> {country}
            </span>
          </Link>
          <span>/</span>
          <Link href={`/crop/${crop}`}>
            <span className="hover:text-foreground cursor-pointer transition-colors">{crop}</span>
          </Link>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card text-sm hover:border-primary/30 transition-colors"
          data-testid="export-csv"
        >
          <Download size={13} />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-detail-title">
          {crop} in {country}
        </h1>
        <p className="text-sm text-muted-foreground">
          {series.length > 0 ? `${series[0].year} — ${series[series.length-1].year}` : ""} performance data
        </p>
      </div>

      {/* Year range slider */}
      {allYears.length > 2 && yearRange !== null && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground">Time Range</p>
              <p className="text-xs font-medium tabular-nums">
                {allYears[startIdx]} — {allYears[endIdx]}
              </p>
            </div>
            <Slider
              min={0}
              max={allYears.length - 1}
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

      {/* Summary KPIs */}
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${revenuePerHa !== null ? 'md:grid-cols-3 lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
        <SummaryCard
          label="Latest Production"
          value={`${last?.production?.toLocaleString() || "—"}K t`}
          growth={Number(prodGrowth)}
          period={`${first?.year}-${last?.year}`}
        />
        <SummaryCard
          label="Latest Yield"
          value={`${last?.yield?.toLocaleString() || "—"} hg/ha`}
          growth={Number(yieldGrowth)}
          period={`${first?.year}-${last?.year}`}
        />
        <SummaryCard
          label="Area Harvested"
          value={`${last?.area?.toLocaleString() || "—"}K ha`}
          growth={Number(areaGrowth)}
          period={`${first?.year}-${last?.year}`}
        />
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Yield vs Africa Average</p>
            {yieldGap && Number(yieldGap) > 0 ? (
              <>
                <span className="text-xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                  -{yieldGap}%
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">below Africa avg ({globalAvgYield?.toLocaleString()})</p>
              </>
            ) : (
              <>
                <span className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  Above avg
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {globalAvgYield ? `Africa: ${globalAvgYield.toLocaleString()} hg/ha` : ""}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        {revenuePerHa !== null && (
          <Card data-testid="revenue-card">
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <DollarSign size={11} />
                Est. Gross Revenue
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={11} className="shrink-0 cursor-help opacity-60 hover:opacity-100 transition-opacity" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px] text-xs">
                    Estimated gross revenue: yield (hg/ha ÷ 10,000) × producer price ($/tonne). Does not include input costs, transport, or post-harvest losses.
                  </TooltipContent>
                </Tooltip>
              </p>
              <span className="text-xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                ~${revenuePerHa.toLocaleString()}/ha
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">
                yield × price ({priceSource ? `${priceIsEstimate ? 'est. ' : ''}${priceSource}: $${Math.round(avgPriceUsed!)}/t` : 'avg'})
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Charts — Pro only */}
      <UpgradePrompt feature="Full Time Series Charts" description="Production, yield, and area trend charts unlock with Pro.">
      <Tabs defaultValue="production">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="production" data-testid="tab-production">Production</TabsTrigger>
          <TabsTrigger value="yield" data-testid="tab-yield">Yield</TabsTrigger>
          <TabsTrigger value="area" data-testid="tab-area">Area</TabsTrigger>
        </TabsList>

        <TabsContent value="production">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Production Trend (thousands of tonnes)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="prodGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" label={{ value: 'Production (K tonnes)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }} />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()}K tonnes`, "Production"]}
                    />
                    <Area type="monotone" dataKey="production" stroke="hsl(var(--chart-1))" strokeWidth={2} fill="url(#prodGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="yield">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Yield Trend (hg/ha)
                {globalAvgYield && <span className="font-normal text-muted-foreground ml-2">— Africa avg: {globalAvgYield.toLocaleString()}</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" label={{ value: 'Yield (hg/ha)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }} />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()} hg/ha`, "Yield"]}
                    />
                    {globalAvgYield && (
                      <ReferenceLine y={globalAvgYield} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "Africa avg", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    )}
                    <Line type="monotone" dataKey="yield" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="area">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Area Harvested Trend (thousands of hectares)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" label={{ value: 'Area (K ha)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' } }} />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))" }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()}K ha`, "Area"]}
                    />
                    <Bar dataKey="area" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </UpgradePrompt>

      {/* Insights for this country+crop */}
      {insights && insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Lightbulb size={15} className="text-primary" />
            Signals for {crop} in {country}
          </h2>
          <div className="space-y-3">
            {insights.map((insight: any) => {
              const config = INSIGHT_CONFIG[insight.type] || INSIGHT_CONFIG.opportunity;
              const Icon = config.icon;
              return (
                <Card key={insight.id} className={`overflow-hidden ${config.bg}`} data-testid={`insight-${insight.id}`}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start gap-4">
                      <div className={`shrink-0 mt-0.5 p-2 rounded-lg bg-background/80 border ${config.accent}`}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={`text-[11px] px-2 py-0 ${config.badge}`}>
                            {insight.type.replace("_", " ")}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground font-medium tabular-nums ml-auto">
                            Score {insight.score}
                          </span>
                        </div>
                        <p className="text-sm font-semibold leading-snug">{insight.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Risk Factors */}
      {data?.riskFactors && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Risk Factors for {country}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-xs">
              {data.riskFactors.politicalStability != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Political Stability</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{Math.round(data.riskFactors.politicalStability)}th pctl</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      data.riskFactors.politicalStability >= 60 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : data.riskFactors.politicalStability >= 30 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>{data.riskFactors.politicalStability >= 60 ? 'LOW RISK' : data.riskFactors.politicalStability >= 30 ? 'MEDIUM' : 'HIGH RISK'}</span>
                  </div>
                </div>
              )}
              {data.riskFactors.logisticsIndex != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Logistics Score</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{data.riskFactors.logisticsIndex.toFixed(1)} / 5.0</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      data.riskFactors.logisticsIndex >= 3.0 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : data.riskFactors.logisticsIndex >= 2.0 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>{data.riskFactors.logisticsIndex >= 3.0 ? 'GOOD' : data.riskFactors.logisticsIndex >= 2.0 ? 'MEDIUM' : 'POOR'}</span>
                  </div>
                </div>
              )}
              {data.riskFactors.climateExposure != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Climate Exposure</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{data.riskFactors.climateExposure.toFixed(0)}% pop.</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      data.riskFactors.climateExposure <= 10 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : data.riskFactors.climateExposure <= 40 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                    }`}>{data.riskFactors.climateExposure <= 10 ? 'LOW' : data.riskFactors.climateExposure <= 40 ? 'MEDIUM' : 'HIGH'}</span>
                  </div>
                </div>
              )}
              {data.riskFactors.irrigatedLand != null && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Irrigated Land</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium tabular-nums">{data.riskFactors.irrigatedLand.toFixed(1)}%</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      data.riskFactors.irrigatedLand >= 20 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : data.riskFactors.irrigatedLand >= 5 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>{data.riskFactors.irrigatedLand >= 20 ? 'Irrigated' : data.riskFactors.irrigatedLand >= 5 ? 'Partial' : 'Rain-dependent'}</span>
                  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-3">Source: World Bank Governance Indicators</p>
          </CardContent>
        </Card>
      )}

      {/* Cross-links */}
      {otherCrops.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Other crops in {country}</p>
            <div className="flex flex-wrap gap-1.5">
              {otherCrops.map((c: any) => (
                <Link key={c.name} href={`/explore/${country}/${c.name}`}>
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-muted hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">
                    {c.name}
                    {c.revenuePerHa > 0 && <span className="text-emerald-600 dark:text-emerald-400 text-[10px]">${c.revenuePerHa.toLocaleString()}/ha</span>}
                    <ChevronRight size={10} className="text-muted-foreground" />
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {otherCountries.length > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">{crop} in other countries</p>
            <div className="flex flex-wrap gap-1.5">
              {otherCountries.map((c: any) => (
                <Link key={c.country} href={`/explore/${c.country}/${crop}`}>
                  <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-muted hover:bg-primary/10 hover:text-primary transition-colors cursor-pointer">
                    {c.country}
                    <span className="text-[10px] text-muted-foreground">{(c.latestYield || 0).toLocaleString()} hg/ha</span>
                    <ChevronRight size={10} className="text-muted-foreground" />
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Similar Opportunities */}
      {similarOps && similarOps.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Compass size={15} className="text-primary" />
            You Might Also Consider
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {similarOps.map((op: any) => (
              <Link key={`${op.country}-${op.crop}`} href={`/explore/${op.country}/${op.crop}`}>
                <Card className="hover:border-primary/30 transition-colors cursor-pointer h-full">
                  <CardContent className="pt-4 pb-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <span className="text-sm font-medium">{op.country} · {op.crop}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 tabular-nums">
                        {op.score}/100
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs tabular-nums">
                      {op.revenuePerHa != null && (
                        <span className="text-muted-foreground">
                          ${op.revenuePerHa.toLocaleString()}/ha
                        </span>
                      )}
                      <span className={op.prodGrowth >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                        {op.prodGrowth >= 0 ? "+" : ""}{op.prodGrowth.toFixed(1)}% growth
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{op.reason}</p>
                    <div className="flex items-center gap-1 text-xs text-primary font-medium pt-1">
                      Explore <ChevronRight size={12} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, growth, period }: { label: string; value: string; growth: number; period: string }) {
  const isPositive = growth > 0;
  return (
    <Card>
      <CardContent className="pt-4 pb-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className="text-xl font-semibold tabular-nums tracking-tight">{value}</p>
        <div className="flex items-center gap-1 mt-1">
          <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
            isPositive ? "text-emerald-600 dark:text-emerald-400" : growth < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
          }`}>
            {isPositive ? <TrendingUp size={11} /> : growth < 0 ? <TrendingDown size={11} /> : null}
            {isPositive ? "+" : ""}{growth}% total
          </span>
          <span className="text-[10px] text-muted-foreground">({period})</span>
        </div>
      </CardContent>
    </Card>
  );
}
