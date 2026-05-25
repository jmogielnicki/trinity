import { neon } from '@neondatabase/serverless';

// Direct (owner) connection used only by the server. Bypasses RLS, which is
// required: the Stripe webhook writes a user's subscription_status, which
// clients are forbidden to do (AUTH_PLAN.md §4). HTTP query driver — no
// WebSocket needed for these one-shot queries.
//
// Built lazily so a missing/invalid DATABASE_URL surfaces as a catchable error
// inside the handler (clean JSON 500) instead of throwing at import time, which
// crashes the whole function as an opaque FUNCTION_INVOCATION_FAILED.
let cached: ReturnType<typeof neon> | null = null;

export function getSql(): ReturnType<typeof neon> {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    cached = neon(url);
  }
  return cached;
}
