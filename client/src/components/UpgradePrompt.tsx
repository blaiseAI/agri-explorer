import { Link } from "wouter";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface UpgradePromptProps {
  feature: string;
  description?: string;
  children: React.ReactNode;
}

export default function UpgradePrompt({ feature, description, children }: UpgradePromptProps) {
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-[6px] opacity-60">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-background/40 via-background/80 to-background/40 rounded-lg">
        <div className="flex flex-col items-center gap-3 text-center px-6 max-w-sm">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Lock size={18} className="text-primary" />
          </div>
          <Badge variant="secondary" className="gap-1">
            <Sparkles size={12} />
            Pro Feature
          </Badge>
          <p className="text-sm font-medium">{feature}</p>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
          <Link href="/pricing">
            <Button size="sm" className="gap-1.5 mt-1">
              <Sparkles size={14} />
              Upgrade to Pro
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
