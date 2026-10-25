# PersonalOS Home (`dashboard/`) — app rules for Claude Code

Read `../CLAUDE.md` (system rules — they all apply here), `../docs/CAPABILITIES.md`, then `docs/SPEC.md` (what to build) and `docs/BUILD_PLAN.md` (phase prompts and status). One phase per session: plan first, wait for approval, build, stop.

- App key `os`, prefix `os_` (buckets `os-`), UI port **5170** strict, launcher **127.0.0.1:5171**.
- This folder is part of the **PersonalOS root repo** (not its own repo). Never run git.
- **Read-only towards other apps.** Read only `*_dashboard_*` views and the documented columns in each app's `docs/DATA_CONTRACT.md`. Never read app tables, never write anything outside `os_*`. To change something in an app, link to it (deep link) — don't do it from here.
- Never re-implement an app's rules (streaks, statuses, pay). If a number is missing, ask for a column in that app's contract view instead.
- All SQL lives in `../supabase/os_core.sql`: idempotent, never drops user data, tested on local Postgres with Supabase stand-ins (see `../taskflow/supabase/tests/` for the pattern) before I run it.
- Days are America/Toronto dates via `src/lib/time.ts` only.
- Business rules in pure, unit-tested modules in `src/lib/` (`time`, `productive`, `targets`, `review`, `health`). Components stay thin.
- The launcher only runs commands listed in `launcher/apps.json` (argv array, no shell). It spawns each app **detached as its own process group** and stops the **whole group** (`kill(-pgid)`), because `npm run dev` runs Vite as a child. It only ever signals groups it spawned: never by name, pattern or port owner, and never an app it didn't start (other PersonalOS apps and their Claude sessions run on this Mac).
- Launcher browser safety: reject any request whose `Origin` isn't exactly `http://localhost:5170` or whose `Host` isn't loopback on 5171; every POST needs the header `X-PersonalOS: 1`. The dashboard calls `http://127.0.0.1:5171` (not `localhost`).
- Port checks always try both `127.0.0.1` and `::1` (Vite on macOS often binds `::1` only): `launcher/ports.mjs` is the only implementation, also used by `start-os.sh`.
- Anon key only, in `.env.local`. The DB password for backups lives only in the root `../.env.local`.
- Every phase ends with `npm test`, `npm run typecheck`, `npm run build` passing and a hand-check list. Update the phase **Status** in `docs/BUILD_PLAN.md`, the registry in `../CLAUDE.md`, and `../docs/DECISIONS.md` for anything that changed.
