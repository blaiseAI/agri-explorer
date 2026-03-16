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
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, ReferenceLine,
} from "recharts";
import { ArrowLeft, TrendingUp, TrendingDown, Target, Info, BarChart3, Lightbulb, Download } from "lucide-react";
import { downloadCSV } from "@/lib/export";

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

const INSIGHT_COLORS: Record<string, string> = {
  opportunity: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  growth: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  yield_gap: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  trade: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400",
  warning: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function CropDetail() {
  const params = useParams<{ country: string; crop: string }>();
  const country = params.country || "Nigeria";
  const crop = params.crop || "Maize";

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/crop-data", country, crop],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: insights } = useQuery<any[]>({
    queryKey: ["/api/insights", `?country=${country}&crop=${crop}`],
    queryFn: getQueryFn({ on401: "throw" }),
  });

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

  function handleExport() {
    const rows = series.map((d: any) => ({
      Year: d.year,
      "Production (K tonnes)": d.production,
      "Yield (hg/ha)": d.yield,
      "Area (K ha)": d.area,
    }));
    downloadCSV(rows, `${country}-${crop}-timeseries`);
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
      </div>

      {/* Charts in tabs */}
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
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
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
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
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
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
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

      {/* Insights for this country+crop */}
      {insights && insights.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <Lightbulb size={15} className="text-primary" />
            Signals for {crop} in {country}
          </h2>
          <div className="space-y-2">
            {insights.map((insight: any) => (
              <Card key={insight.id} className="border-l-4 border-l-primary/40" data-testid={`insight-${insight.id}`}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={`text-[11px] px-2 py-0 ${INSIGHT_COLORS[insight.type]}`}>
                          {insight.type.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-primary font-medium tabular-nums">{insight.score}/100</span>
                      </div>
                      <p className="text-sm font-medium">{insight.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
            {isPositive ? "+" : ""}{growth}%
          </span>
          <span className="text-[10px] text-muted-foreground">({period})</span>
        </div>
      </CardContent>
    </Card>
  );
}
