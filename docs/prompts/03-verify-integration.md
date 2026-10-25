# Prompt 03 — Verify everything fits together
Run Claude Code **in the `PersonalOS/` root** and say: *"Read docs/prompts/03-verify-integration.md and follow it."* Re-run it after any database change and before building the dashboard.

---

You are checking integration only. **Don't change any file inside an app folder.** You may only write `docs/INTEGRATION_REPORT.md`.

Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/CONTRACT.md`. Then, for every app folder in the registry that exists, read its `CLAUDE.md`, `supabase/*.sql`, `docs/DATA_CONTRACT.md`, port config (`vite.config.*`, `start.sh`, `start.bat`) and the code that talks to Supabase.

Check and report pass/fail with file and line for each:
1. **Prefixes.** Every table, view, function, index, policy and bucket in each app's SQL uses that app's prefix. Every `.from("…")`, `storage.from("…")` and `.rpc("…")` in its code does too, and no app reads or writes another app's objects.
2. **Security.**
   - Every table has `user_id … default auth.uid()`, RLS enabled and the `"own rows"` policy.
   - Every view has `security_invoker = true` and a grant to `authenticated`.
   - No `service_role` key, secret key, DB password or connection string is anywhere in an app folder or a tracked file.
   - `.env.local` / `config.js` are gitignored in each app.
3. **Contract.**
   - Both `<prefix>dashboard_daily` and `<prefix>dashboard_now` exist, with the standard columns in the exact order and types from `docs/CONTRACT.md`.
   - `day` is a local date.
   - Each app's `docs/DATA_CONTRACT.md` matches its SQL.
4. **Ports.** Each app uses its registry port with strict port (no silent fallback), and no two apps share a port.
5. **Idempotency.** Each SQL file can be re-run safely: no `drop table`, no data-deleting statements, only `if not exists` / `drop policy if exists` style.
6. **Login.** Every app uses the same Supabase URL variable naming from the registry rules, and nothing assumes a different project.
7. **Docs in sync.** The registry in root `CLAUDE.md` matches reality (folders, ports, prefixes, status).

Then write `docs/INTEGRATION_REPORT.md`:
- the date
- a pass/fail table
- each problem with file:line, why it matters and the exact fix, plus **which app's session should fix it**

Finish with: *"Also run `supabase/checks.sql` in the Supabase SQL Editor; queries 1–8 should return no rows."* Don't fix anything yourself.
