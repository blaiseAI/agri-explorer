import { getMetadata } from "./data";

/**
 * Memoise an expensive, deterministic computation until the data changes.
 * The data only changes when the bi-weekly refresh rewrites the database
 * (bumping metadata.lastUpdated); the calendar year is part of the key because
 * some insights compare against the current year.
 */
export function cachedByDataVersion<T>(
  compute: () => T,
  version: () => string = () => `${getMetadata().lastUpdated}|${new Date().getFullYear()}`,
): () => T {
  let cache: { key: string; value: T } | null = null;
  return () => {
    const key = version();
    if (!cache || cache.key !== key) cache = { key, value: compute() };
    return cache.value;
  };
}
