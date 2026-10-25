# Prompt 04 — Dashboard + launcher (local on the Mac first, hostable later)
Start when **TaskFlow phase 4.5** is done (its dashboard views exist). chart-journal's views already exist; DSA joins later by re-running `supabase/os_core.sql` once its sync is done.
Run Claude Code **in the `PersonalOS/` root** and say: *"Read docs/prompts/04-dashboard.md and follow it."*

---

Read `CLAUDE.md`, `docs/CAPABILITIES.md`, `docs/ARCHITECTURE.md`, `docs/CONTRACT.md`, `docs/ROADMAP.md` and `docs/DECISIONS.md`. Then read each app's `docs/DATA_CONTRACT.md` (`chart-journal/`, `taskflow/`, `InteractiveDSA/`), **but nothing else inside the app folders**. The dashboard works only from the contract views (`*_dashboard_*`), never from app tables.

**Do not write code yet.** Reply with a plan, including the exact SQL for the max-rule and the streak, and wait for approval. Build in the phases at the bottom and stop after each.

## What the dashboard is for
It's the "See everything" capability in `docs/CAPABILITIES.md`: one screen answering how today is going against my goal, what needs attention, and how the last weeks went across study, work, balance and habits. It **reads only**; I change things in the apps. Days off are set in TaskFlow, not here.

## 1. `supabase/os_core.sql` (root, owned by the dashboard, idempotent)
- `os_settings`: per user, with `daily_goal_minutes` (default 240), `timezone` (default `America/Toronto`) and `updated_at`. Standard `user_id`, RLS, `"own rows"`.
- `os_app_kind` view: constant rows mapping an app key to the tag kind its minutes belong to: `('trading','study')`, `('dsa','study')`. Later apps get added here.
- **Self-assembling unions.** A `do $$ … $$` block finds every `public.*_dashboard_daily` and `*_dashboard_now` view whose leading columns match `docs/CONTRACT.md`. It then `create or replace`s:
  - `os_daily_activity`: a `union all` of the standard columns of every app's daily view
  - `os_apps_now`: a `union all` of the standard columns of every app's now view

  Re-running the file after an app publishes its views adds that app. With no app views at all, it still creates valid empty views.
- `os_productive_daily` (user_id, day, minutes, by_source jsonb), using the **max-rule**:
  - TaskFlow minutes come from `taskflow_dashboard_area_daily` where kind is `study` or `hustle`.
  - For each app key (e.g. `dsa`), that day's productive minutes for it = `max(TaskFlow minutes on tags whose app_key = that app, the app's own active_minutes)`.
  - Tags without an `app_key` count as they are.
  - An app's minutes with no TaskFlow time that day still count, using `os_app_kind` to decide whether they're productive.
- `os_streak` (one row per user): current and longest streak of days with productive minutes > 0. Days in `taskflow_dashboard_days_off` neither break nor extend it, and today doesn't break it until the day ends.
- Every view uses `security_invoker = true`, every table and view is granted to `authenticated`, and `supabase/checks.sql` passes. Test on local Postgres with Supabase stand-ins, the way chart-journal and TaskFlow were tested. Use fixtures for two users, a day off, a day where a TaskFlow DSA session and DSA's own minutes overlap (counted once), and a missing app.

## 2. Dashboard UI: `dashboard/`, port 5170 (strict)
- **Stack:** Vite + React + TypeScript + Tailwind + Recharts (same as TaskFlow). Use supabase-js with the anon key from `dashboard/.env.local`, and the same login as the other apps.
- **Read-only,** except `os_settings`.
- **Header:**
  - productive today vs goal (a progress ring)
  - productive streak (with days off skipped)
  - work hours today and this week
  - last night's sleep
  - today's cigarette and weed counts
  - data freshness: the newest `updated_at`
- **Needs attention:** every app's `needs_attention` above 0, biggest first, with its `attention_label`. Also projects going cold, and shifts not yet checked against the store's numbers.
- **App tiles:** from `os_apps_now`, showing `status_line`, last activity and a status dot. When the launcher is available, add Start/Stop/Open buttons.
- **Charts:**
  - productive minutes per day for 14 days, stacked by tag (max-rule applied)
  - a 90-day consistency heatmap (days off shown differently)
  - balance per day: wellness, break, sleep, nap/reset
  - work and commute hours per week
  - cigarette and weed counts per day, with a 7-day average
  - tasks done vs missed per week
- **Averages:** 7- and 30-day average productive hours per day (days off excluded), and the best day.
- **App detail page:** that app's `_now` extras, plus a 30-day table from its `_daily` view showing **any** extra columns generically. Adding a column to an app must need no dashboard change.
- **Rules:**
  - Never compute a historical completion rate from `items_planned`, except where a contract doc says it's reliable (TaskFlow's is; chart-journal's isn't).
  - Works at 375px wide and in dark mode.
  - Empty states say "No data yet" per app.
  - If Supabase is unreachable, show the last loaded data with a warning.
- **Hostable later:** the launcher is optional. Use `VITE_LAUNCHER_URL` (set in `.env.local` on the Mac, unset when hosted). When it's unset, hide Start/Stop and logs, and show Open links only for apps that have a hosted URL. Don't add any hosting config yet.

## 3. Launcher: `launcher/`, 127.0.0.1:5171 only (Node, no framework needed)
- `launcher/apps.json` lists each app's key, name, folder, start command, port, local URL and optional hosted URL:
  - chart-journal: `sh start.sh`, port 5173
  - InteractiveDSA: `npm run dev`, port 5174
  - TaskFlow: `npm run dev`, port 5175
- **Endpoints:**
  - `GET /status`: is each port up?
  - `POST /start/:key` and `POST /stop/:key`: spawn or kill **only commands listed in apps.json**, as separate child processes. Stop only processes the launcher started, using their PID, and never kill by name.
  - `GET /logs/:key`: the last 200 lines, from logs kept in gitignored `launcher/logs/`
  - `GET /backup`: the date of the last backup
- **Safety:**
  - CORS allows only `http://localhost:5170`.
  - Never run anything that comes from a request.
  - Never restart apps in a loop.
- **If the launcher is down,** the dashboard still shows all its data, and the tiles say "launcher offline".

## 4. Starting it
- `start-os.sh` (root) starts the launcher and the dashboard, plus every app if `--all` is passed, then opens the browser.
- `launcher/com.personalos.start.plist` runs it at login, with install and uninstall steps in `dashboard/README.md`.

## 5. Backups
- `launcher/backup.sh` runs `pg_dump` using `SUPABASE_DB_URL` from the **root** `.env.local` (never in any app folder).
- It writes `backups/YYYY-MM-DD.sql.gz` and keeps the newest 8.
- It runs weekly through launchd. The dashboard header shows "last backup: date".

## 6. Docs
- Write `dashboard/README.md` and `.env.example` files.
- Update the registry in root `CLAUDE.md`, `docs/ARCHITECTURE.md` (anything that changed) and `docs/DECISIONS.md`.
- The dashboard lives in the PersonalOS root repo. It isn't its own repo.

## Phases (stop after each)
1. `os_core.sql`: self-assembling unions, the max-rule, the streak, and local Postgres tests
2. Dashboard UI with real data (header, attention, tiles without the launcher, charts, detail pages)
3. Launcher, `start-os.sh` and launchd
4. Backups, plus a hosting-readiness check: build with `VITE_LAUNCHER_URL` unset and confirm nothing breaks

## Done when
- `supabase/checks.sql` passes.
- The dashboard shows real rows from TaskFlow and chart-journal.
- A DSA session timed in TaskFlow and logged in DSA counts once.
- A day off doesn't break the streak.
- Stopping an app turns its dot red and nothing else breaks.
- Start brings the app back up.
- Killing the launcher leaves all the data visible.
- `backup.sh` produces a file.
