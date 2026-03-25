import { Request, Response } from "express";
import sharp from "sharp";

export async function generateOGImage(req: Request, res: Response) {
  try {
    const title = (req.query.title as string) || "Afrixplorer";
    const subtitle = (req.query.subtitle as string) || "African Agricultural Data Platform";
    
    // Sanitize to prevent basic XSS breaking the XML or malicious input
    const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeSubtitle = subtitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const svg = `
      <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#09090b" />
            <stop offset="100%" stop-color="#18181b" />
          </linearGradient>
          <linearGradient id="primary" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#34d399" />
          </linearGradient>
        </defs>
        
        <!-- Background -->
        <rect width="1200" height="630" fill="url(#bg)" />
        
        <!-- Background Grid Pattern -->
        <path d="M 0 0 L 1200 630 M 0 630 L 1200 0" stroke="#ffffff" stroke-opacity="0.02" stroke-width="40" />
        <rect width="1120" height="550" x="40" y="40" fill="none" stroke="url(#primary)" stroke-width="2" stroke-opacity="0.3" rx="16" />

        <!-- Top branding -->
        <g transform="translate(80, 100)">
          <!-- Abstract chart icon mimicking the Afrixplorer logo -->
          <rect x="0" y="24" width="12" height="24" fill="url(#primary)" rx="4"/>
          <rect x="20" y="12" width="12" height="36" fill="url(#primary)" rx="4"/>
          <rect x="40" y="0" width="12" height="48" fill="url(#primary)" rx="4"/>
          
          <text x="70" y="38" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="bold" fill="#ffffff" letter-spacing="-1">Afrixplorer</text>
        </g>

        <!-- Main Content -->
        <g transform="translate(80, 360)">
          <text x="0" y="0" font-family="system-ui, -apple-system, sans-serif" font-size="72" font-weight="900" fill="#ffffff" letter-spacing="-2">
            ${safeTitle}
          </text>
          <text x="0" y="70" font-family="system-ui, -apple-system, sans-serif" font-size="36" font-weight="500" fill="#a1a1aa">
            ${safeSubtitle}
          </text>
        </g>
        
        <!-- Footer / Data Source -->
        <g transform="translate(80, 530)">
          <rect x="0" y="-25" width="220" height="36" fill="#18181b" stroke="#27272a" stroke-width="2" rx="18" />
          <text x="110" y="0" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="600" fill="#d4d4d8" text-anchor="middle">
            LIVE DATA UPDATED
          </text>
        </g>
      </svg>
    `;

    const pngBuffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=43200");
    res.send(pngBuffer);
  } catch (err) {
    console.error("Failed to generate OG image:", err);
    res.status(500).send("Internal Server Error");
  }
}
