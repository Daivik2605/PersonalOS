# PersonalOS — architecture

What it does: `CAPABILITIES.md`. Where each area of my life lives: `ROADMAP.md`. Ports, prefixes and status: the registry in root `CLAUDE.md`. Every design decision and the reason for it: `DECISIONS.md`.

## 1. Shape
```
 chart-journal :5173      InteractiveDSA :5174          TaskFlow :5175 (+ hosted on a subdomain)
 trading_* tables         Dexie (local) ─outbox sync─▶   taskflow_* tables
        │                      dsa_* tables                    │   ▲
        │                         │                            │   │ taskflow_end_reset()  ← the one shared call:
        │                         │                            │   │   starting work in any app ends a nap/reset
        └─────────────────────────┴──────── ONE Supabase project (Postgres + Auth + Storage) ─┘
                          each app publishes *_dashboard_daily / *_dashboard_now (+ TaskFlow: _area_daily, _days_off)
                                                    │
                    dashboard :5170 ── reads os_daily_activity, os_apps_now, os_productive_daily, os_streak
                    launcher  :5171 ── starts/stops apps on the Mac, reports ports, shows logs and last backup
```
- **Isolation:** each app is its own process and its own GitHub repo. One crashing or breaking never affects the others.
- **One database:** the dashboard can combine everything, I have one login, and it fits the free plan.
- **The dashboard reads data, not apps:** it shows everything even when no app is running. Only Start/Open need the launcher.
- **TaskFlow is the general layer:** tasks, time, work, sleep, habits, inbox, projects and days off for every area. A dedicated app exists only where real logic is needed (DSA, chart-journal, later money, SQL, cert).

## 2. Data
- **Ownership:** an app owns every object with its prefix, and its SQL lives in its own repo (`<app>/supabase/`). The dashboard owns `os_*` and `supabase/os_core.sql`.
- **Contracts:** apps agree only on the view shapes in `CONTRACT.md` and the shared calls listed there. Views are append-only once released.
- **Security:** RLS on every table, `security_invoker` on every view, the anon key only in apps, sign-ups off. Secrets that must exist (the Claude API key for photo reading, the DB password for backups) live in Supabase secrets or the root `.env.local`, never in an app or a repo.
- **Dates:** days are America/Toronto `date`s, moments are `timestamptz`, and anything crossing midnight is split across days.
- **Time accounting:**
  - Every minute has one tag, and productive means Study + Hustle.
  - When a TaskFlow tag is linked to an app (DSA, Trading), the dashboard counts `max(TaskFlow minutes, app minutes)` per day, so a session isn't counted twice.
- **Offline app (DSA):** Dexie is the source of truth, with an outbox pushing to `dsa_*`. It writes its own summary rows.

## 3. Login
- One email/password account. Supabase sign-ups are **off**, and new users are only created by hand.
- Each port or domain is a separate browser origin, so you sign in once per app.

## 4. Running and hosting
**On the Mac (now):**
- The launcher on 5171 starts each app from `launcher/apps.json` as a child process, and only stops processes it started.
- `start-os.sh` starts the launcher and the dashboard (plus every app with `--all`). A launchd file runs it at login.
- Fixed ports with strict mode: if a port is taken, the app refuses to start rather than moving.

**Hosted (TaskFlow at its phase 3; the dashboard after it works locally):**
- Both are static builds on **Vercel**, each its own Vercel project, on subdomains of my Vercel domain, e.g. `tasks.<domain>` for TaskFlow and `os.<domain>` for the dashboard.
- TaskFlow's Vercel project uses the `taskflow` repo. The dashboard's uses the `PersonalOS` repo with **root directory `dashboard/`**.
- Env vars are set in Vercel: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The dashboard's hosted build leaves `VITE_LAUNCHER_URL` unset, which hides Start/Stop.
- Add each subdomain in Vercel → Project → Settings → Domains. Because the domain's DNS is on Vercel, it connects automatically.
- Add each URL in Supabase → Authentication → URL Configuration.
- Nothing on the Mac is exposed. The hosted pages talk only to Supabase, and the data is protected by login plus RLS.
- chart-journal and DSA stay local. Both are static, so they could be hosted the same way later if needed.

## 5. What the dashboard looks like
```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ PersonalOS  Sat 24 Oct   ◔ 2h 35m / 4h productive   🔥 12 days   Work 7h 25m   Sleep 7h 10m │
│                                                    🚬 3 today (7-day avg 5)  🌿 1    ● fresh 2m │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ NEEDS ATTENTION   TaskFlow: 2 overdue tasks · DSA: 3 catch-up + redos · Trading: 5 guesses   │
│                   to grade · 1 shift not checked vs paystub · AEO Studio going cold (34 d)  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ APPS  [TaskFlow ● 4 left today · ⏱ DSA 25m]  [DSA ● Week 3 · Day 2]  [Trading ○ 4/6 charts] │
├───────────────────────────────────────────────┬────────────────────────────────────────┤
│ PRODUCTIVE — 14 days, stacked by tag           │ BALANCE — wellness · break · sleep · nap │
│ (DSA, Trading, SQL, certs, AEO Studio)          │ WORK — hours per week, commute separate  │
├───────────────────────────────────────────────┼────────────────────────────────────────┤
│ CONSISTENCY — 90-day heatmap (days off marked) │ HABITS — cigarettes / weed per day, 7-d avg │
├───────────────────────────────────────────────┴────────────────────────────────────────┤
│ AVERAGES  7-day 2.8 h/day · 30-day 2.1 h/day (days off excluded) · best day 5h 10m        │
└────────────────────────────────────────────────────────────────────────────────────────┘
 Click an app tile → its detail page (all its _now extras + a 30-day table of its _daily columns)
```

## 6. Memory — making sure nothing is lost
**Code:** each app and the root are separate GitHub repos (private), and you commit at the end of every phase. Claude never runs git.

**Data:**
- A weekly `pg_dump` to `backups/` (gitignored, keeps 8), set up in the dashboard phase.
- Free Supabase projects pause after about a week with no use. Daily use prevents it.

**Claude Code's memory:**
- Root `CLAUDE.md` holds the system rules and the registry. Each app's `CLAUDE.md` holds that app's rules. Both load automatically.
- Specs and build plans live in each app's `docs/`, and each phase updates its status line.
- `DECISIONS.md` gets one dated line per decision, so later sessions don't undo earlier choices.
- With three apps in parallel, each session edits **only** its own folder plus append-only lines in root docs. Commit after each phase so a clash can be undone.

## 7. Using it day to day (once the apps are finished)
- **Morning:** open the dashboard and check Needs attention. On the phone, TaskFlow's Today screen.
- **During the day:**
  - Start the timer (or a task's ▶) in TaskFlow, or work in DSA or chart-journal, which record their own time.
  - Tap the counters.
  - Punch in and out of shifts in TaskFlow.
- **Evening:** productive time vs goal, the streak, and what's left for tomorrow.
- **Weekly:** look at the 14-day charts, check a paystub when one arrives, and check that the backup ran.
- **Building:** one app or phase per Claude Code session, started inside that app's folder. Re-run `prompts/03-verify-integration.md` and `supabase/checks.sql` after any database change.

## 8. Adding a new app (checklist)
1. Check `CAPABILITIES.md` → "How to judge a new idea". Could TaskFlow do it?
2. Pick a key, prefix and port. Add them to the registry in root `CLAUDE.md`, the prefix lists in `supabase/checks.sql`, and `launcher/apps.json`.
3. Make it its own private GitHub repo with its own `CLAUDE.md`, and add the folder to the root `.gitignore`.
4. Write `<app>/supabase/<prefix>schema.sql` following the database rules, and test it on local Postgres with Supabase stand-ins.
5. Publish `<prefix>dashboard_daily` and `<prefix>dashboard_now` per `CONTRACT.md`, document them in `<app>/docs/DATA_CONTRACT.md`, and re-run `supabase/os_core.sql`. If its minutes are study or hustle, add it to `os_app_kind`.
6. Hook its "start work" moments to `taskflow_end_reset` (`prompts/07-reset-hook.md`), and link a TaskFlow tag to it (`app_key`) so the max-rule applies.
7. Run the verify prompt.
