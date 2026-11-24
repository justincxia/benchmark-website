// Survey trial tables and the leaderboard aggregates (views exp1_counts, exp2_counts,
// exp2_interp_by_sentence in supabase/migrations/*_init.sql).
import 'server-only';
import { check, getSupabase } from './client.ts';
import type { Exp1Counts, Exp1Trial, Exp2Counts, Exp2InterpBySentence, Exp2Trial } from './types.ts';

// ---- row mapping (camelCase → the tables' snake_case columns) ----

function exp1Row(r: Exp1Trial) {
  return {
    participant: r.participant,
    trial_number: r.trialNumber,
    is_attention_check: r.isAttentionCheck,
    provider: r.provider,
    condition: r.condition,
    take: r.take,
    audio_file: r.audioFile,
    intended_question: r.intendedQuestion,
    naturalness: r.naturalness,
    human_or_ai: r.humanOrAi,
    question_answered: r.questionAnswered,
  };
}

function exp2Row(r: Exp2Trial) {
  return {
    participant: r.participant,
    trial_number: r.trialNumber,
    is_attention_check: r.isAttentionCheck,
    provider: r.provider,
    condition: r.condition,
    variant: r.variant,
    take: r.take,
    audio_file: r.audioFile,
    intended_interpretation: r.intendedInterpretation,
    interpretation: r.interpretation,
    naturalness: r.naturalness,
  };
}

/** Inserts one row. Prefer seedExp1Trials for bulk loads (atomic). */
export async function insertExp1Trial(r: Exp1Trial): Promise<void> {
  check(await getSupabase().from('exp1_trials').insert(exp1Row(r)), 'insert exp1_trials');
}

export async function insertExp2Trial(r: Exp2Trial): Promise<void> {
  check(await getSupabase().from('exp2_trials').insert(exp2Row(r)), 'insert exp2_trials');
}

async function seedVia(table: 'exp1_trials' | 'exp2_trials', rows: object[], replace: boolean): Promise<number> {
  const fn = `seed_${table}` as const;
  if (replace) {
    // The RPC's own p_replace runs `delete from <table>` with no WHERE, which pg_safeupdate
    // (preloaded for PostgREST's authenticator role) rejects with "DELETE requires a WHERE
    // clause". Until the migration says `delete … where true`, empty the table here (a filtered
    // delete passes) and let the RPC insert into the now-empty table. Not one transaction: a
    // failed insert after this leaves the table empty, never partially filled.
    check(await getSupabase().from(table).delete().not('id', 'is', null), `empty ${table}`);
  }
  const res = check(await getSupabase().rpc(fn, { p_rows: rows, p_replace: false }), fn);
  const n = Number(res.data);
  if (!Number.isInteger(n)) throw new Error(`${fn}: unexpected result ${JSON.stringify(res.data)}`);
  return n;
}

/** All-or-nothing bulk insert via rpc seed_exp1_trials. Returns rows inserted; 0 (inserting
 *  nothing) when the table already has rows, unless `replace`, which empties it first. */
export async function seedExp1Trials(rows: Exp1Trial[], opts?: { replace?: boolean }): Promise<number> {
  return seedVia('exp1_trials', rows.map(exp1Row), opts?.replace ?? false);
}

export async function seedExp2Trials(rows: Exp2Trial[], opts?: { replace?: boolean }): Promise<number> {
  return seedVia('exp2_trials', rows.map(exp2Row), opts?.replace ?? false);
}

// ---- aggregates ----

const PAGE = 1000; // PostgREST max_rows; views are read page by page so none is ever cut short.

async function readView<T>(view: string, columns: string, orderBy: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = getSupabase().from(view).select(columns);
    for (const c of orderBy) q = q.order(c, { ascending: true });
    const res = check(await q.range(from, from + PAGE - 1), `read ${view}`);
    const page = (res.data ?? []) as unknown as T[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

const EXP1_COLS = ['trials', 'focusN', 'focusCorrect', 'natN', 'natSum', 'humanAiN', 'judgedHuman'] as const;
const EXP2_COLS = ['trials', 'interpN', 'interpCorrect', 'natN', 'natSum'] as const;

function pickNumbers<K extends string>(row: Record<string, unknown>, cols: readonly K[]): Record<K, number> {
  return Object.fromEntries(cols.map((c) => [c, Number(row[c])])) as Record<K, number>;
}

const quoted = (cols: readonly string[]) => cols.map((c) => `"${c}"`).join(',');

/** Attention checks are excluded (in the view) from every metric. */
export async function getExp1Counts(): Promise<Record<string, Exp1Counts>> {
  const rows = await readView<Record<string, unknown>>('exp1_counts', `provider,${quoted(EXP1_COLS)}`, ['provider']);
  return Object.fromEntries(rows.map((r) => [r.provider as string, pickNumbers(r, EXP1_COLS)]));
}

export async function getExp2Counts(): Promise<Record<string, Exp2Counts>> {
  const rows = await readView<Record<string, unknown>>('exp2_counts', `provider,${quoted(EXP2_COLS)}`, ['provider']);
  return Object.fromEntries(rows.map((r) => [r.provider as string, pickNumbers(r, EXP2_COLS)]));
}

export async function getExp2InterpBySentence(): Promise<Exp2InterpBySentence> {
  const rows = await readView<{ provider: string; condition: string; n: number; correct: number }>(
    'exp2_interp_by_sentence',
    'provider,condition,n,correct',
    ['provider', 'condition']
  );
  const out: Exp2InterpBySentence = {};
  for (const r of rows) (out[r.provider] ??= {})[r.condition] = { n: Number(r.n), correct: Number(r.correct) };
  return out;
}
