import { authClient } from "@/lib/auth-client";

/**
 * Custom hook wrapping Better Auth session state.
 * Use this throughout the app for auth state.
 */
export function useAuth() {
  const session = authClient.useSession();

  const isLoading = session.isPending;
  const isAuthenticated = !isLoading && !!session.data?.user;

  const user = session.data?.user ?? null;

  const signOut = async () => {
    await authClient.signOut();
  };

  return {
    user,
    isLoading,
    isAuthenticated,
    signOut,
    session: session.data,
  };
}
