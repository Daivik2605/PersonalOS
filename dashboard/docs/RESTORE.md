# Restoring a PersonalOS backup

Backups are `backups/YYYY-MM-DD.sql.gz` in the PersonalOS root, written by `dashboard/launcher/backup.sh` (weekly, Sunday 03:00, newest 8 kept). Each one is a plain-SQL `pg_dump` of your Supabase database.

**Treat every backup like the database itself.** It contains the `auth` schema (your email and password hash). `backups/` is mode 700 and each file 600 (`backup.sh` re-checks both every run), it is gitignored, and it must never be committed, emailed or put in a synced folder you share.

## What is in a backup
- Normally: everything `pg_dump` can read, run with `--no-owner --no-privileges` (so no role names or grants need to match).
- **Fallback:** if Supabase refuses `pg_dump` access to one of its internal schemas ("permission denied"), `backup.sh` retries with only `--schema=public --schema=auth --schema=storage` and writes `FALLBACK: ...` in `dashboard/launcher/logs/backup.log`. That covers all your app tables, views, policies, users and storage metadata (the file list, not the files themselves: storage objects are not in a database dump). Check the log to see which kind a given backup is.
- Not in a backup: storage bucket files, Edge Function code, Auth settings, your `.env.local` files. Those live in your app repos and the Supabase dashboard.

## Restore into local Postgres (to look at the data, or to prove a backup works)
1. Have Postgres 15 or newer: `brew install postgresql@17`, then `brew services start postgresql@17` (or use any running local server).
2. Create the roles the dump's policies refer to (a plain Postgres has none of Supabase's). Safe to run twice:
   ```
   psql postgres -c "do \$\$ begin
     if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
     if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
     if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
   end \$\$;"
   ```
3. Create an empty database and load the newest file:
   ```
   createdb personalos_restored
   gunzip -c backups/2026-10-25.sql.gz | psql -d personalos_restored -v ON_ERROR_STOP=0 -q -o /dev/null
   ```
   A real Supabase dump can print a few errors (an extension the local server doesn't have, or an object that belongs to Supabase itself). Read them: errors about `auth.*`, `storage.*` or `pg_graphql`-style internals are expected locally; an error about a `public` table or view is not, so stop and tell me.
4. Check it: `psql -d personalos_restored -c "select count(*) from auth.users"` and compare the row counts of your tables with Supabase's Table Editor.
5. Delete it when done: `dropdb personalos_restored`.

## Restore into Supabase (disaster recovery)
Only if the project's data is lost. Do not restore over a working database.
1. Make a **new** Supabase project, or empty the `public` schema of a fresh one. Supabase already provides `auth`, `storage` and the roles.
2. A dump taken without the fallback includes the `auth` and `storage` schemas that already exist in the new project, so loading it whole will error on those. Load only your own data: restore into local Postgres first (above), then dump just the part you need: `pg_dump -d personalos_restored --schema=public --data-only` plus `--table=auth.users` if you need the same user id, and run that in the new project's SQL Editor or with `psql "<new connection string>"`.
3. Re-run each app's `<prefix>schema.sql` and `supabase/os_core.sql` first (they are idempotent) so the tables, policies and views exist before the data goes in.
4. Sign in again (the user id must match the rows' `user_id`, which is why `auth.users` matters).

This second path is written down but **not tested**: it needs a spare Supabase project. The local-Postgres path is tested (below).

## How it was tested
`sh supabase/tests/restore-local.sh` starts a throwaway local Postgres, builds a database (Supabase stand-ins, `os_core.sql`, two users, 250 probe rows), runs the real `backup.sh` with a real `pg_dump` against it, restores the file into a second database with steps 2 and 3 above, and compares every table's row count and the number of `os_` views. It also checks the folder is 700 and the file 600. It passed on 2026-10-25 with `pg_dump` 15.15. It has not yet been run against your real Supabase project: do the first real backup and a local restore yourself (steps below in the README) and compare row counts.

## `pg_dump` version
`pg_dump` refuses a server newer than itself. `backup.sh` uses the newest `pg_dump` it can find (Homebrew `postgresql@*`, then `PATH`). If it says the version is too old, run the `brew install postgresql@N` it prints.
