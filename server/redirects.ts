import type { Request, Response, NextFunction } from "express";
import { resolveCountry, resolveCrop } from "./resolve";

/**
 * 301-redirects non-canonical country/crop identifiers to their canonical form
 * (ISO3 code for countries, exact stored casing for crops) before the request
 * reaches SEO injection or the SPA catch-all. Unknown identifiers fall through
 * unchanged so the existing 404 handling in server/seo.ts's isKnownRoute still applies.
 */
export function canonicalRedirect(req: Request, res: Response, next: NextFunction) {
  const path = req.path;
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "country" && parts.length === 2) {
    const country = resolveCountry(parts[1]);
    if (country && parts[1] !== country.code) {
      return res.redirect(301, `/country/${country.code}${req.url.slice(path.length)}`);
    }
  } else if (parts[0] === "crop" && parts.length === 2) {
    const canonical = resolveCrop(parts[1]);
    if (canonical) {
      const decoded = decodeURIComponent(parts[1]);
      if (decoded !== canonical) {
        return res.redirect(301, `/crop/${encodeURIComponent(canonical)}${req.url.slice(path.length)}`);
      }
    }
  } else if (parts[0] === "explore" && parts.length === 3) {
    const country = resolveCountry(parts[1]);
    const canonicalCrop = resolveCrop(parts[2]);
    if (country && canonicalCrop) {
      const decodedCrop = decodeURIComponent(parts[2]);
      if (parts[1] !== country.code || decodedCrop !== canonicalCrop) {
        return res.redirect(
          301,
          `/explore/${country.code}/${encodeURIComponent(canonicalCrop)}${req.url.slice(path.length)}`
        );
      }
    }
  } else if (parts[0] === "rankings" && parts.length === 2) {
    const canonical = resolveCrop(parts[1]);
    if (canonical) {
      const decoded = decodeURIComponent(parts[1]);
      if (decoded !== canonical) {
        return res.redirect(301, `/rankings/${encodeURIComponent(canonical)}${req.url.slice(path.length)}`);
      }
    }
  }

  next();
}
