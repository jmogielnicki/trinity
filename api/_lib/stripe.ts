import Stripe from 'stripe';

// Built lazily (see db.ts) so a missing STRIPE_SECRET_KEY surfaces as a
// catchable handler error rather than crashing the function at import time.
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (!cached) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    cached = new Stripe(key);
  }
  return cached;
}
