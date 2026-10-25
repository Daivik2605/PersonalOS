# PersonalOS Home — build plan (one phase per Claude Code session)

How to run a phase: open a terminal in `PersonalOS/` (the root, because this app's SQL lives in `supabase/` and the launcher starts other apps), run `claude` (subscription), and paste the phase's prompt. Claude Code plans first and waits for your OK. Every phase ends with `npm test`, `npm run typecheck` and `npm run build` passing, the **Status** line updated, and a hand-check list. SPEC = `dashboard/docs/SPEC.md`.

**When to start:** phase 1 needs nothing from the other apps, so it can start any time; it's useful during development because it starts and stops all three apps. Phases 2–3 need chart-journal's views (they already exist) and TaskFlow phase 4.5. Phase 4 onward is best once TaskFlow has a week of real timer data.

---

### Phase 0 — Setup (you, 5 min)
**Status:** not started
1. Nothing to install. `dashboard/` is part of the PersonalOS root repo.
2. Have the Supabase Project URL and anon key ready for `dashboard/.env.local`.
3. For backups (phase 7): Supabase → Project Settings → Database → copy the **connection string** with your DB password into the **root** `PersonalOS/.env.local` as `SUPABASE_DB_URL=…`. Never put it in an app folder.

### Phase 1 — Shell, sign-in, launcher, System page
**Status:** built 2026-10-25 (automated checks pass: `npm test`, `npm run typecheck`, `npm run build`); waiting for your hand-check below. Shell (4 tabs + sidebar, theme, offline banner), sign-in/out, `time.ts` + tests, placeholder Home/Week/Trends, launcher (`launcher/*.mjs`, 42 tests on real sockets and processes), System page apps section, `../start-os.sh`, README. Not done on purpose: contract health / freshness / backup sections of System (phases 2 and 7); Supabase-unreachable banner (phase 4, with the first data screens). Next: phase 2.
> Read CLAUDE.md, dashboard/CLAUDE.md, docs/CAPABILITIES.md, docs/ARCHITECTURE.md and dashboard/docs/SPEC.md. Do Phase 1 of dashboard/docs/BUILD_PLAN.md: plan first and wait for my approval.
> Scaffold `dashboard/` (Vite + React + TS + Tailwind + React Router + Recharts + Vitest, port 5170 strict) with the shell from SPEC §3 (phone tabs Home · Week · Trends · System; desktop sidebar; dark mode; offline banner), sign-in/sign-out with the shared account, `src/lib/time.ts` copied from TaskFlow with its tests, and placeholder screens. Build the launcher (SPEC §4) with `launcher/apps.json` for chart-journal, InteractiveDSA and TaskFlow, all endpoints except `/backup`, the safety rules, and tests for the command allowlist and "only stop what I started". Build the **System** page's app section (SPEC §3.5: status, start/stop/open/logs, "already running" detection, start all / stop all) and `../start-os.sh`. Hide launcher features when `VITE_LAUNCHER_URL` is unset. Write `dashboard/README.md` and `.env.example`.

**Done when:** `sh start-os.sh` opens Home; System shows all three apps; Start brings chart-journal up and its dot turns green; Stop stops it; an app already running from a Claude session shows as running with Stop disabled; killing the launcher shows "launcher offline" and nothing else breaks.
**You:** use `start-os.sh --all` instead of starting apps by hand for a day.
**Hand-check (needs your real apps):** (1) `sh start-os.sh` opens http://localhost:5170, sign in, System lists all three apps. (2) With nothing on 5173, Start chart-journal: dot turns green. Stop: dot goes grey, and `lsof -nP -iTCP:5173 -sTCP:LISTEN` prints nothing. (3) An app running from a Claude session (e.g. TaskFlow on 5175) shows "Already running" with Stop greyed out. (4) `sh start-os.sh --all` skips running apps and names them. (5) Ctrl+C the script, then run `npm run dev` in `dashboard/` alone: System says "Launcher offline" and the rest still works. (6) Open http://127.0.0.1:5170 instead: System says to open http://localhost:5170.

### Phase 2 — Data foundation (`supabase/os_core.sql`, part 1)
**Status:** not started
> Do Phase 2 of dashboard/docs/BUILD_PLAN.md (SPEC §2.1, and the unions + `os_app_kind` + `os_contract_health` from §2.2): plan first. Tables `os_settings`, `os_targets`, `os_reviews` with RLS and triggers; the self-assembling `os_daily_activity` / `os_apps_now` union block; `os_contract_health`. Test on local Postgres with Supabase stand-ins (pattern: `taskflow/supabase/tests/`): runs twice cleanly; unions work with zero, one and two app views; a view with wrong columns is skipped and reported by `os_contract_health`; two users isolated. Add `os` checks to `supabase/checks.sql` if needed. Wire Settings (goal, week start, review day, hosted URLs, theme) and the System page's contract-health section. Tell me exactly what to run in the SQL Editor.

**Done when:** after running the file, System shows chart-journal's contract as healthy and TaskFlow as "not published yet" (or healthy if 4.5 is done); Settings saves.
**You:** run `os_core.sql` in the SQL Editor twice.

### Phase 3 — Productive time, streak, targets maths (`os_core.sql`, part 2)
**Status:** not started — needs TaskFlow phase 4.5
> Do Phase 3 of dashboard/docs/BUILD_PLAN.md (SPEC §2.2 — `os_tag_daily`, `os_productive_daily`, `os_streak`, `os_target_progress`, `os_week_summary`): plan first, including the exact SQL for the max-rule and the streak. Local Postgres fixtures: a day where a TaskFlow Study/DSA session (40 min) and DSA's own minutes (55) overlap → 55; trading minutes with no TaskFlow row → counted under Study/Trading; a day off inside a streak; today with 0 minutes not breaking the streak; a weekday-only target skipping weekends and days off; a week crossing a DST change; two users. `src/lib/productive.ts`, `targets.ts` (period windows, pace: expected-by-now vs actual) with tests.

**Done when:** every fixture gives the expected number, and on my real data today's productive minutes equal TaskFlow Insights' Study + Hustle total (or the larger app number where linked).
**You:** run the file, compare today's number with TaskFlow.

### Phase 4 — Home
**Status:** not started
> Do Phase 4 of dashboard/docs/BUILD_PLAN.md (SPEC §3.1 and §3.4): plan first. Home header (goal ring with pace hint, streak, work, sleep, counters with 7-day average, freshness), today's target chips (deep link into TaskFlow's timer), Needs attention, Coming up (from `taskflow_dashboard_deadlines` — if it doesn't exist yet, hide the section and note it), app tiles (launcher or hosted URL), quick links; generic app detail pages. Missing data shows "no data", never 0. Test the empty states with zero apps published.

**Done when:** Home answers "how's today going" at a glance on the Mac and at 375px; every number matches its app.
**You:** set Home as the Mac browser's start page; use it for 3 days and note anything you look for and can't find.

### Phase 5 — Week, targets, weekly review
**Status:** not started
> Do Phase 5 of dashboard/docs/BUILD_PLAN.md (SPEC §3.2, §3.6 targets editor, `review.ts`): plan first. Week screen (this vs last week, target bars and day hit rates, stacked daily bars with days off greyed), target editor, weekly review form that saves notes + a frozen `snapshot`, review banner on Home on review day, past reviews list. Tests: week windows with `week_starts_on`, deltas, snapshot unchanged after later app edits.

**Done when:** I can set "DSA 60 min/day Mon–Fri" and "Tableau 5 h/week", see progress, and save a review whose numbers don't change afterwards.
**You:** set your real targets; do the first review on Sunday.

### Phase 6 — Trends
**Status:** not started
> Do Phase 6 of dashboard/docs/BUILD_PLAN.md (SPEC §3.3): plan first. Ranges, all charts, stats (averages excluding days off, best day/week, longest streak), rule notes on charts. Lazy-load charts. Check every chart at 375px and in dark mode.

**Done when:** the 90-day heatmap and the stacked tag chart match Insights in TaskFlow for the same days.

### Phase 7 — Backups, login start, health warnings
**Status:** not started
> Do Phase 7 of dashboard/docs/BUILD_PLAN.md (SPEC §3.5 database section, §4 launchd, §5): plan first. `launcher/backup.sh` + `/backup` endpoint + weekly launchd job; `docs/RESTORE.md`, tested by restoring a dump into local Postgres; launchd plist for `start-os.sh` at login with install/uninstall steps; System warnings for stale app data (2 days), quiet database (5 days) and old backup (8 days).

**launchd note:** launchd starts jobs with a minimal PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), so `npm`, `node`, `python` and `pg_dump` may not be found. The plist must set `EnvironmentVariables` → `PATH` explicitly (or use absolute paths), and `launcher/backup.sh` must do the same. (`start-os.sh` already prepends `/opt/homebrew/bin:/usr/local/bin`; check where `node` and `pg_dump` actually are with `command -v`.)

**Done when:** a backup file appears in `backups/`, a restore into local Postgres works, and after a reboot Home opens by itself.

### Phase 8 — Host it (`os.<my-domain>`)
**Status:** not started
> Do Phase 8 of dashboard/docs/BUILD_PLAN.md (SPEC §6): plan first. PWA (manifest, icons, update prompt), Vercel config for a project rooted at `dashboard/` in the PersonalOS repo, SPA rewrites, env vars. Write the click-by-click steps: create the Vercel project, set root directory and env vars, add `os.<my-domain>` in Vercel → Domains, add the URL in Supabase → Authentication → URL Configuration, install on iPhone. Confirm nothing tries to reach the launcher when hosted.

**Done when:** `os.<my-domain>` works on mobile data, installs on the iPhone, and shows the same numbers as the Mac.

---

## Later (SPEC §7)
AI weekly summary (Edge Function + Claude) · evening nudges via web push · year in review / monthly report · ⌘K command palette · per-app access allowlist.
