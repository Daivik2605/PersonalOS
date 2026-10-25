# PersonalOS Home (`dashboard/`) — app rules for Claude Code

Read `../CLAUDE.md` (system rules — they all apply here), `../docs/CAPABILITIES.md`, then `docs/SPEC.md` (what to build) and `docs/BUILD_PLAN.md` (phase prompts and status). One phase per session: plan first, wait for approval, build, stop.

- App key `os`, prefix `os_` (buckets `os-`), UI port **5170** strict, launcher **127.0.0.1:5171**.
- This folder is part of the **PersonalOS root repo** (not its own repo). Never run git.
- **Read-only towards other apps.** Read only `*_dashboard_*` views and the documented columns in each app's `docs/DATA_CONTRACT.md`. Never read app tables, never write anything outside `os_*`. To change something in an app, link to it (deep link) — don't do it from here.
- Never re-implement an app's rules (streaks, statuses, pay). If a number is missing, ask for a column in that app's contract view instead.
- All SQL lives in `../supabase/os_core.sql`: idempotent, never drops user data, tested on local Postgres with Supabase stand-ins (see `../taskflow/supabase/tests/` for the pattern) before I run it.
- Days are America/Toronto dates via `src/lib/time.ts` only.
- Business rules in pure, unit-tested modules in `src/lib/` (`time`, `productive`, `targets`, `review`, `health`). Components stay thin.
- The launcher only runs commands listed in `launcher/apps.json`, only stops processes it started (by PID), never kills by name or pattern — other PersonalOS apps and their Claude sessions run on this Mac.
- Anon key only, in `.env.local`. The DB password for backups lives only in the root `../.env.local`.
- Every phase ends with `npm test`, `npm run typecheck`, `npm run build` passing and a hand-check list. Update the phase **Status** in `docs/BUILD_PLAN.md`, the registry in `../CLAUDE.md`, and `../docs/DECISIONS.md` for anything that changed.
