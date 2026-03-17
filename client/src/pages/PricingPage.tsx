import { useState } from "react";
import { Link } from "wouter";
import { Check, Sparkles, Building2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";

const PLANS = [
  {
    name: "Free",
    description: "Explore African agriculture data",
    monthlyPrice: 0,
    annualPrice: 0,
    cta: "Explore Free",
    ctaVariant: "outline" as const,
    href: "/",
    features: [
      { text: "Overview dashboard", included: true },
      { text: "Country & crop lists", included: true },
      { text: "Latest year data", included: true },
      { text: "Top 5 crop comparisons", included: true },
      { text: "Full time series", included: false },
      { text: "Trade data", included: false },
      { text: "Investment signals", included: false },
      { text: "CSV export", included: false },
    ],
  },
  {
    name: "Pro",
    description: "Full data access for professionals",
    monthlyPrice: 15,
    annualPrice: 120,
    cta: "Start Pro",
    ctaVariant: "default" as const,
    popular: true,
    features: [
      { text: "Everything in Free", included: true },
      { text: "Full time series history", included: true },
      { text: "All 54 country comparisons", included: true },
      { text: "Trade data & analytics", included: true },
      { text: "Investment signals", included: true },
      { text: "CSV data export", included: true },
      { text: "Saved dashboards", included: true },
      { text: "Email alerts", included: true },
    ],
  },
  {
    name: "Enterprise",
    description: "For organizations & teams",
    monthlyPrice: 79,
    annualPrice: 790,
    cta: "Contact Us",
    ctaVariant: "outline" as const,
    features: [
      { text: "Everything in Pro", included: true },
      { text: "API access with keys", included: true },
      { text: "Team seats & management", included: true },
      { text: "Custom reports", included: true },
      { text: "Priority support", included: true },
      { text: "Data webhook feeds", included: true },
      { text: "SLA guarantee", included: true },
      { text: "Dedicated account manager", included: true },
    ],
  },
];

const FAQ = [
  {
    q: "What data sources does AgriScope use?",
    a: "We aggregate data from FAOSTAT (crop production, yields, area harvested), the World Bank (economic indicators), and UN Comtrade (trade flows). All data is refreshed weekly.",
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Yes, you can cancel anytime. You'll retain access to Pro features until the end of your billing period. No questions asked.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards through Stripe. Enterprise customers can also pay via invoice.",
  },
  {
    q: "Is there a free trial for Pro?",
    a: "The Free plan gives you a generous preview of the platform. If you need to evaluate Pro features before committing, contact us for a 14-day trial.",
  },
  {
    q: "How many countries and crops do you cover?",
    a: "AgriScope covers 54 African countries and 136+ crops with data spanning from 2010 to the present.",
  },
];

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const { toast } = useToast();

  const handleSubscribe = (plan: string) => {
    if (plan === "Free") return;
    if (plan === "Enterprise") {
      window.location.href = "mailto:hello@agriscope.io?subject=Enterprise%20Inquiry";
      return;
    }
    toast({
      title: "Coming Soon",
      description: "Subscription billing will be available shortly. Stay tuned!",
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-12">
      {/* Header */}
      <div className="text-center space-y-3">
        <Badge variant="secondary" className="gap-1">
          <Sparkles size={12} />
          Pricing
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Simple, transparent pricing
        </h1>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Start free, upgrade when you need deeper insights. All plans include full
          access to our overview dashboard and country data.
        </p>
      </div>

      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm ${!annual ? "font-medium" : "text-muted-foreground"}`}>Monthly</span>
        <Switch checked={annual} onCheckedChange={setAnnual} />
        <span className={`text-sm ${annual ? "font-medium" : "text-muted-foreground"}`}>
          Annual
          <Badge variant="secondary" className="ml-1.5 text-[10px]">Save 33%</Badge>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const price = annual ? Math.round(plan.annualPrice / 12) : plan.monthlyPrice;
          return (
            <Card
              key={plan.name}
              className={`relative flex flex-col ${
                plan.popular
                  ? "border-primary shadow-lg ring-1 ring-primary/20"
                  : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="shadow-sm">Most Popular</Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <div className="flex items-center gap-2">
                  {plan.name === "Enterprise" && <Building2 size={18} className="text-muted-foreground" />}
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                </div>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold">${price}</span>
                  <span className="text-muted-foreground text-sm">/mo</span>
                  {annual && plan.annualPrice > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      (${plan.annualPrice}/yr)
                    </span>
                  )}
                </div>
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2 text-sm">
                      {f.included ? (
                        <Check size={16} className="text-primary shrink-0 mt-0.5" />
                      ) : (
                        <X size={16} className="text-muted-foreground/40 shrink-0 mt-0.5" />
                      )}
                      <span className={f.included ? "" : "text-muted-foreground/60"}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                {plan.href ? (
                  <Link href={plan.href} className="w-full">
                    <Button variant={plan.ctaVariant} className="w-full">
                      {plan.cta}
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant={plan.ctaVariant}
                    className="w-full"
                    onClick={() => handleSubscribe(plan.name)}
                  >
                    {plan.cta}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* FAQ */}
      <div className="max-w-2xl mx-auto space-y-4">
        <h2 className="text-xl font-semibold text-center">Frequently Asked Questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-sm text-left">{item.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
