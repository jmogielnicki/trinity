import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUserId, HttpError } from './_lib/auth.js';
import { getSql } from './_lib/db.js';
import { getStripe } from './_lib/stripe.js';

/**
 * Creates a Stripe Checkout Session for one-time "lifetime Pro".
 * The signed-in user is derived from the verified JWT (never the body); their
 * id rides along as client_reference_id so the webhook can credit the right
 * account. Tax is handled at the account level by Stripe Managed Payments
 * (merchant of record), so no per-session automatic_tax is set.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const sql = getSql();
    const stripe = getStripe();
    const userId = await getUserId(req);

    // Find or create this user's Stripe customer, recorded on their profile.
    const rows = (await sql`
      select stripe_customer_id from user_profiles where user_id = ${userId}
    `) as { stripe_customer_id: string | null }[];
    let customerId = rows[0]?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { user_id: userId } });
      customerId = customer.id;
      await sql`
        insert into user_profiles (user_id, stripe_customer_id)
        values (${userId}, ${customerId})
        on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id
      `;
    }

    const origin = (req.headers.origin as string) || process.env.APP_URL || '';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID ?? '', quantity: 1 }],
      success_url: `${origin}/?upgrade=success`,
      cancel_url: `${origin}/?upgrade=cancelled`,
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    res.status(status).json({ error: (e as Error).message });
  }
}
