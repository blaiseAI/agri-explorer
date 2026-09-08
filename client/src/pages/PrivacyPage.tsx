import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function PrivacyPage() {
  useEffect(() => {
    document.title = "Privacy Policy | Afrixplorer";
  }, []);

  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: September 8, 2026</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          This document is a general-purpose template describing current data practices and has not been reviewed by
          a lawyer. The operator is based in Alberta, Canada, so Canada's federal privacy law (PIPEDA) is the primary
          relevant framework, alongside GDPR/CCPA for users in the EU or California. Have this reviewed by qualified
          counsel before relying on it.
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">1. What We Collect</h2>
        <p className="text-sm leading-relaxed text-muted-foreground"><strong className="text-foreground">Account data.</strong> If you create an account, we collect your name, email address, and a hashed password (we never store your password in plain text).</p>
        <p className="text-sm leading-relaxed text-muted-foreground"><strong className="text-foreground">Usage analytics.</strong> We use Google Analytics to understand how visitors use the Service (pages viewed, general location, device type). This is aggregate usage data, not tied to your account unless you're signed in.</p>
        <p className="text-sm leading-relaxed text-muted-foreground"><strong className="text-foreground">Payment data.</strong> Paid billing is not yet active on the Service. If introduced, payment card details will be handled directly by a PCI-compliant payment processor (e.g. Stripe) — we do not store card numbers ourselves.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">2. How We Use It</h2>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>To create and maintain your account and authenticate you when you sign in</li>
          <li>To understand aggregate usage patterns and improve the Service</li>
          <li>To respond to support requests sent to hello@afrixplorer.io</li>
          <li>To send account-related communications (e.g. password resets) — we do not send marketing email unless you separately opt in</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">3. Third Parties</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We use the following third-party services, each of which processes data under its own privacy policy:
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li><strong className="text-foreground">Google Analytics</strong> — usage analytics</li>
          <li><strong className="text-foreground">Convex / better-auth</strong> — account authentication and data storage infrastructure</li>
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We do not sell your personal data to third parties.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">4. Cookies</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We use cookies/local storage for authentication sessions and Google Analytics uses its own cookies for
          usage tracking. You can block cookies in your browser settings, though this may affect sign-in
          functionality.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">5. Data Retention</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We retain account data for as long as your account is active. You can request deletion of your account and
          associated personal data at any time by emailing hello@afrixplorer.io.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">6. Your Rights</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          You may request access to, correction of, or deletion of your personal data by contacting
          hello@afrixplorer.io. Under Canada's PIPEDA, you have the right to know what personal information we hold
          about you and to request its correction. Depending on your own jurisdiction, you may have additional
          rights (e.g. data portability, objection to processing) under laws such as GDPR or CCPA.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">7. Children's Privacy</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          The Service is not directed at children under 13, and we do not knowingly collect personal data from
          children under 13.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">8. Changes to This Policy</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          We may update this Privacy Policy from time to time. Material changes will be reflected by updating the
          "Last updated" date above.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">9. Contact</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Questions about this Privacy Policy or your data: <a href="mailto:hello@afrixplorer.io" className="text-primary hover:underline">hello@afrixplorer.io</a>
        </p>
      </section>
    </div>
  );
}
