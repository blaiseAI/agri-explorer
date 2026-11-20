import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Map as MapIcon, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getQueryFn } from "@/lib/queryClient";
import { CLASS_COUNT, classify, formatTonnes, formatYield, quantileBreaks } from "./scale";
import type { CountryShape } from "./geometry";

type Metric = "production" | "yield";

interface CropCountry {
  country: string;
  code: string;
  region: string;
  latestProduction: number;
  latestYield: number;
  latestArea: number;
  productionGrowth: number | null;
}

interface Geometry {
  MAP_WIDTH: number;
  MAP_HEIGHT: number;
  COUNTRY_SHAPES: CountryShape[];
  CONTEXT_SHAPES: { name: string; d: string }[];
}

const FEATURED_CROPS = ["Cassava", "Maize", "Yams", "Rice", "Sorghum", "Cocoa", "Coffee", "Wheat"];
const CLASS_FILL = Array.from({ length: CLASS_COUNT }, (_, i) => `var(--map-${i + 1})`);
const EMPTY_FILL = "var(--map-empty)";
const VIEW_W = 800;
const VIEW_H = 820;

function metricValue(c: CropCountry | undefined, metric: Metric): number | undefined {
  if (!c) return undefined;
  return metric === "production" ? c.latestProduction : c.latestYield;
}

function formatMetric(v: number, metric: Metric): string {
  return metric === "production" ? formatTonnes(v) : formatYield(v);
}

export default function AfricaMap({
  crops,
  countryNames,
  latestYear,
}: {
  /** Every crop, most-produced first. */
  crops: string[];
  /** ISO3 -> display name, for countries without data for the selected crop. */
  countryNames: Record<string, string>;
  latestYear?: string;
}) {
  const [crop, setCrop] = useState("Cassava");
  const [metric, setMetric] = useState<Metric>("production");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // The outlines are a separate chunk so they never delay the page's first paint.
  useEffect(() => {
    let alive = true;
    import("./geometry").then((m) => alive && setGeo(m));
    return () => {
      alive = false;
    };
  }, []);

  const { data, isLoading } = useQuery<{ crop: string; countries: CropCountry[] }>({
    queryKey: ["/api/crop", crop],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const byCode = useMemo(() => {
    const m = new Map<string, CropCountry>();
    for (const c of data?.countries ?? []) if (c.latestProduction > 0) m.set(c.code, c);
    return m;
  }, [data]);

  const ranked = useMemo(
    () =>
      Array.from(byCode.values())
        .filter((c) => (metricValue(c, metric) ?? 0) > 0)
        .sort((a, b) => (metricValue(b, metric) ?? 0) - (metricValue(a, metric) ?? 0)),
    [byCode, metric],
  );
  const rankOf = useMemo(() => new Map(ranked.map((c, i) => [c.code, i + 1])), [ranked]);
  const africaTotal = useMemo(() => ranked.reduce((s, c) => s + c.latestProduction, 0), [ranked]);
  const breaks = useMemo(() => quantileBreaks(ranked.map((c) => metricValue(c, metric) ?? 0)), [ranked, metric]);

  const fillFor = (code: string) => {
    const cls = classify(metricValue(byCode.get(code), metric), breaks);
    // With fewer breaks than classes (few producers), spread the used classes across the ramp.
    if (cls < 0) return EMPTY_FILL;
    const used = breaks.length + 1;
    const step = used === 1 ? CLASS_COUNT - 1 : Math.round((cls * (CLASS_COUNT - 1)) / (used - 1));
    return CLASS_FILL[step];
  };

  const legend = useMemo(() => {
    const used = breaks.length + 1;
    return Array.from({ length: used }, (_, i) => {
      const step = used === 1 ? CLASS_COUNT - 1 : Math.round((i * (CLASS_COUNT - 1)) / (used - 1));
      const lo = i === 0 ? null : breaks[i - 1];
      const hi = i < breaks.length ? breaks[i] : null;
      const label =
        lo === null && hi !== null ? `< ${formatMetric(hi, metric)}` : hi === null && lo !== null ? `≥ ${formatMetric(lo, metric)}` : lo !== null && hi !== null ? `${formatMetric(lo, metric).replace(/ t(\/ha)?$/, "")}–${formatMetric(hi, metric)}` : "";
      return { fill: CLASS_FILL[step], label };
    });
  }, [breaks, metric]);

  const nameOf = (code: string) => byCode.get(code)?.country ?? countryNames[code] ?? code;
  const focus = selected ?? hovered;
  const active = selected ? byCode.get(selected) : undefined;
  const hoverInfo = hovered ? byCode.get(hovered) : undefined;
  const cropOptions = crops.length ? crops : FEATURED_CROPS;
  const metricLabel = metric === "production" ? "production" : "yield";

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const box = boxRef.current?.getBoundingClientRect();
    if (box) setPointer({ x: e.clientX - box.left, y: e.clientY - box.top });
  };

  const pick = (code: string) => setSelected((cur) => (cur === code ? null : code));

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <MapIcon size={14} className="text-primary" aria-hidden="true" />
            {crop} {metricLabel} across Africa
            {latestYear && <span className="font-normal text-muted-foreground">· {latestYear}</span>}
          </h2>
          <p className="text-xs text-muted-foreground">Select a country to compare it</p>
        </div>

        {/* Filters: one row, scrolls sideways on small screens */}
        <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none]">
          <div className="inline-flex shrink-0 rounded-full border bg-background p-0.5" role="group" aria-label="Measure">
            {(["production", "yield"] as Metric[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={`min-h-7 px-3 rounded-full text-xs font-medium capitalize transition-colors ${
                  metric === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
          {FEATURED_CROPS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={crop === c}
              onClick={() => {
                setCrop(c);
                setSelected(null);
              }}
              className={`min-h-7 shrink-0 px-3 rounded-full text-xs font-medium border transition-colors ${
                crop === c ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {c}
            </button>
          ))}
          <Select
            value={FEATURED_CROPS.includes(crop) ? "" : crop}
            onValueChange={(v) => {
              setCrop(v);
              setSelected(null);
            }}
          >
            <SelectTrigger className="h-7 w-[132px] shrink-0 rounded-full text-xs" aria-label="More crops">
              <SelectValue placeholder="More crops…" />
            </SelectTrigger>
            <SelectContent>
              {cropOptions.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-12">
        <div className="min-w-0 w-full lg:max-w-[600px] lg:flex-1">
          {/* Fixed aspect ratio: the box is reserved before the outlines arrive (no layout shift). */}
          <div
            ref={boxRef}
            className="relative mx-auto w-full max-w-[600px]"
            style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
            onPointerLeave={() => {
              setHovered(null);
              setPointer(null);
            }}
          >
            {geo ? (
              <svg
                viewBox={`0 0 ${geo.MAP_WIDTH} ${geo.MAP_HEIGHT}`}
                className="absolute inset-0 h-full w-full"
                role="img"
                aria-label={`Map of Africa shaded by ${crop} ${metricLabel}. The ranked list beside the map has the same data.`}
                onPointerMove={onMove}
              >
                {geo.CONTEXT_SHAPES.map((c) => (
                  <path key={c.name} d={c.d} fill={EMPTY_FILL} stroke="hsl(var(--card))" strokeWidth={0.8} strokeDasharray="2 2" />
                ))}
                {geo.COUNTRY_SHAPES.map((c) => (
                  <g
                    key={c.code}
                    data-code={c.code}
                    className="cursor-pointer"
                    onPointerEnter={() => setHovered(c.code)}
                    onClick={() => pick(c.code)}
                  >
                    <path
                      d={c.d}
                      fill={fillFor(c.code)}
                      stroke="hsl(var(--card))"
                      strokeWidth={0.8}
                      strokeLinejoin="round"
                      style={{ transition: "fill 300ms ease" }}
                    />
                    {c.small && (
                      <circle
                        cx={c.cx}
                        cy={c.cy}
                        r={6}
                        fill={fillFor(c.code)}
                        stroke="hsl(var(--card))"
                        strokeWidth={2}
                      />
                    )}
                  </g>
                ))}
                {/* Outline the focused country on top so its border isn't hidden by neighbours */}
                {focus &&
                  (() => {
                    const s = geo.COUNTRY_SHAPES.find((c) => c.code === focus);
                    if (!s) return null;
                    return s.small ? (
                      <circle cx={s.cx} cy={s.cy} r={7} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5} pointerEvents="none" />
                    ) : (
                      <path d={s.d} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.5} strokeLinejoin="round" pointerEvents="none" />
                    );
                  })()}
              </svg>
            ) : (
              <div className="absolute inset-0 animate-pulse rounded-lg bg-muted/40" />
            )}

            {/* Hover tooltip (mouse only; touch users tap to select) */}
            {hovered && pointer && hovered !== selected && (
              <div
                className="pointer-events-none absolute z-10 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
                style={{
                  left: Math.min(pointer.x + 12, (boxRef.current?.clientWidth ?? 0) - 170),
                  top: Math.max(pointer.y - 44, 0),
                  width: 160,
                }}
              >
                <p className="font-medium truncate">{nameOf(hovered)}</p>
                <p className="text-muted-foreground tabular-nums">
                  {hoverInfo && metricValue(hoverInfo, metric)
                    ? `${formatMetric(metricValue(hoverInfo, metric)!, metric)} · #${rankOf.get(hovered)} of ${ranked.length}`
                    : `No ${crop.toLowerCase()} data`}
                </p>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mx-auto mt-3 flex max-w-[600px] flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground tabular-nums">
            {legend.map((l) => (
              <span key={l.label} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-4 rounded-sm" style={{ background: l.fill }} aria-hidden="true" />
                {l.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-4 rounded-sm border border-border" style={{ background: EMPTY_FILL }} aria-hidden="true" />
              No data
            </span>
          </div>
        </div>

        {/* Side panel: fixed height so it doesn't jump between states */}
        <aside className="h-[300px] w-full shrink-0 rounded-lg border bg-background/60 p-4 flex flex-col lg:w-[320px] lg:mt-6">
          {selected && !active ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold truncate">{nameOf(selected)}</h3>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear selection"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {isLoading ? "Loading…" : `No ${crop.toLowerCase()} production recorded for ${nameOf(selected)} in the FAOSTAT data.`}
              </p>
              <Link
                href={`/country/${selected}`}
                className="mt-auto flex items-center justify-between rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90"
              >
                What {nameOf(selected)} grows <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </>
          ) : active ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{active.region}</p>
                  <h3 className="text-base font-semibold truncate">{active.country}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="-mr-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear selection"
                >
                  <X size={14} />
                </button>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Production</dt>
                  <dd className="font-semibold tabular-nums">{formatTonnes(active.latestProduction)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Yield</dt>
                  <dd className="font-semibold tabular-nums">{active.latestYield ? formatYield(active.latestYield) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Rank in Africa ({metricLabel})</dt>
                  <dd className="font-semibold tabular-nums">
                    #{rankOf.get(active.code) ?? "—"} <span className="font-normal text-muted-foreground">of {ranked.length}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Share of African output</dt>
                  <dd className="font-semibold tabular-nums">
                    {africaTotal ? `${((active.latestProduction / africaTotal) * 100).toFixed(1)}%` : "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-auto space-y-1.5">
                <Link
                  href={`/explore/${active.code}/${encodeURIComponent(crop)}`}
                  className="flex items-center justify-between rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90"
                >
                  {active.country} · {crop} trends <ArrowRight size={13} aria-hidden="true" />
                </Link>
                <Link
                  href={`/country/${active.code}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-xs font-medium hover:border-primary/40 hover:text-primary"
                >
                  All crops in {active.country} <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Top {metric === "production" ? "producers" : "yields"}
              </h3>
              <ol className="mt-2 flex-1 space-y-0.5">
                {isLoading
                  ? Array.from({ length: 6 }, (_, i) => <li key={i} className="h-8 animate-pulse rounded bg-muted/50" />)
                  : ranked.slice(0, 6).map((c, i) => {
                      const v = metricValue(c, metric) ?? 0;
                      const top = metricValue(ranked[0], metric) ?? 1;
                      return (
                        <li key={c.code}>
                          <button
                            type="button"
                            onClick={() => setSelected(c.code)}
                            onPointerEnter={() => setHovered(c.code)}
                            onPointerLeave={() => setHovered(null)}
                            className="group grid h-8 w-full grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 text-left text-sm hover:bg-muted/60"
                          >
                            <span className="text-[11px] text-muted-foreground tabular-nums">{i + 1}</span>
                            <span className="relative min-w-0">
                              <span className="block truncate">{c.country}</span>
                              <span className="absolute -bottom-0.5 left-0 h-0.5 rounded-full bg-primary/60" style={{ width: `${(v / top) * 100}%` }} aria-hidden="true" />
                            </span>
                            <span className="text-xs tabular-nums text-muted-foreground">{formatMetric(v, metric)}</span>
                          </button>
                        </li>
                      );
                    })}
              </ol>
              <Link href={`/crop/${encodeURIComponent(crop)}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                All {ranked.length || ""} {crop.toLowerCase()} producers <ArrowRight size={12} aria-hidden="true" />
              </Link>
            </>
          )}
        </aside>
      </CardContent>
    </Card>
  );
}
