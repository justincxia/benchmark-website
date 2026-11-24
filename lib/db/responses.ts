// Arena responses. Writes only to `responses`; nothing that renders a page reads it.
import 'server-only';
import type { ResponseRecord } from './types.ts';

/** Returns false, inserting nothing, when this (participant, session, round) is already
 *  recorded (UNIQUE constraint responses_round_unique + ON CONFLICT DO NOTHING). */
export async function insertResponse(_r: ResponseRecord): Promise<boolean> {
  throw new Error('insertResponse: not implemented');
}
