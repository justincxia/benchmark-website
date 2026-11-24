// Runs a command against the LOCAL Supabase stack (`npm run db:start`): fills SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY from `supabase status`, always overriding anything inherited, so a
// test or reset can never reach the hosted project.
//
//   node scripts/with-local-supabase.ts <command> [args...]
import { execFileSync, spawnSync } from 'node:child_process';

function localSupabaseEnv(): { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string } {
  let out: string;
  try {
    out = execFileSync('npx', ['--no-install', 'supabase', 'status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('Local Supabase is not running. Start it with `npm run db:start` (needs Docker).');
  }
  const s = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>;
  if (!s.API_URL || !s.SERVICE_ROLE_KEY) throw new Error('`supabase status` returned no API_URL / SERVICE_ROLE_KEY');
  return { SUPABASE_URL: s.API_URL, SUPABASE_SERVICE_ROLE_KEY: s.SERVICE_ROLE_KEY };
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('usage: node scripts/with-local-supabase.ts <command> [args...]');
  process.exit(2);
}
const env = { ...process.env, ...localSupabaseEnv(), SUPABASE_RECORDINGS_BUCKET: 'recordings' };
const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
