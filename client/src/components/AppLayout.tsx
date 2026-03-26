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

      <main className="flex-1">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 pb-12">
          {children}
        </div>
      </main>

      <footer className="border-t mt-auto bg-muted/20">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-12 md:py-16">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
            {/* Branding & Disclaimer */}
            <div className="md:col-span-3 space-y-4">
              <div className="flex items-center gap-2.5 font-bold text-foreground">
                <img src="/logo.png" alt="" width={22} height={22} className="object-contain scale-125" />
                <span className="text-lg tracking-tight">Afrixplorer</span>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Afrixplorer surfaces agricultural data signals to support research and exploration, not to provide financial advice. While we strive to ensure our data—sourced from FAOSTAT, the World Bank, and UN Comtrade—is complete and accurate, the complex nature of processing global agricultural datasets means we cannot be held liable for any omissions or inaccuracies. Always conduct independent due diligence before making investment decisions.
              </p>
            </div>

            {/* Links & Attribution */}
            <div className="flex flex-col gap-4 text-sm font-medium md:items-end md:text-right">
              {isMonetizationEnabled && (
                <Link href="/pricing" className="text-muted-foreground hover:text-primary transition-colors">
                  Pricing
                </Link>
              )}
              <span className="text-muted-foreground">Created by Blaise</span>
            </div>
          </div>
          
          <div className="mt-12 pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-muted-foreground/60">
            <p>&copy; {new Date().getFullYear()} Afrixplorer. All rights reserved.</p>
            <p>Data sources: FAOSTAT, World Bank, UN Comtrade.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
