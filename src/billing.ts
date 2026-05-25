import { neon } from './auth';

/**
 * Kicks off the Stripe one-time "lifetime Pro" checkout.
 *
 * PR5 implements this fully: POST the Neon Auth bearer token to
 * /api/create-checkout, then redirect to the returned Stripe Checkout URL.
 * Until then it's a visible placeholder so the Pro-gate UX can be exercised.
 */
export async function startCheckout(): Promise<void> {
  // TODO(PR5): replace with the real checkout call, e.g.
  //   const { data } = await neon.auth.getSession();
  //   const token = data?.session?.token;  // exact accessor confirmed in PR5
  //   const res = await fetch('/api/create-checkout', {
  //     method: 'POST',
  //     headers: { Authorization: `Bearer ${token}` },
  //   });
  //   const { url } = await res.json();
  //   window.location.assign(url);
  void neon;
  window.alert('Upgrade to Pro is coming soon.');
}
