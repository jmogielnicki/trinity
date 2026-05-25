import type { VercelRequest } from '@vercel/node';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Lazily build the remote JWKS so a missing env var surfaces as a clean 500
// rather than a module-load crash. NEON_AUTH_JWKS_URL comes from the Neon
// Console (Auth/Data API settings) — confirm the exact endpoint when wiring
// live (AUTH_PLAN.md §8).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks) {
    const url = process.env.NEON_AUTH_JWKS_URL;
    if (!url) throw new HttpError(500, 'NEON_AUTH_JWKS_URL is not set');
    jwks = createRemoteJWKSet(new URL(url));
  }
  return jwks;
}

/**
 * Verifies the Neon Auth session JWT from the Authorization header and returns
 * the user id (the `sub` claim). NEVER trust a user id from the request body —
 * the whole point is that identity is derived from a signed token.
 */
export async function getUserId(req: VercelRequest): Promise<string> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing bearer token');
  }
  const token = header.slice('Bearer '.length);
  try {
    const { payload } = await jwtVerify(token, getJwks());
    // TODO(confirm live): optionally pin issuer/audience once their values are
    // known from the Neon Console.
    if (!payload.sub) throw new HttpError(401, 'Token missing sub claim');
    return payload.sub;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, 'Invalid token');
  }
}
