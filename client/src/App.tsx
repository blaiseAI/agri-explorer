import { lazy, Suspense } from "react";
import { Switch, Route, Router } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppLayout from "@/components/AppLayout";

// Route-based code splitting
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const CountryView = lazy(() => import("@/pages/CountryView"));
const CropView = lazy(() => import("@/pages/CropView"));
const CropDetail = lazy(() => import("@/pages/CropDetail"));
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const PricingPage = lazy(() => import("@/pages/PricingPage"));
const SignInPage = lazy(() => import("@/pages/SignInPage"));
const SignUpPage = lazy(() => import("@/pages/SignUpPage"));
const NotFound = lazy(() => import("@/pages/not-found"));

function AppRouter() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="flex h-[50vh] w-full items-center justify-center text-muted-foreground">Loading...</div>}>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/welcome" component={LandingPage} />
          <Route path="/pricing" component={PricingPage} />
          <Route path="/sign-in" component={SignInPage} />
          <Route path="/sign-up" component={SignUpPage} />
          <Route path="/countries" component={CountryView} />
          <Route path="/country/:country" component={CountryView} />
          <Route path="/crops" component={CropView} />
          <Route path="/crop/:crop" component={CropView} />
          <Route path="/explore/:country/:crop" component={CropDetail} />
          <Route component={NotFound} />
        </Switch>
      </Suspense>
    </AppLayout>
  );
}

function App() {
  return (
    <ConvexClientProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster />
            <Router>
              <AppRouter />
            </Router>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ConvexClientProvider>
  );
}

export default App;
