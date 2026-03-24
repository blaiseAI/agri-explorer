import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Mail, Lock, Chrome, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Error", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
      });
      if (result.error) {
        toast({
          title: "Sign In Failed",
          description: result.error.message || "Invalid credentials. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Welcome back!", description: "You've been signed in successfully." });
        setLocation("/");
      }
    } catch (err: any) {
      toast({
        title: "Sign In Failed",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
    } catch {
      toast({
        title: "Google Sign-In",
        description: "Google sign-in is not configured yet. Please use email/password.",
      });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-12rem)]">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center space-y-1">
          <div className="flex justify-center mb-2">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-primary">
              <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" />
              <path d="M16 6 C16 6 10 12 10 18 C10 22 12.7 25 16 25 C19.3 25 22 22 22 18 C22 12 16 6 16 6Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
              <line x1="16" y1="14" x2="16" y2="25" stroke="currentColor" strokeWidth="1.5" />
              <line x1="16" y1="17" x2="13" y2="15" stroke="currentColor" strokeWidth="1.2" />
              <line x1="16" y1="20" x2="19.5" y2="17.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </div>
          <CardTitle>Sign in to Afrixplorer</CardTitle>
          <CardDescription>Enter your credentials to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() =>
                    toast({ title: "Coming Soon", description: "Password reset will be available shortly." })
                  }
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Signing in…
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="relative my-4">
            <Separator />
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              or
            </span>
          </div>

          <Button variant="outline" className="w-full gap-2" onClick={handleGoogle} disabled={loading}>
            <Chrome size={16} />
            Continue with Google
          </Button>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/sign-up" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
