import { Request, Response } from "express";
import sharp from "sharp";
import { getCropData, getYears } from "./data";
import { resolveCountry, resolveCrop } from "./resolve";

const WIDTH = 800;
const HEIGHT = 480;
const CHART_LEFT = 60;
const CHART_RIGHT = WIDTH - 30;
const CHART_TOP = 90;
const CHART_BOTTOM = HEIGHT - 80;

const METRICS: Record<string, { key: "production" | "yield" | "area"; label: string; unit: string }> = {
  production: { key: "production", label: "Production", unit: "K tonnes" },
  yield: { key: "yield", label: "Yield", unit: "hg/ha" },
  area: { key: "area", label: "Area Harvested", unit: "K ha" },
};

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Renders a static, publicly embeddable PNG chart for a country/crop/metric
 * combination — the "embed this chart, get a backlink" mechanism. Validates
 * country/crop via resolveCountry/resolveCrop before touching data or the
 * SVG template, the same discipline as every other user-input-adjacent
 * endpoint in this codebase; unresolved input renders a graceful fallback
 * image rather than a broken chart or a thrown error.
 */
export async function generateEmbedChart(req: Request, res: Response) {
  try {
    const countryParam = (req.query.country as string) || "";
    const cropParam = (req.query.crop as string) || "";
    const metricParam = ((req.query.metric as string) || "production").toLowerCase();

    const country = resolveCountry(countryParam);
    const crop = resolveCrop(cropParam);
    const metric = METRICS[metricParam] || METRICS.production;

    let svg: string;

    if (!country || !crop) {
      svg = renderFallback("Chart unavailable — check country/crop parameters");
    } else {
      const cropData = getCropData()[country.name]?.[crop];
      if (!cropData) {
        svg = renderFallback(`No ${crop} data for ${country.name}`);
      } else {
        const years = getYears();
        const series = years
          .map((year) => ({ year, value: cropData[metric.key][year] || 0 }))
          .filter((d) => d.value > 0);

        if (series.length === 0) {
          svg = renderFallback(`No ${metric.label.toLowerCase()} data for ${crop} in ${country.name}`);
        } else {
          svg = renderChart(country.name, crop, metric, series);
        }
      }
    }

    const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=43200");
    res.send(pngBuffer);
  } catch (err) {
    console.error("Failed to generate embed chart:", err);
    res.status(500).send("Internal Server Error");
  }
}

function renderFallback(message: string): string {
  return `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#18181b" />
      <text x="${WIDTH / 2}" y="${HEIGHT / 2}" font-family="DejaVu Sans, sans-serif" font-size="18" fill="#a1a1aa" text-anchor="middle">
        ${escapeXml(message)}
      </text>
      <text x="${WIDTH / 2}" y="${HEIGHT - 24}" font-family="DejaVu Sans, sans-serif" font-size="13" fill="#52525b" text-anchor="middle">
        afrixplorer.com
      </text>
    </svg>
  `;
}

function renderChart(
  countryName: string,
  cropName: string,
  metric: { label: string; unit: string },
  series: { year: string; value: number }[]
): string {
  const maxVal = Math.max(...series.map((d) => d.value));
  const barWidth = (CHART_RIGHT - CHART_LEFT) / series.length;
  const chartHeight = CHART_BOTTOM - CHART_TOP;

  const bars = series
    .map((d, i) => {
      const barHeight = maxVal > 0 ? (d.value / maxVal) * chartHeight : 0;
      const x = CHART_LEFT + i * barWidth + barWidth * 0.15;
      const y = CHART_BOTTOM - barHeight;
      const w = barWidth * 0.7;
      const showLabel = series.length <= 8 || i % Math.ceil(series.length / 8) === 0;
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barHeight.toFixed(1)}" fill="url(#bar)" rx="2" />
        ${showLabel ? `<text x="${(x + w / 2).toFixed(1)}" y="${CHART_BOTTOM + 20}" font-family="DejaVu Sans, sans-serif" font-size="12" fill="#a1a1aa" text-anchor="middle">${escapeXml(d.year)}</text>` : ""}
      `;
    })
    .join("");

  const title = `${escapeXml(cropName)} ${metric.label} in ${escapeXml(countryName)}`;
  const latest = series[series.length - 1];

  return `
    <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bar" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#34d399" />
          <stop offset="100%" stop-color="#10b981" />
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#18181b" />

      <text x="30" y="38" font-family="DejaVu Sans, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${title}</text>
      <text x="30" y="62" font-family="DejaVu Sans, sans-serif" font-size="14" fill="#a1a1aa">
        Latest (${escapeXml(latest.year)}): ${latest.value.toLocaleString()} ${escapeXml(metric.unit)}
      </text>

      <line x1="${CHART_LEFT}" y1="${CHART_BOTTOM}" x2="${CHART_RIGHT}" y2="${CHART_BOTTOM}" stroke="#3f3f46" stroke-width="1" />

      ${bars}

      <text x="30" y="${HEIGHT - 24}" font-family="DejaVu Sans, sans-serif" font-size="13" fill="#71717a">
        Source: FAOSTAT via afrixplorer.com
      </text>
      <text x="${WIDTH - 30}" y="${HEIGHT - 24}" font-family="DejaVu Sans, sans-serif" font-size="13" fill="#34d399" text-anchor="end">
        afrixplorer.com
      </text>
    </svg>
  `;
}
