import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { timingSafeEqual } from 'node:crypto';

let _sql: NeonQueryFunction<false, false> | null = null;
let _schemaReady: Promise<unknown> | null = null;

export function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = neon(url);
  }
  return _sql;
}

// Creates the table on first use so a fresh Neon database works without a manual migration.
// Mirrors db/schema.sql.
export function ensureSchema() {
  if (!_schemaReady) {
    const sql = getSql();
    _schemaReady = sql`
      CREATE TABLE IF NOT EXISTS battery_records (
        id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        bus_number      TEXT NOT NULL,
        battery         TEXT,
        battery1        TEXT,
        battery1_date   TEXT,
        battery2        TEXT,
        battery2_date   TEXT,
        starter         TEXT,
        starter_date    TEXT,
        alternator      TEXT,
        alternator_date TEXT,
        fan_belt        TEXT,
        fan_belt_date   TEXT,
        note            TEXT,
        history         JSONB  NOT NULL DEFAULT '[]'::jsonb,
        created_at      BIGINT NOT NULL,
        last_updated    BIGINT NOT NULL
      )
    `.catch((err) => {
      _schemaReady = null;
      throw err;
    });
  }
  return _schemaReady;
}

export const RECORD_FIELDS = [
  'busNumber',
  'battery1', 'battery1Date',
  'battery2', 'battery2Date',
  'starter', 'starterDate',
  'alternator', 'alternatorDate',
  'fanBelt', 'fanBeltDate',
  'note',
] as const;

export type RecordInput = Record<(typeof RECORD_FIELDS)[number], string>;

export function parseRecordInput(body: unknown): RecordInput | null {
  if (!body || typeof body !== 'object') return null;
  const src = body as Record<string, unknown>;
  const out = {} as RecordInput;
  for (const key of RECORD_FIELDS) {
    const v = src[key];
    if (v != null && typeof v !== 'string') return null;
    out[key] = typeof v === 'string' ? v.trim() : '';
  }
  if (!out.busNumber) return null;
  return out;
}

export function isAuthorized(request: Request) {
  const expected = process.env.ADMIN_PASSWORD;
  const given = request.headers.get('x-admin-password');
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export function serverError(err: unknown) {
  console.error(err);
  return json({ error: 'Server error' }, 500);
}
