import type { Request, Response, NextFunction } from "express";
import { resolveCountry, resolveCrop } from "./resolve";

/**
 * 301-redirects the www subdomain to the apex domain. Both hosts otherwise
 * serve the site independently (canonical tags point to the apex, but that's
 * a weaker signal than an actual redirect and doubles crawl budget spent on
 * the same content). Runs before everything else so it's cheap and applies
 * site-wide, not just to the country/crop/explore/rankings routes below.
 */
export function wwwRedirect(req: Request, res: Response, next: NextFunction) {
  if (req.hostname === "www.afrixplorer.com") {
    return res.redirect(301, `https://afrixplorer.com${req.originalUrl}`);
  }
  next();
}

/**
 * 301-redirects non-canonical URLs to their canonical form in a single hop:
 * trailing slashes are stripped, and country/crop identifiers are normalized
 * (ISO3 code for countries, exact stored casing for crops). Doing both at once
 * avoids redirect chains like /explore/nigeria/cassava/ -> /explore/nigeria/cassava
 * -> /explore/NGA/Cassava. Unknown identifiers are left unchanged so the existing
 * 404 handling in server/seo.ts's isKnownRoute still applies.
 */
export function canonicalRedirect(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  if (path.startsWith("/api/")) return next();

  // Strip trailing slashes so /country/NGA/ and /country/NGA aren't two indexable URLs.
  const stripped = path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
  const canonical = canonicalizeIdentifiers(stripped);

  if (canonical !== path) {
    return res.redirect(301, `${canonical}${req.url.slice(path.length)}`);
  }
  next();
}

/** Returns the path with country/crop segments in canonical form, or unchanged if unrecognized. */
function canonicalizeIdentifiers(path: string): string {
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "country" && parts.length === 2) {
    const country = resolveCountry(parts[1]);
    if (country && parts[1] !== country.code) return `/country/${country.code}`;
  } else if ((parts[0] === "crop" || parts[0] === "rankings") && parts.length === 2) {
    const crop = resolveCrop(parts[1]);
    if (crop && decodeURIComponent(parts[1]) !== crop) return `/${parts[0]}/${encodeURIComponent(crop)}`;
  } else if (parts[0] === "explore" && parts.length === 3) {
    const country = resolveCountry(parts[1]);
    const crop = resolveCrop(parts[2]);
    if (country && crop && (parts[1] !== country.code || decodeURIComponent(parts[2]) !== crop)) {
      return `/explore/${country.code}/${encodeURIComponent(crop)}`;
    }
  }

  return path;
}
