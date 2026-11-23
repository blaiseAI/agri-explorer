import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Check, Loader2, Terminal, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Web3Forms access keys are public by design: they can only deliver submissions to the
// owner's inbox, so it is safe to ship in client code.
const WEB3FORMS_KEY = "a109978a-e348-40aa-aa3b-ec58adec3133";

const USE_CASES = [
  "Research or academia",
  "Journalism",
  "Agritech product",
  "Finance or investing",
  "AI assistant or agent",
  "Government or NGO",
  "Other",
];

const ACCESS = [
  { value: "REST API", label: "REST API", hint: "JSON over HTTPS, with an API key" },
  { value: "MCP server", label: "MCP server", hint: "For Claude, ChatGPT, Cursor and other AI tools" },
  { value: "Both", label: "Both", hint: "" },
];

// A preview of the planned response shape, with real figures from the current data.
const SAMPLE_REQUEST = `GET https://api.afrixplorer.com/v1/crops/cassava/producers?limit=1
Authorization: Bearer <your key>`;

const SAMPLE_RESPONSE = `{
  "crop": "Cassava",
  "producers": 39,
  "data": [{
    "country": "Nigeria",
    "iso3": "NGA",
    "rank": 1,
    "production_t": 62624900,
    "yield_t_per_ha": 5.84,
    "area_ha": 10722500,
    "share_of_africa": 0.281,
    "growth_since_2010": 0.472
  }],
  "source": "FAOSTAT (CC BY 4.0)"
}`;

type Status = "idle" | "sending" | "done" | "error";

export default function DevelopersPage() {
  useEffect(() => {
    document.title = "African Crop Data API & MCP Server | Afrixplorer";
  }, []);

  const [useCase, setUseCase] = useState("");
  const [access, setAccess] = useState("Both");
  const [status, setStatus] = useState<Status>("idle");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    // Hidden honeypot: people leave it empty, bots fill it in.
    if (form.get("botcheck")) return;
    setStatus("sending");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: `API waitlist: ${form.get("email")} (${access})`,
          from_name: "Afrixplorer API waitlist",
          name: form.get("name") || "(not given)",
          email: form.get("email"),
          access,
          use_case: useCase || "(not given)",
          message: form.get("message") || "(none)",
        }),
      });
      const json = await res.json().catch(() => ({}));
      setStatus(res.ok && json.success ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="max-w-5xl space-y-12">
      <div className="space-y-3 max-w-2xl">
        <p className="font-mono text-xs tracking-[0.08em] text-muted-foreground">Coming soon · Join the waitlist</p>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">African crop data, as an API and an MCP server</h1>
        <p className="text-muted-foreground leading-relaxed">
          Production, yield, harvested area and growth for 54 African countries and 136 crops, from FAOSTAT and the World Bank.
          It's the same data as this site, cleaned up, with names instead of codes and one unit per field. Query it from your code,
          or let Claude, ChatGPT or Cursor look it up for you.
        </p>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* What it will look like */}
        <div className="space-y-8 min-w-0">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Terminal size={15} aria-hidden="true" /> REST API
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Every country, crop and ranking on the site as JSON, with an API key. Here's a preview of a response with today's figures.
              The final shape may change.
            </p>
            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"><code>{SAMPLE_REQUEST}</code></pre>
            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs leading-relaxed"><code>{SAMPLE_RESPONSE}</code></pre>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Bot size={15} aria-hidden="true" /> MCP server
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Add Afrixplorer to Claude, ChatGPT or Cursor and ask questions in plain language. The answers come from the live data,
              with the source credited.
            </p>
            <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">You:</span> Which African country gets the most cassava per hectare,
                and how does Nigeria compare?
              </p>
              <p className="text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Assistant:</span> Among large producers, Ghana leads at about 25.9 t/ha.
                Nigeria grows the most cassava in Africa (63M t) but gets about 5.8 t/ha, so Ghana gets roughly 4× more from each
                hectare. <span className="text-xs">(Source: FAOSTAT via Afrixplorer)</span>
              </p>
            </div>
          </section>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Data from FAOSTAT and the World Bank, both CC BY 4.0. See <Link href="/about" className="text-primary underline underline-offset-2 hover:no-underline">About the data</Link> for
            sources and methodology.
          </p>
        </div>

        {/* The waitlist */}
        <div className="order-first lg:order-none rounded-xl border bg-card p-5 sm:p-6 lg:sticky lg:top-20">
          {status === "done" ? (
            <div className="space-y-3 py-6 text-center" role="status">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check size={20} aria-hidden="true" />
              </div>
              <h2 className="font-semibold">You're on the list</h2>
              <p className="text-sm text-muted-foreground">
                I'll email you when early access opens. You can browse the data on the site in the meantime.
              </p>
              <Link href="/crops" className="inline-block text-sm text-primary underline underline-offset-2 hover:no-underline">
                Browse crops
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5">
              <div className="space-y-1">
                <h2 className="font-semibold">Get early access</h2>
                <p className="text-sm text-muted-foreground">Free for early users. One email when it's ready, nothing else.</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wl-email">Email</Label>
                <Input id="wl-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wl-name">
                  Name <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input id="wl-name" name="name" autoComplete="name" />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium mb-2">What do you want?</legend>
                <RadioGroup value={access} onValueChange={setAccess} className="gap-2">
                  {ACCESS.map((a) => (
                    <Label
                      key={a.value}
                      htmlFor={`wl-${a.value}`}
                      className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-primary/60 has-[[data-state=checked]]:bg-primary/5"
                    >
                      <RadioGroupItem id={`wl-${a.value}`} value={a.value} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">{a.label}</span>
                        {a.hint && <span className="block text-xs text-muted-foreground">{a.hint}</span>}
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>

              <div className="space-y-1.5">
                <Label htmlFor="wl-use">What would you build?</Label>
                <Select value={useCase} onValueChange={setUseCase}>
                  <SelectTrigger id="wl-use" aria-label="What would you build?">
                    <SelectValue placeholder="Choose one" />
                  </SelectTrigger>
                  <SelectContent>
                    {USE_CASES.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wl-msg">
                  Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Textarea id="wl-msg" name="message" rows={3} placeholder="The data you need, how often, how many requests…" />
              </div>

              {/* Honeypot, hidden from people and screen readers */}
              <input type="checkbox" name="botcheck" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

              {status === "error" && (
                <p className="text-sm text-red-700" role="alert">
                  That didn't go through. Please try again, or email afrixplorerbiz@gmail.com.
                </p>
              )}

              <Button type="submit" className="w-full" disabled={status === "sending"}>
                {status === "sending" ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" aria-hidden="true" /> Joining…
                  </>
                ) : (
                  "Join the waitlist"
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Your email is used only to contact you about API access. See the{" "}
                <Link href="/privacy" className="text-primary underline underline-offset-2 hover:no-underline">
                  privacy policy
                </Link>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
