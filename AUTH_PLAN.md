# AUTH_PLAN.md — Freemium / Auth / Payments implementation plan

> **Status:** Approved plan, not yet implemented. Execute in the PR order below.
> **Audience:** Coding agents and humans picking this up cold, with no access to the
> design conversation that produced it. Everything needed is in this file.

---

## 0. TL;DR for an executing agent

We are turning this client-only retirement-calculator SPA into a three-tier freemium app:

- **Anonymous** — full calculator/simulator; scenarios save to `localStorage` only (today's behavior, kept).
- **Free account** — can save scenarios to the cloud (Neon Postgres via the Neon Data API).
- **Pro account** — one-time lifetime payment (Stripe) unlocks the advanced tools (Study/Optimize, Evolve). **This gate is cosmetic** (see §2).

**Architecture decisions already made — do not re-litigate:**

1. **Identity:** Neon Auth (Beta, built on **Better Auth**). Email/password first; **no router needed** for that. OAuth is a later add-on that *does* need a route.
2. **Scenario storage:** **Neon Data API + Row-Level Security (RLS)**, called directly from the browser via `@neondatabase/neon-js`. **No `/api/scenarios` serverless functions** — RLS is the security boundary. (This intentionally diverges from an earlier draft that proposed REST endpoints.)
3. **Payments:** Stripe **one-time payment** (`mode: 'payment'`), lifetime Pro. Only `checkout.session.completed` matters — no subscription-lifecycle webhooks.
4. **Serverless functions exist only for Stripe** (`/api/create-checkout`, `/api/stripe-webhook`), deployed on Vercel.
5. **Anonymous users keep local-only saves**, with a nudge to sign up so they don't lose them.
6. **No ORM (no Prisma, no Drizzle).** Schema/RLS is raw SQL in a checked-in, versioned migration; client reads/writes go through the Neon Data API; the Stripe functions use `@neondatabase/serverless` with raw SQL. Rationale: two tables + two policies don't justify an ORM, the client never uses one (Data API), and RLS is more auditable as plain `CREATE POLICY` than as ORM helpers. (Client-side query typing, if wanted later, comes from Neon's Data API type generator — still no ORM.)

**Do these PRs in order:** PR1 → PR2 → PR3 → PR4 → PR5. Each is independently shippable.

---

## 1. Current codebase (what exists today)

- **Stack:** Vite + React 18 + TypeScript, Zustand 5, D3 + Highcharts, Tailwind v4. Static SPA, **no backend, no router, no auth**. Deployed to Vercel as a static build. Heavy compute runs client-side in Web Workers (Comlink).
- **Build:** `npm run build` = `tsc -b && vite build`. Tests: `npm test` (Vitest, engine tests in `tests/engine/`).
- **Navigation:** `App.tsx` holds `type TopMode = 'single' | 'optimize' | 'evolve' | 'compare'` in `useState` — **not** URL routing. Scenario state is mirrored into the URL **hash** only.
- **Repo:** `jmogielnicki/trinity`. GitHub interactions use the `mcp__github__*` tools (no `gh` CLI in the web environment).

### Files you will touch (with their current roles)

| File | Current role | Why it matters here |
|---|---|---|
| `src/store/libraryStore.ts` | Zustand store; **localStorage**-backed named scenarios. Key `trinity:scenarios`. `SavedScenario = { id, name, state: SerializedState, savedAt }`. Sync `save(name, state)` / `remove(id)`, capped at 50. | Becomes source-agnostic (local vs cloud). **PR3.** |
| `src/data/urlState.ts` | Defines `SerializedState` (the canonical scenario blob) + `serialize`/`tryDeserialize`/`gateCustomSrc`. | This is exactly the JSON we store in `saved_scenarios.state` (jsonb). No engine changes needed. |
| `src/components/SaveScenarioModal.tsx` | Builds a `SerializedState` and calls `useLibraryStore().save(name, …)`. | Save entry point; auth-gate + async. **PR3.** |
| `src/components/controls/ScenarioLibrary.tsx` | Lists saved scenarios (left rail), `onLoad` applies to scenario+sweep stores, `remove`. | Async list/remove + sign-up nudge. **PR3.** |
| `src/components/optimize/FrontierView.tsx` | "Study / optimize" advanced tool. Has `saveVariant` (~L208) calling `saveToLibrary`. | Pro-gated; `saveVariant` becomes async. **PR3/PR4.** |
| `src/components/optimize/StudyConfigPanel.tsx` | Config UI for the study. | Pro-gated controls. **PR4.** |
| `src/components/evolve/EvolveView.tsx` | "Evolve" advanced tool (genetic algorithm). | Pro-gated. **PR4.** |
| `src/App.tsx` | Top-level layout + nav + header. Save buttons in header (~L213), desktop sidebar footer (~L308), and mobile FAB (~L351). `?`/About button (~L221). | Header is where sign-in / account / Upgrade UI goes. |
| `src/main.tsx` | React root render. | Where the Neon client / provider is wired. **PR1.** |
| `package.json` | Deps. No router, no auth, no stripe. | Add deps per PR. |
| `tsconfig.json` | `include: ["src","scripts","tests"]`, `types: ["node","vite/client"]`. | `api/` needs its own tsconfig (PR5). |
| `.gitignore` | **Has no `.env*` entry.** | Add `.env*` in PR1. |
| `vercel.json` | Does not exist. | Add in PR5. |

### `SerializedState` (the blob we persist) — from `src/data/urlState.ts`

```ts
export type SerializedState = {
  initialBalance: number;
  horizonYears: number;
  allocation: AllocationStrategy;
  withdrawal: WithdrawalStrategy;
  axes: Record<Axis, AxisMode>;
  tailMethod?: TailMethod;
  withdrawalSource?: WithdrawalSource;
  view?: string;
};
```

**`customSrc` caveat:** allocation/withdrawal may be `{ type: 'customSrc', src: <JS string> }`, evaluated via `new Function` in the browser. We only ever serve a user **their own** blobs back, and the existing load-time `gateCustomSrc()` confirm prompt stays. Do not relax that. Never render one user's `customSrc` for another user.

---

## 2. The cosmetic-paywall caveat (read before PR4)

The advanced tools (Study/Optimize, Evolve) run **entirely client-side in Web Workers**. The JS is already shipped to every visitor. Therefore a React-level "Pro" gate is **cosmetic** — a determined user can bypass it. This was an explicit, accepted product decision: we disable the controls and show "Upgrade to Pro," and that's enough for now.

**Implication for PR4:** Do **not** pretend `subscriptionStatus` is a security boundary. It drives UX only. The only genuinely enforced thing is *cloud save* (gated by auth + RLS) and *the Pro flag itself* (written only by the Stripe webhook). Do not move compute server-side.

---

## 3. Neon Auth + Data API facts (verified against Neon docs, Beta)

- **One SDK package:** `@neondatabase/neon-js`.
  - Full client: `createClient({ auth: { url }, dataApi: { url } })` → `client.auth.*` + `client.from('table').*`.
  - Auth-only: `createAuthClient(url)`.
  - React hooks adapter exists: `import { BetterAuthReactAdapter } from '@neondatabase/neon-js/auth/react/adapters'` → gives `useSession()`. (Vanilla adapter uses `getSession()` in an effect; either is fine — we centralize in a Zustand `authStore`.)
- **Env vars (client, must be `VITE_`-prefixed):** `VITE_NEON_AUTH_URL`, `VITE_NEON_DATA_API_URL`. Values come from the Neon Console (Auth page → Configuration tab; Data API page → API tab).
- **Auth methods:** `auth.signUp.email({ name, email, password })`, `auth.signIn.email({ email, password })`, `auth.signOut()`, `auth.getSession()` → `{ data: { session, user } }`. Also email-OTP and `auth.requestPasswordReset()`. **OAuth:** `auth.signIn.social({ provider, callbackURL })` — *redirects*, so it needs a callback route (deferred; see §8).
- **Users sync to `neon_auth.user`.** Auth data lives in the DB and is RLS-compatible.
- **JWT:** `getSession()` yields the session; the bearer JWT carries a **`sub` claim = user id**. JWTs expire ~15 min and are auto-refreshed by the SDK. The Data API client injects the token automatically on every query when signed in.
- **RLS helper `auth.user_id()`** extracts `sub` from the JWT inside Postgres policies. Set ownership columns to `DEFAULT (auth.user_id())` so clients never send a user id.
- **Data API is enabled per branch** (Console → Data API → enable, check "Use Neon Auth"). Tables must be in an **exposed schema (`public`)**, have **RLS enabled**, and be granted to the **`authenticated`** role.
- **After any DDL, refresh the schema cache** (Console "Refresh schema cache" button, or `PATCH /projects/{id}/branches/{branch}/data-api/{db}` with `{}`). Forgetting this is the #1 "my new table 404s" gotcha.
- **Constraints:** Neon Auth/Data API are AWS-regions only and not supported with IP Allow or Private Networking. Beta.
- **Setup helper:** `npx neonctl@latest init` wires the Neon MCP server + Agent Skills; MCP tools `provision_neon_auth`, `configure_neon_auth`, `provision_neon_data_api` can enable/configure programmatically. You can also do it all in the Console.

---

## 4. Security rules every agent MUST follow

1. **`user_profiles` is READ-ONLY to clients.** It has a `SELECT`-only RLS policy and **no** insert/update/delete policy → RLS denies client writes. If a user could write `user_profiles`, they could set `subscription_status='pro'` for free. `subscription_status`/`stripe_customer_id` are mutated **only** by the Stripe functions via a **direct `DATABASE_URL` connection** (which bypasses RLS). Do **not** add a write policy for `authenticated` on `user_profiles`, and if you use the Console's blanket "grant public schema access," ensure writes to `user_profiles` are still blocked (RLS with no write policy already blocks them; optionally also `REVOKE INSERT, UPDATE, DELETE ON public.user_profiles FROM authenticated`).
2. **Ownership columns default to `auth.user_id()`** — never accept a `user_id` from the client body.
3. **In `/api/create-checkout`, never trust a client-supplied user id.** Validate the bearer JWT server-side (JWKS) and use its `sub` claim as `client_reference_id`.
4. **The Stripe webhook is the only thing that grants Pro.** Verify the Stripe signature against the **raw** request body; make the handler idempotent.
5. **Secrets are server-only.** `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` must **never** carry a `VITE_` prefix (that ships them to the browser). Only publishable/URL values get `VITE_`.
6. **`customSrc` blobs:** never serve one user's blob to another; keep the load-time confirm gate.

---

## 5. Database schema + RLS (PR2 — copy verbatim)

Run in the Neon SQL Editor (or a migration) on the target branch, then **refresh the schema cache**.

```sql
-- ============ saved_scenarios: full CRUD over OWN rows (Free-tier feature) ============
create table public.saved_scenarios (
  id        bigint generated by default as identity primary key,
  user_id   text not null default (auth.user_id()),
  name      text not null,
  state     jsonb not null,                       -- a SerializedState blob (see §1)
  saved_at  timestamptz not null default now()
);
alter table public.saved_scenarios enable row level security;

create policy manage_own_scenarios on public.saved_scenarios
  for all to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

create index saved_scenarios_user_idx on public.saved_scenarios (user_id, saved_at desc);

-- ============ user_profiles: client may READ its own row ONLY ============
-- No write policy => RLS denies all client writes. subscription_status and
-- stripe_customer_id are written solely by the Stripe functions over a direct
-- DATABASE_URL connection (bypasses RLS). See §4 rule 1.
create table public.user_profiles (
  user_id             text primary key default (auth.user_id()),
  subscription_status text not null default 'free',   -- 'free' | 'pro'
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);
alter table public.user_profiles enable row level security;

create policy read_own_profile on public.user_profiles
  for select to authenticated
  using (auth.user_id() = user_id);

-- Defense in depth (optional; RLS already blocks writes with no write policy):
-- revoke insert, update, delete on public.user_profiles from authenticated;
```

**No profile-creation trigger is needed.** The client only ever *reads* `user_profiles` and treats "no row" as `'free'`. The Stripe webhook *upserts* the row when granting Pro.

---

## 6. Environment variables (final set)

| Variable | Scope | Prefix | Purpose |
|---|---|---|---|
| `VITE_NEON_AUTH_URL` | client | `VITE_` | Neon Auth base URL (sign-in/up/session) |
| `VITE_NEON_DATA_API_URL` | client | `VITE_` | Neon Data API REST endpoint |
| `VITE_STRIPE_PUBLISHABLE_KEY` | client | `VITE_` | (only if using Stripe.js client-side) |
| `DATABASE_URL` | server (Vercel fn) | none | Direct Postgres connection for the webhook/checkout (bypasses RLS) |
| `STRIPE_SECRET_KEY` | server | none | Stripe API |
| `STRIPE_WEBHOOK_SECRET` | server | none | Verify webhook signatures |
| `STRIPE_PRICE_ID` | server | none | The one-time Price for lifetime Pro |
| `NEON_AUTH_JWKS_URL` (or issuer) | server | none | Validate the bearer JWT in create-checkout (confirm exact value; see §8) |

Add `.env*` to `.gitignore` (PR1) and commit a `.env.example` documenting these.

---

## 7. PR-by-PR plan

> Conventions for **every** PR (from `AGENTS.md`): small focused branch off `main` named `claude/<topic>`; concise commit explaining *why*; open a PR via `mcp__github__create_pull_request` against `main` with a **Test plan** checklist; squash-merge. UI cannot be browser-tested in the web environment — write **"visual not run"** in the PR description for any UI change. Add a Vitest test when you add non-trivial logic.

### PR1 — Enable Neon Auth + Data API; client + auth state + email sign-in

**Goal:** A signed-in identity exists; nothing else changes for anonymous users.

Steps:
1. In the Neon Console (or via `npx neonctl@latest init` + MCP): enable **Auth** and the **Data API** on the branch; check "Use Neon Auth" on the Data API. Copy the Auth Base URL and Data API URL.
2. Add `.env*` to `.gitignore`; add `.env.example` with the `VITE_*` vars from §6; set the real values in `.env.local` and in Vercel project env.
3. `npm install @neondatabase/neon-js`.
4. Create `src/auth.ts` exporting a configured client:
   ```ts
   import { createClient } from '@neondatabase/neon-js';
   export const neon = createClient({
     auth:    { url: import.meta.env.VITE_NEON_AUTH_URL },
     dataApi: { url: import.meta.env.VITE_NEON_DATA_API_URL },
   });
   ```
5. Create `src/store/authStore.ts` (Zustand): `{ status: 'loading'|'anon'|'authed', user: {...}|null, subscriptionStatus: 'free'|'pro', signInEmail, signUpEmail, signOut, refresh }`. On app init call `neon.auth.getSession()` to hydrate; `subscriptionStatus` stays `'free'` until PR4 wires the read. Keep the SDK as the source of truth; the store is a thin cache. (Check the SDK for an auth-change subscription; otherwise refresh after sign-in/out.)
6. Hydrate `authStore` once in `src/main.tsx` (or an effect in `App.tsx`).
7. Build a minimal **email/password** sign-in/up UI (modal or small page) — own components, per the React quickstart pattern; **no router** (email flow does not redirect). Add a sign-in button + account/sign-out menu in the `App.tsx` header next to the Save button (~L213) and the `?` button (~L221).

**Acceptance / test plan:**
- [ ] Anonymous app works exactly as before (calculator, local saves).
- [ ] Can sign up, sign in, sign out; header reflects state; refresh persists session.
- [ ] No secrets in client bundle; `.env*` gitignored.
- [ ] "visual not run" noted in PR.

### PR2 — Schema + RLS

**Goal:** Cloud tables exist and are secured.

Steps:
1. Put the SQL from **§5** in a checked-in, versioned migration `scripts/migrations/0001_auth.sql` and add a small `npm run db:migrate` tsx runner (raw SQL over `@neondatabase/serverless`, applied in filename order). No ORM — see §0 decision 6. (Applying §5 once via the Neon SQL Editor is fine for the very first run, but the migration file is the source of truth.)
2. **Refresh the Data API schema cache** (§3).
3. Manually verify policies with two test users (Console Auth API reference UI → get JWTs → query the Data API): each user can only see/insert their own `saved_scenarios`; neither can write `user_profiles`.

**Acceptance / test plan:**
- [ ] `saved_scenarios` and `user_profiles` exist in `public` with RLS enabled.
- [ ] User A cannot read or write User B's `saved_scenarios`.
- [ ] An authenticated client `UPDATE`/`INSERT` on `user_profiles` is **rejected**.
- [ ] Schema cache refreshed (Data API returns the new tables).

### PR3 — Cloud scenarios via Data API + libraryStore refactor + anon nudge + migration

**Goal:** Authenticated users save/load/delete scenarios in the cloud; anonymous users keep localStorage with a nudge.

Steps:
1. Introduce a repository seam. Define `ScenarioRepo { list(): Promise<SavedScenario[]>; save(name, state): Promise<void>; remove(id): Promise<void> }`.
   - `LocalRepo` — today's `libraryStore` localStorage logic, unchanged behavior.
   - `DataApiRepo` — `neon.from('saved_scenarios').select('*').order('saved_at', {ascending:false})` / `.insert({ name, state })` / `.delete().eq('id', id)`. **Do not send `user_id`** (DB defaults it via `auth.user_id()`). Note `id` is `bigint` in the cloud vs `string` UUID locally — normalize `SavedScenario.id` to `string` in the store.
2. Convert `libraryStore` to async and source-aware: `source: 'local'|'cloud'`, `loading`, `error`. Select `DataApiRepo` when `authStore.status==='authed'`, else `LocalRepo`. Refresh the list on auth changes.
3. Update consumers for async: `SaveScenarioModal.tsx`, `ScenarioLibrary.tsx`, and `FrontierView.saveVariant` (~L208 — replace the `window.prompt` flow's persistence call; keep the prompt or improve as you like).
4. **Auth-gate the save action:** in the save entry points, if anonymous, allow the existing local save **and** show a nudge ("Sign up to save permanently so you don't lose these"). Optionally offer "Sign in to save to the cloud" which opens the PR1 auth UI, then completes the save against `DataApiRepo`.
5. **First-login migration:** when a user transitions anon→authed and has local scenarios, offer a one-time "Upload your N local scenarios to your account?" → bulk `insert`. After upload, treat cloud as source of truth (don't dual-write).

**Acceptance / test plan:**
- [ ] Anonymous: save/load/delete still hit localStorage; nudge visible.
- [ ] Authed: save/load/delete hit the Data API; survive reload and a different browser.
- [ ] First sign-in offers to migrate local scenarios; declining leaves them local.
- [ ] Unit test the repo-selection logic and the local↔cloud `SavedScenario` normalization.
- [ ] "visual not run" noted.

### PR4 — subscriptionStatus + cosmetic Pro gate

**Goal:** UI reflects Pro and gates the advanced tabs (cosmetically — see §2).

Steps:
1. In `authStore.refresh()`, after sign-in read the profile: `neon.from('user_profiles').select('subscription_status').single()`; on empty/no-row, default `'free'`. Store as `subscriptionStatus`.
2. Gate the advanced UIs: in `FrontierView.tsx`, `StudyConfigPanel.tsx`, and `EvolveView.tsx`, when `subscriptionStatus !== 'pro'`, disable the advanced controls and render an **"Upgrade to Pro"** button. Add a brief code comment noting the gate is cosmetic by design.
3. The Upgrade button is wired to checkout in PR5; for now it can open a placeholder or be disabled.

**Acceptance / test plan:**
- [ ] Free user sees disabled advanced controls + Upgrade button on the Optimize and Evolve tabs.
- [ ] A user whose `user_profiles.subscription_status` is manually set to `'pro'` (via SQL) sees full access.
- [ ] No console errors when `user_profiles` has no row (defaults to free).
- [ ] "visual not run" noted.

### PR5 — Stripe (the only serverless functions)

**Goal:** Pay once → become Pro.

Prereqs in Stripe dashboard: create a **one-time Price** (`STRIPE_PRICE_ID`); **activate Stripe Tax**; create the webhook endpoint → copy `STRIPE_WEBHOOK_SECRET`.

Steps:
1. Add `vercel.json`: route `/api/*` to functions; rewrite everything else to `/index.html` (SPA). Add an `api/tsconfig.json` (node types) so `api/` typechecks — the root `tsconfig` only includes `src/scripts/tests`.
2. `npm install stripe` and (for the direct DB connection) `@neondatabase/serverless`; add `jose` for JWT verification.
3. Set server env vars from §6 in Vercel (no `VITE_` prefix).
4. `api/_lib/db.ts` — direct Postgres client from `DATABASE_URL` (bypasses RLS; used by both functions).
5. `api/_lib/auth.ts` — `getUserId(req)`: read `Authorization: Bearer <jwt>`, verify via `jose` against `NEON_AUTH_JWKS_URL` (confirm the exact JWKS/issuer in the Console — see §8), return the `sub` claim. Throw 401 otherwise.
6. `POST /api/create-checkout`:
   - `userId = await getUserId(req)`.
   - Upsert `user_profiles(user_id)` if missing; ensure a Stripe customer (create if no `stripe_customer_id`, store it).
   - Create a Checkout Session: `mode: 'payment'`, `line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }]`, `client_reference_id: userId`, `customer: <id>`, `automatic_tax: { enabled: true }`, address collection required (Stripe Tax needs an address), `success_url` / `cancel_url` back to the app.
   - Return `{ url }`. Frontend redirects; on return, call `authStore.refresh()`.
7. `POST /api/stripe-webhook`:
   - **Disable Vercel body parsing** and read the **raw** body; `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`.
   - On `checkout.session.completed`: read `client_reference_id` (= user id), and `upsert user_profiles set subscription_status='pro', stripe_customer_id=<customer>` over the direct connection. Idempotent (re-delivery safe).
   - Return 200 quickly; log and 400 on signature failure.
8. Wire the PR4 "Upgrade to Pro" button to call `/api/create-checkout` (sending the bearer JWT from `neon.auth.getSession()`), then `window.location = url`.

**Acceptance / test plan:**
- [ ] Stripe CLI `stripe listen` + `stripe trigger checkout.session.completed` flips a user to `'pro'` in `user_profiles`.
- [ ] Webhook rejects bad signatures; duplicate deliveries don't double-process.
- [ ] `create-checkout` rejects requests with no/invalid JWT (401) and never reads a user id from the body.
- [ ] End-to-end (test mode): Upgrade → Stripe Checkout → return → advanced tabs unlocked after `refresh()`.
- [ ] Tax line appears for an EU billing address.
- [ ] "visual not run" noted.

---

## 8. Open items to confirm during execution (non-blocking for PR1–PR4)

1. **`NEON_AUTH_JWKS_URL` / issuer** for verifying the bearer JWT in `create-checkout` (PR5). The Data API confirms standard `sub`-claim JWTs, so JWKS verification is correct; grab the exact JWKS endpoint from the Console's Auth/Data API settings. Alternative: forward the token to the hosted Auth `/get-session` endpoint and trust its response.
2. **OAuth (deferred):** `auth.signIn.social({ provider, callbackURL })` redirects, so adding Google/GitHub later requires (a) a router + a `/auth/callback` route, and (b) configuring the provider + trusted redirect domains in Neon Auth. Email/password and email-OTP do **not** need this.
3. **SDK auth-change subscription:** check whether `@neondatabase/neon-js` exposes an `onAuthStateChange`-style listener to keep `authStore` in sync across tabs; if not, refresh on focus / after auth actions.
4. **Vercel raw-body mechanism** for the webhook (function `config` export / `bodyParser:false` equivalent for the runtime you choose) — confirm against current Vercel docs.

---

## 9. Definition of done (whole feature)

- Anonymous users: unchanged calculator + local saves + a sign-up nudge.
- Free users: cloud-saved scenarios, isolated per user by RLS; local scenarios migratable on first sign-in.
- Pro users: one-time payment unlocks the advanced tabs (cosmetic gate); Pro is granted only by the verified Stripe webhook.
- No secret keys in the client bundle; `user_profiles` not client-writable; create-checkout never trusts client-supplied identity.
- Each phase shipped as its own squash-merged PR with a Test plan and a "visual not run" note for UI changes.
