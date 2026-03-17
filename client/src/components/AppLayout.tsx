import { Link, useLocation } from "wouter";
import { useTheme } from "./ThemeProvider";
import { PerplexityAttribution } from "./PerplexityAttribution";
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
            <div className="flex items-center gap-2.5 cursor-pointer" data-testid="logo-link">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-label="AgriScope logo" className="text-primary">
                <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" />
                <path d="M16 6 C16 6 10 12 10 18 C10 22 12.7 25 16 25 C19.3 25 22 22 22 18 C22 12 16 6 16 6Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
                <line x1="16" y1="14" x2="16" y2="25" stroke="currentColor" strokeWidth="1.5" />
                <line x1="16" y1="17" x2="13" y2="15" stroke="currentColor" strokeWidth="1.2" />
                <line x1="16" y1="20" x2="19.5" y2="17.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
              <span className="font-semibold text-base tracking-tight">AgriScope</span>
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
                  <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
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
              className="h-8 w-8"
              data-testid="theme-toggle"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 pb-12">
          {children}
        </div>
      </main>

      <footer className="border-t py-6 mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>Data sources: FAOSTAT, World Bank, UN Comtrade. Not financial advice.</p>
            <div className="flex items-center gap-4">
              {isMonetizationEnabled && (
                <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
              )}
              <PerplexityAttribution />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
