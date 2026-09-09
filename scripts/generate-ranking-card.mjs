#!/usr/bin/env node
/**
 * Generates a branded, on-brand ranking-card PNG (1080x1350, Instagram/X portrait
 * format) for a crop's top producers, pulled straight from global_crop_rankings.
 * Programmatic SVG -> PNG via sharp, so it can never have AI-image tells
 * (warped text, wrong flags, extra fingers) -- it's just vector shapes and text.
 *
 * Usage: node scripts/generate-ranking-card.mjs <Crop> [outputPath]
 * Example: node scripts/generate-ranking-card.mjs Cocoa /tmp/cocoa-card.png
 */
import Database from "better-sqlite3";
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "server", "data", "afrixplorer.db");
const LOGO_PATH = path.join(__dirname, "..", "client", "public", "logo.png");

const RANK_BADGE_COLORS = ["#e8b93f", "#c9c9c9", "#b5793a", "#2f6b41", "#2f6b41", "#2f6b41", "#2f6b41"];

export async function generateRankingCard(crop, outputPath, { topN = 7 } = {}) {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare(
      "SELECT country, code, production, year FROM global_crop_rankings WHERE crop = ? ORDER BY rank LIMIT ?"
    )
    .all(crop, topN);
  const { total } = db
    .prepare("SELECT SUM(production) AS total FROM global_crop_rankings WHERE crop = ?")
    .get(crop);
  db.close();

  if (rows.length === 0) {
    throw new Error(`No ranking data found for crop "${crop}"`);
  }

  const topSum = rows.reduce((s, r) => s + r.production, 0);
  const rest = Math.max(total - topSum, 0);
  const year = rows[0].year;
  const maxVal = rows[0].production;

  const W = 1080;
  const H = 1350;
  const LEFT = 60;
  const RIGHT = W - 60;
  const TOP = 430;
  const ROW_H = 92;
  const GAP = 14;
  const BAR_X = 500;
  const BAR_MAX = 340;
  const VALUE_X = RIGHT - 20;

  const fmt = (v) => v.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  const rowsSvg = rows
    .map((r, i) => {
      const y = TOP + i * (ROW_H + GAP);
      const barW = (r.production / maxVal) * BAR_MAX;
      const code = r.code || "";
      return `
        <g>
          <rect x="${LEFT}" y="${y}" width="${RIGHT - LEFT}" height="${ROW_H}" rx="16" fill="#0f4a37" />
          <circle cx="${LEFT + 52}" cy="${y + ROW_H / 2}" r="28" fill="${RANK_BADGE_COLORS[i] || "#2f6b41"}" />
          <text x="${LEFT + 52}" y="${y + ROW_H / 2 + 10}" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#0b3d2e" text-anchor="middle">${i + 1}</text>
          <text x="${LEFT + 104}" y="${y + 34}" font-family="Georgia, serif" font-size="17" font-weight="700" letter-spacing="1.5" fill="#8fd6b4">${code}</text>
          <text x="${LEFT + 104}" y="${y + 64}" font-family="Georgia, serif" font-size="30" font-weight="700" fill="#faf6ee">${r.country}</text>
          <rect x="${BAR_X}" y="${y + ROW_H / 2 - 8}" width="${BAR_MAX}" height="16" rx="8" fill="#134a37" />
          <rect x="${BAR_X}" y="${y + ROW_H / 2 - 8}" width="${Math.max(barW, 10)}" height="16" rx="8" fill="${i === 0 ? "#e8b93f" : "#4caf7d"}" />
          <text x="${VALUE_X}" y="${y + ROW_H / 2 + 8}" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#faf6ee" text-anchor="end">${fmt(r.production)}K</text>
        </g>
      `;
    })
    .join("");

  const restY = TOP + rows.length * (ROW_H + GAP) + 10;
  const cropLower = crop.toLowerCase();

  const svg = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0b3d2e"/>
          <stop offset="1" stop-color="#05201780"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="#06231a" />
      <rect width="${W}" height="${H}" fill="url(#bg)" />

      <text x="60" y="110" font-family="Georgia, serif" font-size="58" font-weight="700" fill="#faf6ee">Where the world's</text>
      <text x="60" y="180" font-family="Georgia, serif" font-size="58" font-weight="700" fill="#8fd6b4">${cropLower} comes from</text>
      <text x="60" y="222" font-family="Georgia, serif" font-size="24" fill="#6fa88f">Production, thousand tonnes, ${year}</text>

      <rect x="60" y="250" width="${RIGHT - LEFT}" height="150" rx="16" fill="#0f4a37" />
      <text x="90" y="300" font-family="Georgia, serif" font-size="22" fill="#8fd6b4">${rows[0].country} produced ${fmt(rows[0].production)}K tonnes in ${year},</text>
      <text x="90" y="332" font-family="Georgia, serif" font-size="22" fill="#8fd6b4">the world's top ${cropLower} producer</text>
      <text x="90" y="378" font-family="Georgia, serif" font-size="36" font-weight="700" fill="#e8b93f">Top ${rows.length}: ${fmt(topSum)}K t &#183; Rest of world: ${fmt(rest)}K t</text>

      ${rowsSvg}

      <rect x="60" y="${restY}" width="${RIGHT - LEFT}" height="72" rx="16" fill="#134a37" stroke="#2f6b41" stroke-width="2" />
      <text x="104" y="${restY + 46}" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#c9d9d1">Rest of world (ranks ${rows.length + 1}&#8211;30)</text>
      <text x="${VALUE_X}" y="${restY + 46}" font-family="Georgia, serif" font-size="26" font-weight="700" fill="#c9d9d1" text-anchor="end">${fmt(rest)}K</text>

      <text x="60" y="${H - 70}" font-family="Georgia, serif" font-size="18" fill="#5a8f78">Source: FAOSTAT, ${year} production data</text>
      <text x="60" y="${H - 40}" font-family="Georgia, serif" font-size="22" font-weight="700" fill="#faf6ee">afrixplorer.com</text>
      <text x="${RIGHT}" y="${H - 40}" font-family="Georgia, serif" font-size="22" font-weight="700" fill="#faf6ee" text-anchor="end">@afrixplorer</text>
    </svg>
  `;

  const logo = await sharp(LOGO_PATH)
    .extract({ left: 300, top: 300, width: 430, height: 430 })
    .resize(64, 64)
    .toBuffer();

  await sharp(Buffer.from(svg))
    .composite([{ input: logo, left: RIGHT - 220, top: H - 78 }])
    .png()
    .toFile(outputPath);

  return outputPath;
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , crop, outputPath] = process.argv;
  if (!crop) {
    console.error("Usage: node scripts/generate-ranking-card.mjs <Crop> [outputPath]");
    process.exit(1);
  }
  const out = outputPath || path.join(process.cwd(), `${crop.toLowerCase().replace(/\s+/g, "-")}-ranking-card.png`);
  generateRankingCard(crop, out)
    .then((p) => console.log(`Saved: ${p}`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
