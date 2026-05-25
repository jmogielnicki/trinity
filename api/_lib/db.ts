import { neon } from '@neondatabase/serverless';

// Direct (owner) connection used only by the server. This bypasses RLS, which
// is intentional and required: the Stripe webhook must write a user's
// subscription_status, which clients are forbidden to do (see AUTH_PLAN.md §4).
// Uses the HTTP query driver — no WebSocket needed for these one-shot queries.
export const sql = neon(process.env.DATABASE_URL ?? '');
