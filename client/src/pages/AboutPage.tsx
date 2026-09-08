import { useEffect } from "react";
import { Link } from "wouter";
import { Database, Mail } from "lucide-react";

export default function AboutPage() {
  useEffect(() => {
    document.title = "About Afrixplorer — Methodology & Data Sources | Afrixplorer";
  }, []);

  return (
    <div className="max-w-2xl space-y-10">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">About Afrixplorer</h1>
        <p className="text-sm text-muted-foreground">
          What this platform is, where the data comes from, and how it's maintained.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Mission</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Afrixplorer surfaces agricultural production, yield, and trade data for 54 African countries and 136 crops,
          in a form that's actually usable for research, investment screening, and journalism — not buried in a
          government statistical portal. The underlying data (FAOSTAT, World Bank, UN Comtrade) is public, but rarely
          presented at the country×crop granularity, with historical trends and cross-country comparison, that this
          site provides.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Methodology</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Production, yield, and area figures are sourced directly from FAOSTAT's bulk data exports and refreshed on
          a biweekly schedule. Trade values combine FAOSTAT's Trade (TCL) dataset with UN Comtrade for export
          destination detail. Economic and governance indicators (agricultural GDP share, rural population, political
          stability, logistics performance) come from World Bank Open Data. Producer prices blend FAOSTAT producer
          prices with WFP food price data as a fallback where FAOSTAT data is stale, clearly flagged as an estimate
          wherever that substitution happens.
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          "Investment signal" scores and insight text (growth, yield-gap, opportunity, trade, warning) are generated
          programmatically from the underlying time-series data using a fixed, documented scoring formula — not by a
          human analyst, and not by a language model. They are directional signals for further research, not
          investment advice. See the <Link href="/terms" className="text-primary hover:underline">Terms of Service</Link> for
          the full disclaimer.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Data Sources</h2>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <Database size={14} className="mt-0.5 shrink-0" />
            <span><strong className="text-foreground">FAOSTAT</strong> (Food and Agriculture Organization of the United Nations) — crop production, yields, area harvested, producer prices, and trade values.</span>
          </li>
          <li className="flex items-start gap-2">
            <Database size={14} className="mt-0.5 shrink-0" />
            <span><strong className="text-foreground">World Bank Open Data</strong> — agricultural GDP share, rural population, employment, political stability, and logistics indicators.</span>
          </li>
          <li className="flex items-start gap-2">
            <Database size={14} className="mt-0.5 shrink-0" />
            <span><strong className="text-foreground">UN Comtrade</strong> — bilateral trade flow data used as a supplementary source for export destinations.</span>
          </li>
          <li className="flex items-start gap-2">
            <Database size={14} className="mt-0.5 shrink-0" />
            <span><strong className="text-foreground">WFP (World Food Programme)</strong> — food price data, used as a fallback where FAOSTAT producer prices are unavailable or stale.</span>
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Who's behind this</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Afrixplorer is built and maintained by Blaise Sebagabo.
        </p>
        <a href="mailto:afrixplorerbiz@gmail.com" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <Mail size={14} />
          afrixplorerbiz@gmail.com
        </a>
      </section>
    </div>
  );
}
