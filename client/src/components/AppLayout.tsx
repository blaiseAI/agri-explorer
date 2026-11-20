import { Link, useLocation } from "wouter";
import { useTheme } from "./ThemeProvider";
import { Sun, Moon, BarChart3, Globe, Wheat, Sparkles, LogIn, LogOut, User, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useMonetization } from "@/hooks/useMonetization";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: BarChart3 },
  { href: "/countries", label: "Countries", icon: Globe },
  { href: "/crops", label: "Crops", icon: Wheat },
  { href: "/pricing", label: "Pricing", icon: Sparkles },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const { user, isLoading, isAuthenticated, signOut } = useAuth();
  const { isMonetizationEnabled } = useMonetization();

  const handleSignOut = async () => {
    await signOut();
    setLocation("/sign-in");
  };

  const getInitials = (name: string | undefined | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer -ml-1" data-testid="logo-link">
              <img src="/logo.png" alt="Afrixplorer logo" width={48} height={48} className="object-contain scale-[2.2] ml-3" title="Afrixplorer" />
              <span className="font-bold text-xl tracking-tight ml-3">Afrixplorer</span>
            </div>
          </Link>

          <nav className="hidden sm:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              if (item.href === "/pricing" && !isMonetizationEnabled) return null;
              
              const isActive = item.href === "/"
                ? location === "/"
                : item.href === "/countries"
                  ? location.startsWith("/countr")
                  : item.href === "/crops"
                    ? location.startsWith("/crop")
                    : location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                    data-testid={`nav-${item.label.toLowerCase()}`}
                  >
                    <item.icon size={15} />
                    {item.label}
                  </button>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {!isMonetizationEnabled ? null : isLoading ? (
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            ) : isAuthenticated && user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8" aria-label="User profile menu">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {getInitials(user.name)}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2" disabled>
                    <User size={14} />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-destructive" onClick={handleSignOut}>
                    <LogOut size={14} />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link href="/sign-in">
                <Button variant="outline" size="sm" className="gap-1.5 hidden sm:flex">
                  <LogIn size={14} />
                  Sign In
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8 relative z-10 shrink-0"
              data-testid="theme-toggle"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </div>
        </div>
      </header>

      {/* At least a screen tall so the footer starts below the fold and does not jump as content loads (CLS). */}
      <main className="flex-1 min-h-[100svh]">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 pb-12">
          {children}
        </div>
      </main>

      <footer className="mt-auto border-t bg-muted/20 overflow-hidden">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-14 md:pt-20">
          {/* Facts line + entry points */}
          <div className="flex flex-col items-center text-center gap-5">
            <p className="font-mono text-[11px] sm:text-xs tracking-[0.08em] text-muted-foreground">
              54 countries · 136 crops · FAOSTAT &amp; World Bank<span className="hidden sm:inline"> · refreshed every two weeks</span>
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href="/countries"
                className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Globe size={14} aria-hidden="true" /> Browse countries
              </Link>
              <Link
                href="/crops"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Wheat size={14} aria-hidden="true" /> Browse crops
              </Link>
            </div>
          </div>

          {/* Brand + links */}
          <div className="mt-14 md:mt-20 flex flex-col md:flex-row md:items-center md:justify-between gap-5 text-sm">
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <img src="/logo.png" alt="" width={18} height={18} className="object-contain scale-125" />
              <span>
                <span className="font-semibold text-foreground">Afrixplorer</span> · African crop data, country by country
              </span>
            </div>
            <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-muted-foreground">
              <Link href="/countries" className="hover:text-foreground transition-colors">Countries</Link>
              <Link href="/crops" className="hover:text-foreground transition-colors">Crops</Link>
              <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
              {isMonetizationEnabled && (
                <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
              )}
              <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            </nav>
          </div>

          <p className="mt-6 max-w-3xl text-[11px] leading-relaxed text-muted-foreground">
            Afrixplorer surfaces agricultural data signals for research and exploration, not financial advice. Data from FAOSTAT, the World Bank and UN Comtrade is processed in bulk and may contain omissions or inaccuracies; always do your own due diligence before making investment decisions.
          </p>

          <div className="mt-6 pt-5 border-t border-border/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} Afrixplorer</p>
            <a
              href="https://blaiseai.github.io/portfolio/"
              target="_blank"
              rel="noopener"
              className="hover:text-foreground transition-colors"
            >
              Created by <span className="font-medium text-foreground">Blaise</span> ↗
            </a>
          </div>

          {/* Oversized wordmark — decorative; an SVG so it always spans the width exactly */}
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 1000 175"
            className="block w-full mt-8 -mb-[2%] select-none pointer-events-none text-foreground"
          >
            <defs>
              <linearGradient id="footer-wordmark-fade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.09" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <text
              x="0"
              y="138"
              textLength="1000"
              lengthAdjust="spacingAndGlyphs"
              fontSize="178"
              fontWeight="600"
              letterSpacing="-4"
              fill="url(#footer-wordmark-fade)"
            >
              Afrixplorer
            </text>
          </svg>
        </div>
      </footer>
    </div>
  );
}
