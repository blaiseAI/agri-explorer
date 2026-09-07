import { getCountries, getCrops } from "./data";

export interface ResolvedCountry {
  name: string;
  code: string;
  region: string;
}

/** Matches an identifier (ISO3 code or full name, any case) against the known country list. */
export function resolveCountry(identifier: string): ResolvedCountry | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(identifier).toLowerCase();
  } catch {
    decoded = identifier.toLowerCase();
  }
  const countries = getCountries();
  return countries.find(
    (c: ResolvedCountry) => c.code.toLowerCase() === decoded || c.name.toLowerCase() === decoded
  ) || null;
}

/** Matches an identifier (any case) against the known crop list, returning the canonical stored name. */
export function resolveCrop(identifier: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(identifier).toLowerCase();
  } catch {
    decoded = identifier.toLowerCase();
  }
  const crops = getCrops();
  return crops.find((c) => c.toLowerCase() === decoded) || null;
}
