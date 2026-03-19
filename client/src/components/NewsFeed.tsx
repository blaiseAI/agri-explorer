import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink, Newspaper } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

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
    <Card className="flex flex-col h-full hover:border-primary/20 transition-colors">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Newspaper size={15} className="text-primary" />
          Market Intelligence: {country}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pt-4 space-y-4">
        {isLoading ? (
          Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="space-y-2 pb-3 border-b border-border/80 last:border-0 last:pb-0">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))
        ) : (
          news?.slice(0, limit).map((item, i) => (
            <a 
              key={i} 
              href={item.link} 
              target="_blank" 
              rel="noopener noreferrer"
              className="group block space-y-2 cursor-pointer pb-4 border-b border-border/80 last:border-0 last:pb-0"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 mb-1">
                    {item.category && item.category !== 'MARKETS' && (
                      <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 uppercase font-bold tracking-wider rounded-sm border-transparent ${
                        item.category === 'INVESTMENT' ? 'bg-primary/10 dark:bg-primary/20 text-primary' :
                        item.category === 'TRADE' ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300' :
                        item.category === 'POLICY' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
                        'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}>
                        {item.category}
                      </Badge>
                    )}
                  </div>
                  <h4 className="text-sm font-medium leading-[1.3] group-hover:text-primary object-cover transition-colors line-clamp-2 break-words text-foreground/90">
                    {item.title?.replace(/ - .*$/, '')}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-0.5">
                    <span className="font-semibold text-foreground/70 truncate">{item.source}</span>
                    <span className="shrink-0">•</span>
                    <span className="shrink-0">{item.pubDate ? formatDistanceToNow(new Date(item.pubDate), { addSuffix: true }) : ''}</span>
                  </div>
                </div>
                {item.thumbnail && (
                  <div className="shrink-0 w-16 h-16 rounded overflow-hidden bg-muted/30 border">
                    <img src={item.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
              </div>
            </a>
          ))
        )}
        
        {!isLoading && news?.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No recent news found.</p>
        )}

        <div className="mt-auto pt-3">
          <a
            href={`https://news.google.com/search?q=${encodeURIComponent(query)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-primary font-medium flex items-center gap-1 hover:underline w-fit"
          >
            View all news on Google <ExternalLink size={10} />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
