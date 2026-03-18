import { useQuery } from "@tanstack/react-query";
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
    <Card className="flex flex-col h-full hover:border-blue-500/20 transition-colors">
      <CardHeader className="pb-3 border-b bg-muted/20">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Newspaper size={15} className="text-blue-600 dark:text-blue-400" />
          Market Intelligence: {country}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col pt-4 space-y-4">
        {isLoading ? (
          Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="space-y-2 pb-1 border-b last:border-0 border-border/50">
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
              className="group block space-y-1.5 cursor-pointer pb-3 border-b last:border-0 border-border/50 last:pb-0"
            >
              <h4 className="text-sm font-medium leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-2">
                {item.title?.replace(/ - .*$/, '')}
              </h4>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="font-semibold text-foreground/70">{item.source}</span>
                <span>•</span>
                <span>{item.pubDate ? formatDistanceToNow(new Date(item.pubDate), { addSuffix: true }) : ''}</span>
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
            className="text-[11px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 hover:underline w-fit"
          >
            View all news on Google <ExternalLink size={10} />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
