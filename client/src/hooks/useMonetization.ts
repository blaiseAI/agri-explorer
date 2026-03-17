import { useAuth } from "./useAuth";

export function useMonetization() {
  const isMonetizationEnabled = import.meta.env.VITE_ENABLE_MONETIZATION === 'true';
  const { user } = useAuth();
  
  // If monetization is off, everyone gets 'pro' access. 
  // If on, check the user's actual tier in the database.
  // Note: user.tier isn't populated yet, but we'll add it later. For now we assume 'free' if enabled.
  const isPro = !isMonetizationEnabled || (user as any)?.tier === 'pro';
  
  return { isMonetizationEnabled, isPro };
}
