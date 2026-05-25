import { getAccessToken } from './auth';

/**
 * Kicks off the Stripe one-time "lifetime Pro" checkout: authenticates to
 * /api/create-checkout with the Neon Auth bearer token, then redirects the
 * browser to the returned Stripe Checkout URL. On return, the app re-reads
 * the subscription (see the ?upgrade= handling in App.tsx).
 */
export async function startCheckout(): Promise<void> {
  const token = await getAccessToken();
  if (!token) {
    window.alert('Please sign in again to upgrade.');
    return;
  }
  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    window.alert('Could not start checkout. Please try again.');
    return;
  }
  const { url } = (await res.json()) as { url?: string };
  if (url) window.location.assign(url);
}
