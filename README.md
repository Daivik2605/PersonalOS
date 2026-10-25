# PersonalOS — start here

Separate local apps sharing one Supabase database, plus a dashboard. Design: `docs/ARCHITECTURE.md`. Rules for Claude Code: `CLAUDE.md`. What each app must publish: `docs/CONTRACT.md`.

## Setup order (do these in order)
1. **Save your DSA progress.** Commit InteractiveDSA. Open it (it's on port 5173 today) → **Settings → Export** → save the file into `PersonalOS/backups/`.
2. **Create the one Supabase project** at supabase.com, named e.g. `personal-os`. Save the database password in a password manager. Then:
   - Authentication → Sign In / Providers → Email: turn **off** "Confirm email"
   - Project Settings → API: copy the **Project URL** and the **anon/publishable** key (never the service_role key)
3. **(Optional) Make this root folder a git repo.** `.gitignore` already excludes the app folders, secrets and backups.
4. **chart-journal:**
   - `cd chart-journal && claude`, then *"Read ../docs/prompts/01-chart-journal.md and follow it."*
   - Approve the plan.
   - Run `supabase/trading_schema.sql` in the SQL Editor, copy `config.example.js` → `config.js` with your URL + key, start it and **create your account**.
5. **InteractiveDSA:**
   - `cd InteractiveDSA && claude`, then *"Read ../docs/prompts/02-dsa-sync.md and follow it."*
   - Run `supabase/dsa_schema.sql`, fill `.env.local`, and sign in with the **same account**.
   - After the port change to 5174, use Restore from cloud or import your export.
6. **Check:** run `supabase/checks.sql` in the SQL Editor (queries 1–8 return nothing), then from this root `claude` → *"Read docs/prompts/03-verify-integration.md and follow it."*
7. **Dashboard:** `claude` here → *"Read docs/prompts/04-dashboard.md and follow it."*

## Ports
Dashboard 5170 · launcher 5171 · chart-journal 5173 · DSA 5174 · (TaskFlow 5175, jobs 5176, money 5177, sql 5178, cert 5179)

What's planned and where each area lives: `docs/ROADMAP.md`. Next app: TaskFlow — `taskflow/docs/BUILD_PLAN.md` (start at Phase 0).

## Habits that keep it working
- One app (or one phase) per Claude Code session, started inside that app's folder.
- End each session with: *"Update the build plan status, DATA_CONTRACT.md and docs/DECISIONS.md for anything that changed."*
- Re-run the verify prompt after any database change.
- Open at least one app every few days (free Supabase projects pause after about a week of no use).
- Check the weekly backup ran, and export DSA monthly.
- Adding an app: follow the checklist in `docs/ARCHITECTURE.md` §8.
