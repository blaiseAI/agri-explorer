# RSS News Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate real-time Google News RSS feeds into the Country Page to bridge static agricultural data with live market intelligence.

**Architecture:** A new Express endpoint (`/api/news/:query`) fetches and parses the Google News XML using `rss-parser`, caching the result in-memory for 30 minutes. A new React component (`NewsFeed.tsx`) fetches this data and renders it below the "Top Crops" section in `CountryView.tsx`.

**Tech Stack:** Express, Node.js (`rss-parser`), React, TailwindCSS, `@tanstack/react-query`.

---

## Chunk 1: Backend Endpoint & Caching

**Files:**
- Modify: `package.json` (install dependencies)
- Modify: `server/routes.ts`

- [ ] **Step 1: Install `rss-parser` dependency**

Run: `npm install rss-parser`
Run: `npm install -D @types/rss-parser`

- [ ] **Step 2: Add parsing and caching logic to `server/routes.ts`**

At the top of `server/routes.ts`:
```typescript
import Parser from "rss-parser";

const parser = new Parser();
const newsCache = new Map<string, { timestamp: number; data: any[] }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
```

Inside `export async function registerRoutes(...)` before the `return httpServer;`:
```typescript
  // Get RSS News
  app.get("/api/news/:query", async (req, res) => {
    try {
      const { query } = req.params;
      const now = Date.now();

      // Check cache
      const cached = newsCache.get(query);
      if (cached && (now - cached.timestamp < CACHE_TTL)) {
        return res.json(cached.data);
      }

      // Fetch from Google News
      const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`);
      
      const articles = feed.items.slice(0, 5).map(item => ({
        title: item.title,
        link: item.link,
        source: item.source || item.creator || extractSourceFromTitle(item.title) || 'News',
        pubDate: item.pubDate,
      }));

      // Update cache
      newsCache.set(query, { timestamp: now, data: articles });
      res.json(articles);
    } catch (error) {
      console.error("RSS fetch error:", error);
      res.status(500).json([]); // Graceful fallback
    }
  });

  // Helper for when source isn't explicitly provided by Google News format
  function extractSourceFromTitle(title?: string) {
    if (!title) return null;
    const parts = title.split(' - ');
    return parts.length > 1 ? parts[parts.length - 1] : null;
  }
```

- [ ] **Step 3: Test backend endpoint**
Run: `curl -s "http://localhost:4040/api/news/Uganda+agriculture+investment" | grep -q title && echo "PASS" || echo "FAIL"`
Expected: `PASS` (Wait for the Express dev server to restart after saving).

- [ ] **Step 4: Commit**
```bash
git add package.json package-lock.json server/routes.ts
git commit -m "feat(backend): add /api/news endpoint with rss-parser and caching"
```

## Chunk 2: Frontend Component & Integration

**Files:**
- Create: `client/src/components/NewsFeed.tsx`
- Modify: `client/src/pages/CountryView.tsx`

- [ ] **Step 1: Create `client/src/components/NewsFeed.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function NewsFeed({ query, limit = 3, country }: { query: string; limit?: number; country: string }) {
  const { data: news, isLoading, isError } = useQuery<any[]>({
    queryKey: ["/api/news", query],
    queryFn: () => fetch(`/api/news/${encodeURIComponent(query)}`).then(r => {
      if (!r.ok) throw new Error("Failed to fetch news");
      return r.json();
    }),
    staleTime: 15 * 60 * 1000, // 15 mins client-side
  });

  if (isError) return null; // Silent graceful failure

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Newspaper size={15} className="text-blue-600 dark:text-blue-400" />
          Market Intelligence: {country}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-4">
        {isLoading ? (
          Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))
        ) : (
          news?.slice(0, limit).map((item, i) => (
            <a 
              key={i} 
              href={item.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="group block space-y-1 block cursor-pointer"
            >
              <h4 className="text-sm font-medium leading-tight group-hover:text-primary transition-colors line-clamp-2">
                {item.title?.replace(/ - .*$/, '')}
              </h4>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-medium text-foreground/70">{item.source}</span>
                <span>•</span>
                <span>{item.pubDate ? formatDistanceToNow(new Date(item.pubDate), { addSuffix: true }) : ''}</span>
              </div>
            </a>
          ))
        )}
        
        {!isLoading && news?.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No recent news found.</p>
        )}

        <div className="mt-auto pt-2">
          <a
            href={`https://news.google.com/search?q=${encodeURIComponent(query)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary font-medium flex items-center gap-1 hover:underline w-fit"
          >
            View all news <ExternalLink size={10} />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Add into `client/src/pages/CountryView.tsx`**

1. Import the component at the top:
```tsx
import NewsFeed from "@/components/NewsFeed";
```

2. Locate the "Top Crops for Investment" block (around line 520). Note that the markup for Top Crops is `<div className="space-y-3">...</div>`. Wrap it alongside the news feed into a 2-column CSS Grid.
Replace the opening mapping block of `Top Crops for Investment`:

```tsx
      {/* Top Crops for Investment & News */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-3">
          {topCrops && topCrops.length > 0 && (
            <>
              <h2 className="text-sm font-medium flex items-center gap-2">
                <Trophy size={15} className="text-primary" />
                Top Crops for Investment
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* ... existing topCrops.map loop remains unchanged ... */}
```
And then close it and add the news widget beside it:
```tsx
                {/* end of topCrops.map */}
              </div>
            </>
          )}
        </div>
        
        <div className="xl:col-span-1">
          <NewsFeed query={`${country} agriculture investment`} limit={4} country={country} />
        </div>
      </div>
```
*(Exact line numbers: ~520 through ~565 in `CountryView.tsx`)*

- [ ] **Step 3: Verification**
Open `http://localhost:4040/country/Uganda` in the browser. Verify the "Market Intelligence" card appears on the right of the Top Crops grid, loading states function properly, and it successfully loads ~4 recent news items. Click an item to verify it opens in a new tab.

- [ ] **Step 4: Commit**
```bash
git add client/src/components/NewsFeed.tsx client/src/pages/CountryView.tsx
git commit -m "feat(frontend): integrate live RSS NewsFeed onto Country page"
```
