import { Link } from "wouter";
import { BarChart3, Globe, TrendingUp, Wheat, ArrowRight, Sparkles, Database, LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  {
    icon: BarChart3,
    title: "Crop Intelligence",
    description: "Production, yield, and area data for 136+ crops across 54 African countries. Track trends from 2010 to present.",
  },
  {
    icon: LineChart,
    title: "Trade Analytics",
    description: "Export values and trade flows from UN Comtrade. Identify market opportunities with real trade data.",
  },
  {
    icon: TrendingUp,
    title: "Investment Signals",
    description: "AI-generated insights highlighting growth opportunities, yield gaps, and emerging agricultural trends.",
  },
];

const STATS = [
  { value: "54", label: "Countries" },
  { value: "136+", label: "Crops" },
  { value: "15", label: "Years of data" },
  { value: "3", label: "Data sources" },
];

const DATA_SOURCES = [
  { name: "FAOSTAT", description: "Production & yields" },
  { name: "World Bank", description: "Economic indicators" },
  { name: "UN Comtrade", description: "Trade flows" },
];

export default function LandingPage() {
  return (
    <div className="space-y-20 py-8">
      {/* Hero */}
      <section className="text-center space-y-6 max-w-3xl mx-auto">
        <Badge variant="secondary" className="gap-1">
          <Database size={12} />
          Open Agricultural Data Platform
        </Badge>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
          African Agriculture{" "}
          <span className="text-primary">Intelligence</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Explore crop production, trade flows, and investment signals across
          54 African countries. Powered by FAOSTAT, World Bank, and UN Comtrade data.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="/">
            <Button size="lg" className="gap-2">
              <Globe size={18} />
              Explore Dashboard
              <ArrowRight size={16} />
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="outline" className="gap-2">
              <Sparkles size={18} />
              View Pricing
            </Button>
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="text-center p-4 rounded-lg bg-card border"
          >
            <div className="text-3xl font-bold text-primary">{stat.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
          </div>
        ))}
      </section>

      {/* Features */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Everything You Need</h2>
          <p className="text-muted-foreground">
            Comprehensive tools for agricultural research, investment, and policy analysis
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <Card key={f.title} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6 space-y-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <f.icon size={20} className="text-primary" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {f.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Data Sources */}
      <section className="text-center space-y-6">
        <h2 className="text-2xl font-bold">Trusted Data Sources</h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          {DATA_SOURCES.map((ds) => (
            <div
              key={ds.name}
              className="flex items-center gap-3 px-5 py-3 rounded-lg bg-card border"
            >
              <Wheat size={20} className="text-primary" />
              <div className="text-left">
                <div className="font-medium text-sm">{ds.name}</div>
                <div className="text-xs text-muted-foreground">{ds.description}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center space-y-4 py-8 rounded-lg bg-primary/5 border border-primary/10">
        <h2 className="text-2xl font-bold">Ready to Explore?</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Start with our free tier — full dashboard access, country overviews, and crop data.
          Upgrade to Pro when you need deeper insights.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/">
            <Button size="lg" className="gap-2">
              Get Started Free
              <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
