// Survey trial tables and the leaderboard aggregates (views exp1_counts, exp2_counts,
// exp2_interp_by_sentence in supabase/migrations/*_init.sql).
import 'server-only';
import type { Exp1Counts, Exp1Trial, Exp2Counts, Exp2InterpBySentence, Exp2Trial } from './types.ts';

const todo = (name: string): never => {
  throw new Error(`${name}: not implemented`);
};

/** Inserts one row. Prefer seedExp1Trials for bulk loads (atomic). */
export async function insertExp1Trial(_r: Exp1Trial): Promise<void> {
  return todo('insertExp1Trial');
}

export async function insertExp2Trial(_r: Exp2Trial): Promise<void> {
  return todo('insertExp2Trial');
}

/** All-or-nothing bulk insert via rpc seed_exp1_trials. Returns rows inserted; 0 (inserting
 *  nothing) when the table already has rows, unless `replace`, which empties it first. */
export async function seedExp1Trials(_rows: Exp1Trial[], _opts?: { replace?: boolean }): Promise<number> {
  return todo('seedExp1Trials');
}

export async function seedExp2Trials(_rows: Exp2Trial[], _opts?: { replace?: boolean }): Promise<number> {
  return todo('seedExp2Trials');
}

/** Attention checks are excluded (in the view) from every metric. */
export async function getExp1Counts(): Promise<Record<string, Exp1Counts>> {
  return todo('getExp1Counts');
}

export async function getExp2Counts(): Promise<Record<string, Exp2Counts>> {
  return todo('getExp2Counts');
}

export async function getExp2InterpBySentence(): Promise<Exp2InterpBySentence> {
  return todo('getExp2InterpBySentence');
}
