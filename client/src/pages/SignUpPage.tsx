import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Mail, Lock, User, Chrome, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !password || !confirm) {
      toast({ title: "Error", description: "Please fill in all fields.", variant: "destructive" });
      return;
    }
    if (password !== confirm) {
      toast({ title: "Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters.", variant: "destructive" });
      return;
    }
    if (!terms) {
      toast({ title: "Error", description: "Please accept the Terms of Service.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const result = await authClient.signUp.email({
        email,
        password,
        name,
      });
      if (result.error) {
        toast({
          title: "Sign Up Failed",
          description: result.error.message || "Could not create account. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Account created!", description: "Welcome to Afrixplorer. You're now signed in." });
        setLocation("/");
      }
    } catch (err: any) {
      toast({
        title: "Sign Up Failed",
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
        title: "Google Sign-Up",
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
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Start exploring African agriculture data</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="Jane Doe"
                  className="pl-9"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="signup-email">Email</Label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="signup-email"
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
              <Label htmlFor="signup-password">Password</Label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-9"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                id="terms"
                checked={terms}
                onCheckedChange={(v) => setTerms(v as boolean)}
                className="mt-0.5"
              />
              <Label htmlFor="terms" className="text-xs text-muted-foreground font-normal leading-snug">
                I agree to the Terms of Service and Privacy Policy
              </Label>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Creating account…
                </>
              ) : (
                "Create Account"
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
            Already have an account?{" "}
            <Link href="/sign-in" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
