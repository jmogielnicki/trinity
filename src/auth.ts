import { createClient } from '@neondatabase/neon-js';

// URLs come from the Neon Console (Auth → Configuration; Data API → API tab)
// and are injected at build time via Vite env vars. When they're absent (e.g.
// before the project is provisioned), `authConfigured` is false and the UI
// hides all auth entry points so the app still runs in pure anonymous mode.
const authUrl = import.meta.env.VITE_NEON_AUTH_URL ?? '';
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL ?? '';

export const authConfigured = Boolean(authUrl && dataApiUrl);

// Default (vanilla) adapter: auth methods are exposed under `neon.auth.*`
// (e.g. neon.auth.signIn.email) and Data API queries under `neon.from(...)`.
export const neon = createClient({
  auth: { url: authUrl },
  dataApi: { url: dataApiUrl },
});

/**
 * Returns the current Neon Auth JWT (the `sub`-claim bearer) for our own
 * serverless calls like /api/create-checkout. Neon exposes this as
 * getJWTToken(); we look it up defensively because the beta SDK's public types
 * don't surface it on the client instance. Confirm the accessor when wiring
 * Stripe live (AUTH_PLAN.md §8).
 */
export async function getAccessToken(): Promise<string | null> {
  const candidates: Array<{ getJWTToken?: () => Promise<string | null> }> = [
    neon as unknown as { getJWTToken?: () => Promise<string | null> },
    (neon as unknown as { auth?: { getJWTToken?: () => Promise<string | null> } }).auth ?? {},
  ];
  for (const c of candidates) {
    if (typeof c.getJWTToken === 'function') {
      try {
        return await c.getJWTToken();
      } catch {
        return null;
      }
    }
  }
  return null;
}

