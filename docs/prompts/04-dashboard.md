# Prompt 04 — Build the dashboard + launcher
Only after prompts 01–03 pass. Run Claude Code **in the `PersonalOS/` root** and say: *"Read docs/prompts/04-dashboard.md and follow it."*

---

Read `CLAUDE.md`, `docs/ARCHITECTURE.md` (especially sections 4–6), `docs/CONTRACT.md` and `docs/INTEGRATION_REPORT.md`. Then read each existing app's `docs/DATA_CONTRACT.md`, **but nothing else inside the app folders**. The dashboard must work only from the contract views.

**Do not write code yet.** Reply with a plan and wait for approval. Build in phases and stop after each.

## What to build
`dashboard/` (part of the PersonalOS root repo, not its own repo) with:
1. **`supabase/os_core.sql`** (root), idempotent:
   - `os_settings` (per user: `daily_goal_minutes` default 240, `timezone` default `America/Toronto`)
   - views `os_daily_activity` and `os_apps_now` as a `union all` of the **standard columns only** of each app's dashboard views that exist today (`trading`, `dsa`)
   - all with `security_invoker` and RLS like every other table
   - a comment block explaining how to add an app to the unions
2. **Dashboard UI** on port **5170** (strict).
   - Stack: Vite + React + TypeScript + Tailwind + Recharts, matching InteractiveDSA. Use supabase-js with the anon key from `dashboard/.env.local`, and sign in with the same account.
   - Read-only, except `os_settings`. `items_planned` is only reliable for today (apps may report the current plan on every row), so never compute a historical completion rate from it.
   - Layout as in ARCHITECTURE §5:
     - **Header:** overall streak (consecutive days with any row in `os_daily_activity`), today's minutes vs goal, sync health
     - **App tiles:** `status_line`, `needs_attention`, last activity, a running/stopped dot, Start/Open buttons
     - **14-day stacked bar chart** of `active_minutes` by app
     - **90-day heatmap**
     - **Needs attention** list
     - **Averages:** 7- and 30-day average hours/day, best day
     - **Per-app detail page:** that app's extras from its `_now` view plus a 30-day table from its `_daily` view, showing extra columns generically. The dashboard must not need code changes when an app adds a column.
   - Works at 375px width, dark mode. Handles empty days and apps with no data yet ("No data yet"). If Supabase can't be reached, show the last loaded data with a warning.
3. **Launcher API** on **127.0.0.1:5171** only (Node, no framework needed).
   - `launcher/apps.json` holds each app's `key`, `name`, `folder`, start command, port and URL.
   - Endpoints:
     - `GET /status`: checks each port
     - `POST /start/:key` and `POST /stop/:key`: spawn or kill **only commands listed in apps.json** as separate child processes, with logs in `launcher/logs/` (gitignored)
     - `GET /logs/:key`: last 200 lines
   - CORS allows only `http://localhost:5170`. Never run arbitrary commands from the request. Don't auto-restart in loops. Stopping the launcher must not kill apps it didn't start.
   - If the launcher is down, the dashboard still shows all data, and the tiles say "launcher offline".
4. **`start-os.sh`** (root) starts the launcher and the dashboard, plus every app if `--all` is passed, and opens the browser. Add `launcher/com.personalos.start.plist` with install/uninstall instructions so it runs at login.
5. **Backups:** `launcher/backup.sh` runs `pg_dump` using `SUPABASE_DB_URL` from the **root** `.env.local` (never in any app), writes `backups/YYYY-MM-DD.sql.gz` and keeps the newest 8. Run it weekly (launchd or launcher timer) and show "last backup: date" in the dashboard header via the launcher API.
6. **Docs:**
   - `dashboard/README.md`
   - update the registry in root `CLAUDE.md` and `docs/ARCHITECTURE.md` for anything that changed
   - a line in `docs/DECISIONS.md`
   - `.env.example` files

## If TaskFlow exists by then (see `docs/ROADMAP.md` and `docs/DECISIONS.md`)
- Add `taskflow` to both unions.
- "Productive hours" = per day, per TaskFlow tag of kind `study` or `hustle`: `max(TaskFlow minutes for that tag from taskflow_dashboard_area_daily, that app's active_minutes)` for tags with an `app_key` (DSA, Trading), plus TaskFlow minutes for the other study/hustle tags. Don't sum TaskFlow and app minutes for the same tag. Also show hours at work (`work_minutes`, `commute_minutes`) and cigarettes/weed counts from `taskflow_dashboard_daily` extras.
- Read `taskflow_dashboard_days_off`: show days off on the heatmap, and skip them when computing the overall streak and daily-goal averages.
- Add a "balance" card: wellness, break, sleep and personal minutes from `taskflow_dashboard_daily` extras — shown, never counted toward the goal.

## Done when
- `supabase/checks.sql` passes
- the dashboard shows real rows from both apps
- stopping either app turns its tile dot red, and nothing else breaks
- Start brings the app up
- killing the launcher leaves the data visible
- `backup.sh` produces a file
