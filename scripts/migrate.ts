/**
 * Migration runner. Applies `scripts/migrations/*.sql` in filename order
 * against DATABASE_URL, once each, tracked in `migrations.applied`.
 *
 *   DATABASE_URL=postgres://… npm run db:migrate
 *
 * Uses a direct (owner) connection — the owner bypasses RLS, so it can create
 * tables/policies the `authenticated` Data API role can't. The bookkeeping
 * table lives in a non-`public` schema so the Data API never exposes it.
 * Each file runs in its own transaction; a failure rolls back and aborts.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

// The serverless driver needs a WebSocket implementation in Node.
neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set. Provide it inline or via your shell env, e.g.\n' +
      '  DATABASE_URL="postgres://…" npm run db:migrate',
  );
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    await pool.query('create schema if not exists migrations');
    await pool.query(
      `create table if not exists migrations.applied (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );

    const { rows } = await pool.query<{ name: string }>('select name from migrations.applied');
    const applied = new Set(rows.map((r) => r.name));

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip   ${file}`);
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(sql);
        await client.query('insert into migrations.applied (name) values ($1)', [file]);
        await client.query('commit');
        console.log(`apply  ${file} ✓`);
        ran++;
      } catch (err) {
        await client.query('rollback');
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      } finally {
        client.release();
      }
    }
    console.log(ran === 0 ? 'Up to date — nothing to apply.' : `Applied ${ran} migration(s).`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
