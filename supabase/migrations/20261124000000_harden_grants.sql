-- Defence in depth (review finding): the earlier migrations revoke anon/authenticated access to
-- each table, view and function they create, but Supabase's default privileges still hand those
-- roles USAGE/UPDATE on sequences and full rights on any FUTURE object in `public`. RLS with no
-- policies already blocks every row, so nothing was reachable; this makes a later migration that
-- forgets its `revoke` safe too.

revoke all on all sequences in schema public from anon, authenticated;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
