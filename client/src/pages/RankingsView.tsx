import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Trophy, ChevronRight } from "lucide-react";

interface RankingRow {
  rank: number;
  country: string;
  code: string | null;
  production: number;
  yield: number;
  area: number;
  yoyPct: number | null;
  year: string;
}

export default function RankingsView() {
  const params = useParams<{ crop: string }>();
  const crop = params.crop || "Coffee";

  useEffect(() => {
    document.title = `${crop} Production by Country — World Ranking | Afrixplorer`;
  }, [crop]);

  const { data, isLoading } = useQuery<{ crop: string; rankings: RankingRow[] }>({
    queryKey: ["/api/rankings", crop],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64 rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  const rankings = data?.rankings || [];
  const top = rankings[0];
  const africanRows = rankings.filter((r) => r.code !== null);
  const chartData = rankings.slice(0, 10).map((r) => ({ name: r.country, production: r.production, isAfrican: r.code !== null }));

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-rankings-title">
          {crop} Production by Country — World Ranking
        </h1>
        {top && (
          <p className="text-sm text-muted-foreground">
            {top.country} leads at {top.production.toLocaleString()}K tonnes ({top.year})
          </p>
        )}
      </div>

      {rankings.length === 0 ? (
        <Card>
          <CardContent className="pt-6 pb-6 text-sm text-muted-foreground">
            Ranking data for {crop} is not available yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Top 10 Producers (thousands of tonnes)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={100} />
                    <RechartsTooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()}K tonnes`, "Production"]}
                    />
                    <Bar dataKey="production" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.isAfrican ? "hsl(152, 55%, 28%)" : "hsl(var(--muted-foreground))"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            <h2 className="text-sm font-medium">Full Ranking</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b">
                    <th className="py-2 pr-3">Rank</th>
                    <th className="py-2 pr-3">Country</th>
                    <th className="py-2 pr-3 text-right">Production (K t)</th>
                    <th className="py-2 pr-3 text-right">Yield (hg/ha)</th>
                    <th className="py-2 pr-3 text-right">YoY</th>
                  </tr>
                </thead>
                <tbody>
                  {rankings.map((r) => (
                    <tr key={r.country} className="border-b last:border-0">
                      <td className="py-2 pr-3 tabular-nums">{r.rank}</td>
                      <td className="py-2 pr-3">
                        {r.code ? (
                          <Link href={`/country/${r.code}`}>
                            <span className="text-primary hover:underline cursor-pointer">{r.country}</span>
                          </Link>
                        ) : (
                          r.country
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.production.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.yield.toLocaleString()}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {r.yoyPct !== null ? `${r.yoyPct > 0 ? "+" : ""}${r.yoyPct}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {africanRows.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Trophy size={14} className="text-primary" />
                  {crop} in Africa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {africanRows.map((r) => (
                  <Link key={r.country} href={`/explore/${r.code}/${crop}`}>
                    <div className="flex items-center justify-between text-sm py-1.5 hover:text-primary cursor-pointer transition-colors">
                      <span>{r.country} — #{r.rank} globally</span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {r.production.toLocaleString()}K t <ChevronRight size={12} />
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="text-sm">
            <Link href={`/crop/${crop}`}>
              <span className="text-primary hover:underline cursor-pointer">See the full Africa view for {crop} →</span>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
