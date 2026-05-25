import { create } from 'zustand';
import { neon } from '../auth';

export type SubscriptionStatus = 'free' | 'pro';
export type AuthUser = { id: string; email: string; name?: string };

type AuthState = {
  status: 'loading' | 'anon' | 'authed';
  user: AuthUser | null;
  subscriptionStatus: SubscriptionStatus;
  /** Whether the sign-in/up modal is open. Lifted here so any component
   *  (e.g. a "sign up to save" nudge) can trigger it. */
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  /** Re-read the session (and, from PR4 on, the subscription). */
  refresh: () => Promise<void>;
  /** Returns an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  user: null,
  subscriptionStatus: 'free',
  authModalOpen: false,
  setAuthModalOpen: (authModalOpen) => set({ authModalOpen }),

  refresh: async () => {
    try {
      const { data } = await neon.auth.getSession();
      const u = data?.user;
      if (u) {
        set({
          status: 'authed',
          user: { id: u.id, email: u.email, name: u.name ?? undefined },
        });
        // subscriptionStatus is wired in PR4 (reads public.user_profiles).
        // Until then it stays 'free' — the Pro gate simply won't unlock yet.
      } else {
        set({ status: 'anon', user: null, subscriptionStatus: 'free' });
      }
    } catch {
      set({ status: 'anon', user: null, subscriptionStatus: 'free' });
    }
  },

  signIn: async (email, password) => {
    const { error } = await neon.auth.signIn.email({ email, password });
    if (error) return error.message ?? 'Sign-in failed';
    await get().refresh();
    return null;
  },

  signUp: async (name, email, password) => {
    const { error } = await neon.auth.signUp.email({ name, email, password });
    if (error) return error.message ?? 'Sign-up failed';
    await get().refresh();
    return null;
  },

  signOut: async () => {
    try {
      await neon.auth.signOut();
    } catch {
      // Best-effort: clear local state even if the network call fails.
    }
    set({ status: 'anon', user: null, subscriptionStatus: 'free' });
  },
}));
