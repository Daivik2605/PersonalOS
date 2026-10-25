# PersonalOS — architecture

## 1. The idea
One place that shows everything I'm working on: learning, trading practice, time, habits, money, job search. It's built as **small independent apps** that each do one job well, plus a **dashboard** that shows a summary of all of them.

```
 chart-journal :5173    InteractiveDSA :5174   taskflow :5175 jobs :5176   money :5177
   trading_* tables       Dexie (local) ──sync──▶ dsa_* tables    taskflow_*   jobs_*      money_*      habit_*
        │                        │                                  │            │            │            │
        └────────────────────────┴───────────── ONE Supabase project (Postgres + Auth + Storage) ──────────┘
                                                        │   each app publishes *_dashboard_daily / *_dashboard_now
                                                        ▼
                         dashboard :5170  ── reads os_daily_activity, os_apps_now
                         launcher API :5171 ── starts/stops apps, reports which ports are up
```

**Why this shape**
- **Isolation:** each app is its own process and its own git repo. If one crashes or has a bug, the rest keep working.
- **One database:** the dashboard can combine everything in one query, there's one login, and it fits the free plan.
- **The dashboard reads data, not apps:** it shows full results even when no app is running. The app tiles only need the apps running for **Open**.
- **Contracts between apps:** the only thing apps agree on is the view shape in `docs/CONTRACT.md`.

The app registry (ports, prefixes, status) is in the root `CLAUDE.md`.

## 2. Data
- **Ownership:** an app owns every object with its prefix and its SQL lives in its repo (`<app>/supabase/`). The dashboard owns `os_*` and `supabase/os_core.sql`.
- **Security:** RLS on every table, `security_invoker` on every view, anon key only in apps. One user (me), but RLS is still on so a leaked anon key exposes nothing.
- **Dates:** local `YYYY-MM-DD` for days, `timestamptz` for moments.
- **Offline apps (DSA):** local store stays the source of truth; an outbox pushes changes to Supabase; the app writes its own daily summary table.
- **Online apps (chart-journal, future apps):** write straight to Supabase; views are plain SQL.
- **Files:** Supabase Storage, one bucket per app with the app's prefix (`trading-screenshots`), with files under `<user_id>/…`.

## 3. Login
- One email/password account in the one Supabase project, used by every app.
- Each port is a separate browser origin, so you sign in **once per app**; sessions persist after that.
- Supabase → Authentication → Email: turn **off** "Confirm email" (otherwise confirmation links need every port in the redirect URL list).

## 4. Launcher
- `launcher/` (part of the dashboard work): a small local Node server on **5171** with an `apps.json` listing each app's folder, start command and port.
- `GET /status` checks each port; `POST /start/:app` and `POST /stop/:app` spawn or kill that app as a **separate child process**, with logs to `launcher/logs/<app>.log`.
- One command `./start-os.sh` starts the launcher + dashboard (and optionally every app). A macOS `launchd` plist runs it at login.
- A crashed app only shows a red dot on its tile. The launcher never restarts apps in a loop.

## 5. What the dashboard looks like
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ PersonalOS        Sat 24 Oct          🔥 12-day streak    Today 2h 35m / 4h goal   ● synced │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ APPS                                                                                    │
│ ┌ DSA ────────── ● running ┐ ┌ Chart Journal ─ ○ stopped ┐ ┌ Timer ─── coming soon ┐   │
│ │ Week 3 · Day 2            │ │ 4/6 charts today          │ │                         │   │
│ │ 2 left today · 3 catch-up │ │ 5 guesses to grade        │ │                         │   │
│ │ [Open]                    │ │ [Start]                   │ │                         │   │
│ └───────────────────────────┘ └───────────────────────────┘ └─────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ LAST 14 DAYS — active minutes, stacked by app (bar chart)                                │
│ ▂▅▇▃▁▆█▅▄▇▆▃▅▇                                                                            │
├──────────────────────────────────────────────┬───────────────────────────────────────┤
│ CONSISTENCY — 90-day heatmap (any activity)  │ NEEDS ATTENTION                        │
│ ░▒▓█▒░ ...                                   │ • DSA: 3 catch-up items                │
│                                              │ • Trading: 5 guesses ready to grade    │
├──────────────────────────────────────────────┴───────────────────────────────────────┤
│ AVERAGES   7-day avg 2.8 h/day · 30-day avg 2.1 h/day · best day 5h 10m              │
└──────────────────────────────────────────────────────────────────────────────────────┘
 Click any app tile → that app's detail page on the dashboard (its _dashboard_now extras + 30-day history)
```
- **Header:** overall streak (days where any app had activity), today's minutes vs a daily goal set in dashboard settings, and sync health.
- **App tiles:** from `os_apps_now` + launcher `/status`. Start/Open buttons and a status dot.
- **Charts:** from `os_daily_activity`: stacked minutes per app, a 90-day heatmap, and 7/30-day averages.
- **Needs attention:** every app's `needs_attention` > 0, biggest first.
- **Later cards as apps arrive:** hours per day (TaskFlow's timer, which becomes the main source of "productive hours"), job pipeline counts, cigarettes/joints trend, month in vs out and top spending categories.

## 6. Memory — making sure nothing is lost
**Data**
- Supabase is the shared copy. On the free plan you can't count on getting backups back, so run a **weekly `pg_dump`** from the launcher (DB connection string in `PersonalOS/.env.local` only) into `PersonalOS/backups/` (gitignored). Keep the last 8.
- DSA keeps its local copy plus the cloud mirror. Also do a monthly **Settings → Export**.
- Free Supabase projects pause after about a week of no use. Opening any app regularly prevents it; if it pauses, resume it from the Supabase website.

**Claude Code's memory (so every session starts informed)**
- Root `CLAUDE.md` = system rules (short, rarely changes). App `CLAUDE.md` = app rules. Claude Code loads both automatically.
- Specs and plans live in each app's `docs/`, not in conversations. End every session with: *"Update the build plan status and DATA_CONTRACT.md for anything that changed."*
- `docs/DECISIONS.md` = one dated line per design decision and why, so later sessions don't undo them.
- Don't put progress logs or long history in CLAUDE.md. Keep it rules only, so it stays short and gets followed.

## 7. Using it day to day
- **Morning:** open the dashboard (it starts at login), check *Needs attention*, open the app you're working in.
- **During the day:** work in the apps; each one records its own data.
- **Evening (2 minutes):** look at today's minutes and streak.
- **Weekly:** look at the 14-day chart, check the backup ran, export DSA monthly.
- **Building:** one app or phase per Claude Code session, started inside that app's folder. Run `docs/prompts/03-verify-integration.md` from the root after any database change.

## 8. Adding a new app (checklist)
1. Pick a prefix and port; add them to the registry in root `CLAUDE.md` and in section 4 (`apps.json`).
2. Create its folder as its own git repo with its own `CLAUDE.md`, and add the folder to the root `.gitignore`.
3. Write `<app>/supabase/<prefix>schema.sql` following the database rules.
4. Publish `<prefix>dashboard_daily` and `<prefix>dashboard_now` per `docs/CONTRACT.md`; document them in `<app>/docs/DATA_CONTRACT.md`.
5. Add both views to the unions in `supabase/os_core.sql`, and re-run it.
5b. Hook the app's "start work" moments to `taskflow_end_reset` (`docs/prompts/07-reset-hook.md`).
6. Run the verify prompt.

## 9. Build order
1. Shared Supabase project + chart-journal on `trading_` tables (`docs/prompts/01-chart-journal.md`)
2. DSA sync (`docs/prompts/02-dsa-sync.md`)
3. Verify (`docs/prompts/03-verify-integration.md`)
4. Dashboard + launcher (`docs/prompts/04-dashboard.md`)
5. Then one new app at a time, per `docs/ROADMAP.md`: TaskFlow (replaces the timer idea; may be built before the dashboard since it works on its own) → money → SQL → cert prep. Jobs stays an idea.
