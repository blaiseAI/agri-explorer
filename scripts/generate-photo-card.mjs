#!/usr/bin/env node
/**
 * Composites a fixed brand overlay (headline, subtext, url tag) onto any
 * background photo, so every social card shares exactly the same layout
 * regardless of what photo or model generated the background. Fixes the
 * uniformity problem with pure text-in-diffusion cards: the model redraws
 * layout from scratch every time, so headline position/color/type drift
 * card to card. Here only the photo changes; the template is locked.
 *
 * Usage:
 *   node scripts/generate-photo-card.mjs <config.json> <photoPath> <outputPath>
 *
 * config.json shape:
 * {
 *   "accentWord": "Ivory Coast",
 *   "headlineLines": ["produces more cocoa", "than the rest of the", "world combined."],
 *   "subtextLines": ["Behind that number: farmers like this, across", "thousands of small holdings."],
 *   "url": "afrixplorer.com/rankings/Cocoa"
 * }
 *
 * Optional "stats" block auto-computes numbers from the DB (so copy never
 * carries a hand-typed arithmetic mistake) and substitutes them into any
 * string field via {{token}} placeholders:
 * {
 *   "stats": { "type": "compare", "crop": "Coffee", "primary": "Brazil", "others": ["Viet Nam", "Colombia"] },
 *   "headlineLines": ["produces more coffee than the #2 and #3", "producers combined."],
 *   "subtextLines": ["{{primaryValue}}K tonnes vs. their {{othersSum}}K combined, {{year}}."]
 * }
 * stats.type: "compare" (primary/others/year/othersSum/primaryValue/ratio),
 *             "yoy" (country/crop/year1/year2 -> value1/value2/changePct/changePctAbs/direction),
 *             "rank" (crop/country -> rank/value/year),
 *             "share" (crop/countries -> combined/total/pctShare/year)
 *
 * Every stats block also exposes {{sourceLabel}} ("the latest FAOSTAT data").
 * Prefer it over a bare "{{year}}" in subtext -- a raw "2024" reads as stale
 * to a casual reader even though it's genuinely the latest full year FAOSTAT
 * has published; "latest available data" states that honestly instead.
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as cropStats from "./lib/crop-stats.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 1600;
const H = 1200;
const ACCENT = "#e8b93f";
const LEFT = 64;

function resolveStats(statsConfig) {
  const { type, ...args } = statsConfig;
  if (type === "compare") return cropStats.compare(args.crop, args.primary, args.others);
  if (type === "yoy") return cropStats.yoy(args.country, args.crop, args.year1, args.year2);
  if (type === "rank") return cropStats.rank(args.crop, args.country);
  if (type === "share") return cropStats.share(args.crop, args.countries);
  throw new Error(`Unknown stats.type "${type}"`);
}

export async function generatePhotoCard(rawConfig, photoPath, outputPath) {
  let config = rawConfig;
  if (rawConfig.stats) {
    const stats = { sourceLabel: "the latest FAOSTAT data", ...resolveStats(rawConfig.stats) };
    const { stats: _drop, ...rest } = rawConfig;
    config = cropStats.fillTemplate(rest, stats);
  }
  const { accentWord, headlineLines = [], subtextLines = [], url } = config;

  const photo = await sharp(photoPath)
    .resize(W, H, { fit: "cover", position: "attention" })
    .toBuffer();

  const headlineSize = 64;
  const headlineLineHeight = 66;
  const accentY = 108;
  const restStartY = accentY + headlineLineHeight;

  const restSvg = headlineLines
    .map(
      (line, i) =>
        `<text x="${LEFT}" y="${restStartY + i * headlineLineHeight}" font-family="DejaVu Sans, sans-serif" font-size="${headlineSize}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`
    )
    .join("\n");

  const underlineY = restStartY + headlineLines.length * headlineLineHeight + 26;

  const subtextStartY = underlineY + 50;
  const subtextLineHeight = 38;
  const subtextSvg = subtextLines
    .map(
      (line, i) =>
        `<text x="${LEFT}" y="${subtextStartY + i * subtextLineHeight}" font-family="DejaVu Sans, sans-serif" font-size="27" fill="#f0f0f0">${escapeXml(line)}</text>`
    )
    .join("\n");

  const scrimHeight = subtextStartY + subtextLines.length * subtextLineHeight + 20;

  const svg = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#000000" stop-opacity="0.72"/>
          <stop offset="0.65" stop-color="#000000" stop-opacity="0.35"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="scrimV" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0.75"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0"/>
        </linearGradient>
        <linearGradient id="bottomScrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0"/>
          <stop offset="1" stop-color="#000000" stop-opacity="0.6"/>
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="${W}" height="${scrimHeight}" fill="url(#scrimV)" />
      <rect x="0" y="0" width="${Math.round(W * 0.62)}" height="${H}" fill="url(#scrim)" />
      <rect x="0" y="${H - 90}" width="${W}" height="90" fill="url(#bottomScrim)" />

      <text x="${LEFT}" y="${accentY}" font-family="DejaVu Sans, sans-serif" font-size="${headlineSize + 6}" font-weight="700" fill="${ACCENT}">${escapeXml(accentWord)}</text>
      ${restSvg}

      <rect x="${LEFT}" y="${underlineY}" width="90" height="6" rx="3" fill="${ACCENT}" />

      ${subtextSvg}

      <circle cx="${LEFT + 12}" cy="${H - 45}" r="12" fill="none" stroke="#ffffff" stroke-width="2" />
      <line x1="${LEFT}" y1="${H - 45}" x2="${LEFT + 24}" y2="${H - 45}" stroke="#ffffff" stroke-width="1.5" />
      <ellipse cx="${LEFT + 12}" cy="${H - 45}" rx="6" ry="12" fill="none" stroke="#ffffff" stroke-width="1.5" />
      <text x="${LEFT + 34}" y="${H - 38}" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="#ffffff">${escapeXml(url)}</text>
    </svg>
  `;

  await sharp(photo)
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , configPath, photoPath, outputPath] = process.argv;
  if (!configPath || !photoPath || !outputPath) {
    console.error("Usage: node scripts/generate-photo-card.mjs <config.json> <photoPath> <outputPath>");
    process.exit(1);
  }
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  generatePhotoCard(config, photoPath, outputPath)
    .then((p) => console.log(`Saved: ${p}`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
