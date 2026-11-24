// One-off copy of the old SQLite database (data/arena.db) and its recording files into Supabase.
//
//   node --disable-warning=ExperimentalWarning --conditions=react-server \
//     scripts/migrate-sqlite-to-supabase.ts --sqlite=data/arena.db --recordings-dir=data/recordings [--dry-run]
//
// Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (and optionally SUPABASE_RECORDINGS_BUCKET,
// default "recordings") in the env, and the migrations in supabase/migrations applied.
//
// What it does, in foreign-key order: users → sessions → responses → recordings (rows keep their
// ids; each recording's file goes to Storage under the same key as its `path` column, before its
// row, so a row never points at a missing object). Then reset_identity_sequences() moves every
// identity sequence past the largest id, and a verify pass re-reads every copied row by id (and
// every copied object) and exits non-zero on any mismatch.
//
// exp1_trials / exp2_trials are NOT copied: they are reseeded from the CSVs with `npm run seed`.
//
// Idempotent: rows are upserted on their primary key with ON CONFLICT DO NOTHING and objects are
// uploaded with upsert:false (an "already exists" answer is fine), so a rerun copies nothing new.
//
// Source quirks it handles:
// - Timestamps: datetime('now') wrote "YYYY-MM-DD HH:MM:SS" (UTC, no zone) and the recordings
//   table wrote ISO with a Z; both become proper UTC ISO strings.
// - responses could hold duplicate (participant, session, round) rows (the old UNIQUE index fell
//   back to a plain one); Postgres has a real constraint, so the lowest id wins and the rest are
//   skipped and reported.
// - A recording row whose file is missing on disk is reported and SKIPPED: copying it would make
//   the Record tab list audio that can never play, and the row carries nothing else of value.
// - Sessions / recordings whose user_id has no user row (only possible if foreign keys were ever
//   off) are reported and skipped, since Postgres enforces the FK.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase, recordingsBucket } from '../lib/db/client.ts';

const BATCH = 500;
/** Ids per `.in('id', …)` filter: keeps the PostgREST URL well under its length limit. */
const ID_CHUNK = 200;

type Row = Record<string, unknown>;
type MigratedTable = 'users' | 'sessions' | 'responses' | 'recordings';
const TABLES: MigratedTable[] = ['users', 'sessions', 'responses', 'recordings'];

const COLUMNS: Record<MigratedTable, string[]> = {
  users: ['id', 'google_sub', 'email', 'name', 'created_at'],
  sessions: ['token_hash', 'user_id', 'created_at', 'expires_at'],
  responses: [
    'id', 'participant', 'session', 'round', 'experiment', 'model', 'clip', 'condition', 'variant', 'take',
    'naturalness', 'human_or_ai', 'question_answered', 'intended_question', 'interpretation',
    'intended_interpretation', 'listened_ms', 'created_at',
  ],
  recordings: ['id', 'user_id', 'experiment', 'prompt_id', 'created_at', 'mime', 'path', 'size'],
};
const PK: Record<MigratedTable, 'id' | 'token_hash'> = {
  users: 'id',
  sessions: 'token_hash',
  responses: 'id',
  recordings: 'id',
};

export interface MigrateOptions {
  sqlitePath: string;
  recordingsDir: string;
  dryRun?: boolean;
  /** Defaults to getSupabase() (service role, from the env). */
  supabase?: SupabaseClient;
  /** Defaults to SUPABASE_RECORDINGS_BUCKET or "recordings". */
  bucket?: string;
  /** Defaults to console.log. Pass () => {} to silence. */
  log?: (line: string) => void;
}

export interface TableReport {
  source: number;
  /** Source rows that are meant to land in Supabase (source minus skipped). */
  toCopy: number;
  /** Of those, already present in Supabase (by primary key) before this run. */
  alreadyPresent: number;
  /** Copied by this run (or, in a dry run, that would be). */
  copied: number;
  skipped: number;
}

export interface MigrateResult {
  dryRun: boolean;
  tables: Record<MigratedTable, TableReport>;
  /** Ids of responses dropped as duplicates of a lower id with the same (participant, session, round). */
  duplicateResponseIds: number[];
  /** Recording rows skipped because their file is not on disk (or their path escapes the dir). */
  missingRecordingFiles: { id: number; path: string }[];
  /** Sessions / recordings skipped because their user_id has no user row in the source. */
  orphans: { table: 'sessions' | 'recordings'; key: string | number; userId: number }[];
  objects: { toCopy: number; alreadyPresent: number; uploaded: number };
  /** Verify failures after a real run (empty = verified). Always empty for a dry run. */
  mismatches: string[];
}

// ---------------------------------------------------------------- helpers

/** "YYYY-MM-DD HH:MM:SS[.fff]" (SQLite datetime, UTC) or any ISO string → UTC ISO with a Z. */
export function toUtcIso(value: unknown): string {
  if (typeof value !== 'string' || value === '') throw new Error(`not a timestamp: ${String(value)}`);
  let s = value.trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable timestamp: ${value}`);
  return d.toISOString();
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function fail(what: string, error: { message: string; code?: string }): never {
  throw new Error(`${what}: ${error.message}${error.code ? ` (${error.code})` : ''}`);
}

function readTable(db: DatabaseSync, table: MigratedTable): Row[] {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
  if (!exists) return [];
  const present = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
  const order = PK[table] === 'id' ? 'id' : 'rowid';
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all() as Row[];
  return rows.map((r) => {
    const out: Row = {};
    for (const c of COLUMNS[table]) out[c] = present.has(c) ? (r[c] ?? null) : null;
    if (out.created_at != null) out.created_at = toUtcIso(out.created_at);
    return out;
  });
}

/** Rows of `table` in Supabase whose primary key is in `keys`, keyed by that key. */
async function fetchByKeys(
  sb: SupabaseClient,
  table: MigratedTable,
  keys: (string | number)[],
  columns = '*'
): Promise<Map<string, Row>> {
  const pk = PK[table];
  const found = new Map<string, Row>();
  for (const part of chunks(keys, ID_CHUNK)) {
    const { data, error } = await sb.from(table).select(columns).in(pk, part);
    if (error) fail(`read ${table}`, error);
    for (const r of (data ?? []) as unknown as Row[]) found.set(String(r[pk]), r);
  }
  return found;
}

function same(a: unknown, b: unknown, column: string): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (column === 'created_at') return new Date(String(a)).getTime() === new Date(String(b)).getTime();
  return String(a) === String(b);
}

function diff(table: MigratedTable, want: Row, got: Row): string[] {
  return COLUMNS[table]
    .filter((c) => !same(want[c], got[c], c))
    .map((c) => `${table} ${PK[table]}=${String(want[PK[table]])}: ${c} is ${JSON.stringify(got[c])}, source has ${JSON.stringify(want[c])}`);
}

function resolveRecording(recordingsDir: string, rel: string): string | null {
  const root = path.resolve(recordingsDir);
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return existsSync(abs) && statSync(abs).isFile() ? abs : null;
}

async function objectExists(sb: SupabaseClient, bucket: string, key: string): Promise<boolean> {
  const { data } = await sb.storage.from(bucket).exists(key);
  return data;
}

/** Refuses with a readable message unless the schema and the bucket are there. */
async function assertTargetReady(sb: SupabaseClient, bucket: string): Promise<void> {
  for (const table of TABLES) {
    const { error } = await sb.from(table).select(PK[table], { head: true, count: 'exact' }).limit(1);
    if (error) {
      throw new Error(
        `Supabase table "${table}" is not readable (${error.message}). Apply the migrations first ` +
          '(supabase db push for the hosted project, or npm run db:start locally).'
      );
    }
  }
  const { error } = await sb.storage.getBucket(bucket);
  if (error) throw new Error(`Storage bucket "${bucket}" is not available (${error.message}). Apply the migrations first.`);
}

// ---------------------------------------------------------------- migrate

export async function migrate(opts: MigrateOptions): Promise<MigrateResult> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const dryRun = opts.dryRun ?? false;
  const bucket = opts.bucket ?? recordingsBucket();
  if (!existsSync(opts.sqlitePath)) throw new Error(`SQLite database not found: ${opts.sqlitePath}`);
  const sb = opts.supabase ?? getSupabase();
  await assertTargetReady(sb, bucket);

  // ---- read the source (read-only)
  const db = new DatabaseSync(opts.sqlitePath, { readOnly: true });
  let src: Record<MigratedTable, Row[]>;
  try {
    src = { users: [], sessions: [], responses: [], recordings: [] };
    for (const t of TABLES) src[t] = readTable(db, t);
  } finally {
    db.close();
  }

  const result: MigrateResult = {
    dryRun,
    tables: {} as Record<MigratedTable, TableReport>,
    duplicateResponseIds: [],
    missingRecordingFiles: [],
    orphans: [],
    objects: { toCopy: 0, alreadyPresent: 0, uploaded: 0 },
    mismatches: [],
  };

  // ---- decide what to copy
  const userIds = new Set(src.users.map((u) => Number(u.id)));
  const plan: Record<MigratedTable, Row[]> = { users: src.users, sessions: [], responses: [], recordings: [] };

  for (const s of src.sessions) {
    if (userIds.has(Number(s.user_id))) plan.sessions.push(s);
    else result.orphans.push({ table: 'sessions', key: String(s.token_hash), userId: Number(s.user_id) });
  }

  const seen = new Set<string>();
  for (const r of src.responses) {
    const key = JSON.stringify([r.participant, r.session, r.round]);
    if (seen.has(key)) result.duplicateResponseIds.push(Number(r.id));
    else {
      seen.add(key);
      plan.responses.push(r);
    }
  }

  const files = new Map<number, string>();
  for (const r of src.recordings) {
    if (!userIds.has(Number(r.user_id))) {
      result.orphans.push({ table: 'recordings', key: Number(r.id), userId: Number(r.user_id) });
      continue;
    }
    const abs = resolveRecording(opts.recordingsDir, String(r.path));
    if (!abs) {
      result.missingRecordingFiles.push({ id: Number(r.id), path: String(r.path) });
      continue;
    }
    files.set(Number(r.id), abs);
    plan.recordings.push(r);
  }

  // ---- what is already there
  const present: Record<MigratedTable, Map<string, Row>> = {} as Record<MigratedTable, Map<string, Row>>;
  for (const t of TABLES) {
    present[t] = await fetchByKeys(sb, t, plan[t].map((r) => r[PK[t]] as string | number));
  }

  // A google_sub or (participant, session, round) already taken by a DIFFERENT id would make the
  // whole batch fail on the unique constraint; find those up front and refuse with a clear list.
  const conflicts: string[] = [];
  {
    const subs = plan.users.filter((u) => !present.users.has(String(u.id))).map((u) => String(u.google_sub));
    for (const part of chunks(subs, ID_CHUNK)) {
      const { data, error } = await sb.from('users').select('id, google_sub').in('google_sub', part);
      if (error) fail('read users', error);
      const want = new Map(plan.users.map((u) => [String(u.google_sub), Number(u.id)]));
      for (const u of data ?? []) {
        if (want.get(u.google_sub) !== Number(u.id)) {
          conflicts.push(`users: google_sub ${u.google_sub} is already user ${u.id} in Supabase (source id ${want.get(u.google_sub)})`);
        }
      }
    }
    const pending = plan.responses.filter((r) => !present.responses.has(String(r.id)));
    const participants = [...new Set(pending.map((r) => String(r.participant)))];
    const want = new Map(pending.map((r) => [JSON.stringify([r.participant, r.session, r.round]), Number(r.id)]));
    for (const part of chunks(participants, 50)) {
      // Paged: PostgREST caps one response at max_rows (1000).
      const data: { id: number; participant: string; session: string; round: number }[] = [];
      for (let from = 0; ; from += 1000) {
        const page = await sb
          .from('responses')
          .select('id, participant, session, round')
          .in('participant', part)
          .order('id')
          .range(from, from + 999);
        if (page.error) fail('read responses', page.error);
        data.push(...(page.data ?? []));
        if ((page.data ?? []).length < 1000) break;
      }
      for (const r of data) {
        const id = want.get(JSON.stringify([r.participant, r.session, r.round]));
        if (id !== undefined && id !== Number(r.id)) {
          conflicts.push(`responses: (${r.participant}, ${r.session}, ${r.round}) is already response ${r.id} in Supabase (source id ${id})`);
        }
      }
    }
  }

  // Ids already taken by a different row are reported as mismatches (copying would silently skip them).
  const preMismatches: string[] = [];
  for (const t of TABLES) {
    for (const r of plan[t]) {
      const got = present[t].get(String(r[PK[t]]));
      if (got) preMismatches.push(...diff(t, r, got));
    }
  }

  for (const t of TABLES) {
    const toCopy = plan[t].length;
    const alreadyPresent = plan[t].filter((r) => present[t].has(String(r[PK[t]]))).length;
    result.tables[t] = {
      source: src[t].length,
      toCopy,
      alreadyPresent,
      copied: dryRun ? toCopy - alreadyPresent : 0,
      skipped: src[t].length - toCopy,
    };
  }

  const objectKeys = plan.recordings.map((r) => String(r.path));
  result.objects.toCopy = objectKeys.length;
  const objPresent = new Set<string>();
  for (const key of objectKeys) if (await objectExists(sb, bucket, key)) objPresent.add(key);
  result.objects.alreadyPresent = objPresent.size;

  if (dryRun) {
    result.objects.uploaded = objectKeys.length - objPresent.size;
    result.mismatches = [];
    printReport(log, result, opts, bucket, conflicts, preMismatches, false);
    return result;
  }

  if (conflicts.length || preMismatches.length) {
    printReport(log, result, opts, bucket, conflicts, preMismatches, false);
    throw new Error(
      'Refusing to write: Supabase already holds different rows under some source ids or unique keys (listed above).'
    );
  }

  // ---- copy, FK order
  for (const t of ['users', 'sessions', 'responses'] as const) {
    const rows = plan[t].filter((r) => !present[t].has(String(r[PK[t]])));
    for (const batch of chunks(rows, BATCH)) {
      const { data, error } = await sb
        .from(t)
        .upsert(batch, { onConflict: PK[t], ignoreDuplicates: true })
        .select(PK[t]);
      if (error) fail(`insert ${t}`, error);
      result.tables[t].copied += (data ?? []).length;
    }
  }

  // recordings: object first, then the row
  const recRows = plan.recordings.filter((r) => !present.recordings.has(String(r.id)));
  for (const r of plan.recordings) {
    const key = String(r.path);
    if (objPresent.has(key)) continue;
    const body = readFileSync(files.get(Number(r.id))!);
    const { error } = await sb.storage.from(bucket).upload(key, body, { contentType: String(r.mime), upsert: false });
    if (error) {
      const status = (error as { statusCode?: string | number }).statusCode;
      const dup = String(status) === '409' || /already exists|duplicate/i.test(error.message);
      if (!dup) fail(`upload ${key}`, error);
    } else {
      result.objects.uploaded++;
    }
    objPresent.add(key);
  }
  for (const batch of chunks(recRows, BATCH)) {
    const { data, error } = await sb
      .from('recordings')
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (error) fail('insert recordings', error);
    result.tables.recordings.copied += (data ?? []).length;
  }

  {
    const { error } = await sb.rpc('reset_identity_sequences');
    if (error) fail('reset_identity_sequences()', error);
  }

  // ---- verify: every planned row is there with the source values, every object exists
  for (const t of TABLES) {
    const got = await fetchByKeys(sb, t, plan[t].map((r) => r[PK[t]] as string | number));
    for (const r of plan[t]) {
      const g = got.get(String(r[PK[t]]));
      if (!g) result.mismatches.push(`${t} ${PK[t]}=${String(r[PK[t]])}: missing in Supabase`);
      else result.mismatches.push(...diff(t, r, g));
    }
  }
  for (const key of objectKeys) {
    if (!(await objectExists(sb, bucket, key))) result.mismatches.push(`object ${bucket}/${key}: missing in Storage`);
  }

  printReport(log, result, opts, bucket, [], [], true);
  return result;
}

// ---------------------------------------------------------------- report

function printReport(
  log: (line: string) => void,
  r: MigrateResult,
  opts: MigrateOptions,
  bucket: string,
  conflicts: string[],
  preMismatches: string[],
  wrote: boolean
): void {
  const verb = r.dryRun ? 'would copy' : 'copied';
  log('');
  log(`${r.dryRun ? 'DRY RUN (nothing written)' : 'Migration'}: ${opts.sqlitePath} → Supabase (bucket "${bucket}")`);
  log('');
  const head = ['table', 'source', 'skipped', 'to copy', 'already there', verb];
  const rows: string[][] = TABLES.map((t) => {
    const x = r.tables[t];
    return [t, x.source, x.skipped, x.toCopy, x.alreadyPresent, x.copied].map(String);
  });
  rows.push(['objects', String(r.objects.toCopy + r.missingRecordingFiles.length), String(r.missingRecordingFiles.length),
    String(r.objects.toCopy), String(r.objects.alreadyPresent), String(r.objects.uploaded)]);
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ');
  log(fmt(head));
  log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) log(fmt(row));
  log('');
  log('exp1_trials / exp2_trials: not copied — they are reseeded from the CSVs with `npm run seed`.');

  if (r.duplicateResponseIds.length) {
    log(`responses: ${r.duplicateResponseIds.length} duplicate (participant, session, round) row(s) skipped, lowest id kept: ids ${r.duplicateResponseIds.join(', ')}`);
  }
  if (r.missingRecordingFiles.length) {
    log(`recordings: ${r.missingRecordingFiles.length} row(s) skipped because the file is missing under ${opts.recordingsDir}:`);
    for (const m of r.missingRecordingFiles) log(`  id ${m.id}: ${m.path}`);
  }
  if (r.orphans.length) {
    log(`${r.orphans.length} row(s) skipped because their user_id has no user row:`);
    for (const o of r.orphans) log(`  ${o.table} ${o.key} (user_id ${o.userId})`);
  }
  if (conflicts.length || preMismatches.length) {
    log('');
    log('CONFLICTS — Supabase already holds different data under these keys:');
    for (const c of [...conflicts, ...preMismatches]) log(`  ${c}`);
  }
  if (wrote) {
    log('');
    log('Identity sequences reset past the largest id (reset_identity_sequences()).');
    if (r.mismatches.length) {
      log(`VERIFY FAILED (${r.mismatches.length}):`);
      for (const m of r.mismatches) log(`  ${m}`);
    } else {
      log('Verify: every copied row and object is present in Supabase with the source values.');
    }
  }
  log('');
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv: string[]): { sqlitePath: string; recordingsDir: string; dryRun: boolean } {
  let sqlitePath = 'data/arena.db';
  let recordingsDir = process.env.RECORDINGS_DIR ?? 'data/recordings';
  let dryRun = false;
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true;
    else if (a.startsWith('--sqlite=')) sqlitePath = a.slice('--sqlite='.length);
    else if (a.startsWith('--recordings-dir=')) recordingsDir = a.slice('--recordings-dir='.length);
    else throw new Error(`unknown argument: ${a}\nusage: scripts/migrate-sqlite-to-supabase.ts --sqlite=data/arena.db --recordings-dir=data/recordings [--dry-run]`);
  }
  return { sqlitePath, recordingsDir, dryRun };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((k) => !process.env[k]);
    if (missing.length) {
      throw new Error(`${missing.join(' and ')} must be set (bucket from SUPABASE_RECORDINGS_BUCKET, default "recordings").`);
    }
    const r = await migrate(args);
    if (r.mismatches.length) process.exit(1);
  } catch (e) {
    console.error(`migrate-sqlite-to-supabase: ${(e as Error).message}`);
    process.exit(1);
  }
}
