// The hidden SONA survey's tables (supabase/migrations/*_sona.sql). Isolated: the arena and
// the leaderboard never touch these, and these functions never touch theirs.
import 'server-only';
import type { CompleteSonaResult, SonaContact, SonaResponseRecord, SonaSession } from './types.ts';

const todo = (name: string): never => {
  throw new Error(`${name}: not implemented`);
};

/** Stores a consented session; returns its uuid. */
export async function createSonaSession(_s: {
  seed: number;
  block: string[];
  sonaId: string | null;
  userAgent: string | null;
  debug: boolean;
}): Promise<string> {
  return todo('createSonaSession');
}

export async function getSonaSession(_id: string): Promise<SonaSession | null> {
  return todo('getSonaSession');
}

/** Returns false, inserting nothing, when (sessionId, trialIndex) is already recorded. */
export async function insertSonaResponse(_r: SonaResponseRecord): Promise<boolean> {
  return todo('insertSonaResponse');
}

export async function countSonaResponses(_sessionId: string): Promise<number> {
  return todo('countSonaResponses');
}

/** Saves the contact and sets completed_at, only once every trial in the block is answered. */
export async function completeSonaSession(_sessionId: string, _contact: SonaContact): Promise<CompleteSonaResult> {
  return todo('completeSonaSession');
}
