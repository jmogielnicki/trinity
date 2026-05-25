import type { VercelRequest, VercelResponse } from '@vercel/node';
import type Stripe from 'stripe';
import { sql } from './_lib/db';
import { stripe } from './_lib/stripe';

// Stripe signature verification needs the exact raw bytes, so body parsing
// must be off. NOTE: confirm this disables parsing on the current Vercel
// runtime (AUTH_PLAN.md §8 #4); if the body is still pre-parsed, switch this
// handler to the Web (Request) signature and use `await request.text()`.
export const config = { api: { bodyParser: false } };

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * The ONLY thing that grants Pro. Verifies the Stripe signature, then on
 * checkout.session.completed flips the user (by client_reference_id) to 'pro'
 * over the direct DB connection (bypassing RLS). Idempotent.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    res.status(400).json({ error: 'Missing signature or webhook secret' });
    return;
  }

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    event = stripe.webhooks.constructEvent(raw, sig as string, secret);
  } catch (e) {
    res.status(400).json({ error: `Signature verification failed: ${(e as Error).message}` });
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const customerId =
        typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
      if (userId) {
        await sql`
          insert into user_profiles (user_id, subscription_status, stripe_customer_id)
          values (${userId}, 'pro', ${customerId})
          on conflict (user_id) do update
            set subscription_status = 'pro',
                stripe_customer_id = coalesce(excluded.stripe_customer_id, user_profiles.stripe_customer_id)
        `;
      }
    }
    res.status(200).json({ received: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
}
