# PersonalOS Home — spec

The hub of PersonalOS: one screen that shows how my days are going across every app, plus a launcher that starts the apps on my Mac. Folder `dashboard/`, app key `os`. System rules: `../../CLAUDE.md`. What PersonalOS does: `../../docs/CAPABILITIES.md` (this app *is* capability 8, "See everything"). Contract it reads: `../../docs/CONTRACT.md`.

Sections are numbered so the build plan can point at them (e.g. "SPEC §3.2").

---

## 0. Goal

**Know in 10 seconds whether my days are going where I want them to — and get back on track fast.**

The apps each record one part of my life. Only here do the parts meet. Home answers:
1. **Today:** how much productive time so far vs my goal, what's left, and what needs attention.
2. **This week:** am I hitting my targets (DSA, certs, AEO Studio…)? How do work, sleep and habits compare with last week?
3. **Over time:** am I getting more consistent? Where does my time actually go? Are cigarettes and weed going down?
4. **Is the system healthy?** Which apps are running? Is each app's data fresh? Did the backup run?

**Success measures** (check after a month of use):
- I open it every day. It's the first page on the Mac and on the phone home screen once hosted.
- Answering "how's today going" takes 10 seconds or less.
- I do the weekly review on at least 3 Sundays out of 4.
- Its numbers match each app's own screens. Any difference is a bug.
- I enter nothing here except targets and review notes.

**Principles**
- **Reads, never writes, to other apps.** Wherever an action is needed, it deep-links to the app that owns it, such as starting a timer in TaskFlow.
- **Honest numbers:**
  - Show how fresh each app's data is.
  - Missing data shows as "no data", never as 0.
  - Counting rules (the max-rule, days off) are stated on screen where they apply.
- **Works with any subset of apps.** An app that hasn't published views yet simply isn't shown.
- **Glance first, drill down second.** Home fits on one screen, and the details are one click away.

**Not this app's job:** recording activity (the apps do that), editing tasks, shifts or study progress, or re-implementing any app's rules.

## 1. Stack and app rules
- Vite + React + TypeScript + Tailwind + React Router + Recharts + Vitest, the same stack as TaskFlow. supabase-js with the anon key from `.env.local`, and the same email/password account.
- UI port **5170** (strict). Launcher on **127.0.0.1:5171**, a Node server with no framework.
- Days are America/Toronto dates via `src/lib/time.ts` (copy TaskFlow's tested module).
- Pure, unit-tested modules in `src/lib/`:
  - `productive.ts` (presentation of the max-rule results)
  - `targets.ts` (period windows, progress, pace)
  - `review.ts` (week snapshot, week-over-week deltas)
  - `health.ts` (freshness and staleness rules)
- Mobile-first at 375px wide, with a sidebar from 1024px. Dark mode follows the system, with an override.
- If Supabase is unreachable, keep showing the last loaded data with a banner and its timestamp.
- **Optional launcher:** `VITE_LAUNCHER_URL` is set on the Mac and unset when hosted. When it's unset, Start/Stop, logs and port status are hidden. Everything else works.

## 2. Data — `../../supabase/os_core.sql` (idempotent, tested on local Postgres before I run it)

### 2.1 Tables (own data; standard `user_id`, RLS, `"own rows"`, `updated_at` trigger)
- **`os_settings`** (one row per user):
  - `daily_goal_minutes` (240)
  - `week_starts_on` (1 = Monday)
  - `review_day` (0 = Sunday)
  - `timezone` (`America/Toronto`)
  - `app_urls jsonb` (hosted URL per app key, for Open links when hosted)
  - `theme`
- **`os_targets`**:
  - `id`
  - `label`
  - `scope`: `total` (all productive time), `tag` (a TaskFlow tag path such as `Study/DSA`), or `app` (an app key)
  - `key`
  - `period`: `day` or `week`
  - `minutes`
  - `weekdays int[]` (day targets only; null means every day; days off are always skipped)
  - `active`
  - `sort`

  Examples: DSA 60 min/day Mon–Fri; Tableau cert 5 h/week; AEO Studio 4 h/week.
- **`os_reviews`**:
  - `week_start date`, unique per user
  - `rating` 1–5
  - `went_well`, `didnt_go_well`, `next_focus` (text)
  - `snapshot jsonb`: the week's numbers frozen when the review is saved, so later edits in apps don't rewrite history

### 2.2 Views (all `security_invoker`, granted to `authenticated`)
- **`os_daily_activity` / `os_apps_now`** are self-assembling unions. A `do $$` block finds every `*_dashboard_daily` and `*_dashboard_now` view whose leading columns match `CONTRACT.md`, and recreates the union over their standard columns. Re-running the file adds new apps. With no app views at all, it still creates valid empty views.
- **`os_app_kind`**: constants mapping an app key to the kind its minutes count as: `trading → study`, `dsa → study`.
- **`os_tag_daily`** (user_id, day, parent_tag, tag, kind, app_key, minutes, source):
  - starts from TaskFlow's `taskflow_dashboard_area_daily`
  - for tags with an `app_key`, minutes = **max(TaskFlow minutes, that app's `active_minutes`)**
  - app minutes with no matching TaskFlow row that day appear under the app's linked tag, or under `Study/<app>` if no tag is linked
- **`os_productive_daily`** (user_id, day, minutes, is_day_off): the sum of `os_tag_daily` where kind is `study` or `hustle`.
- **`os_streak`** (user_id, current, longest, last_productive_day): days with productive minutes > 0. Days off neither break nor extend it, and today only breaks it once the day is over.
- **`os_target_progress`** (user_id, target_id, period_start, period_end, minutes, target_minutes, pct, on_pace): for the current day or week of each active target.
- **`os_week_summary`** (user_id, week_start, plus):
  - productive minutes, broken down by tag as jsonb
  - work and commute minutes
  - average sleep
  - nap/reset minutes
  - tasks done and missed, deadlines missed
  - cigarettes, weed
  - days off

  Built from the views above plus TaskFlow's daily extras.
- **`os_contract_health`** (app, view, exists, columns_ok, contract_version): built from `information_schema`. It powers the System page and is a browser-side version of `checks.sql` queries 6, 7 and 10.

### 2.3 Needed from other apps (contract requests, not reads of their tables)
- **Money:** `money_dashboard_daily`, `_now` and `_monthly` (Money phase 6).
- **TaskFlow** (already in its phase 4.5): `_daily`, `_now`, `_area_daily`, `_days_off`, plus a fifth view **`taskflow_dashboard_deadlines`** (user_id, task_id, title, tag, due_on, days_left, hard_deadline). It holds open tasks with a hard deadline in the next 60 days, plus every task in a project marked as an exam. It feeds the countdowns on Home, such as cert exam dates and "Pass G2".
- **TaskFlow deep links:** documented routes that Home links to: `/timer?tag=<path>`, `/tasks?view=today`, `/insights`, `/work`, `/capture`.
- **chart-journal, DSA:** nothing beyond their existing contract views.

## 3. Screens
Phone tabs: **Home · Week · Trends · System**, with Settings under the profile menu. Desktop: a sidebar with the same items.

### 3.1 Home (today)
- **Header:**
  - productive today vs goal (a ring), with "Xh left to goal" and an "on pace / behind" hint based on the time of day
  - productive streak (🔥, days off skipped)
  - today: work hours, last night's sleep, cigarette and weed counts (with the 7-day average)
  - data freshness: "updated 2m ago"
- **Today's targets:** a chip per day target, e.g. "DSA 25/60 min". Tapping it deep-links into TaskFlow's timer with that tag.
- **Needs attention:**
  - every app's `needs_attention` above 0, biggest first, each linking into the app
  - shifts not yet checked against the store's numbers
  - projects going cold
  - "Weekly review due" on review day
- **Money (once the Money app publishes its views):** this month in · out · **net**, subscriptions per month, and "N to categorise". Read-only, from `money_dashboard_now`; amounts are hidden behind a tap on the phone.
- **Coming up:** hard deadlines from `taskflow_dashboard_deadlines`, with a countdown, amber within 7 days and red within 2.
- **Apps:** a tile per app showing `status_line`, last activity and a running dot. Start/Open use the launcher when it's available, or the hosted URL otherwise.
- **Quick links:** Start timer · Capture an idea · Open today in TaskFlow, DSA and chart-journal.

### 3.2 Week (targets + review)
- This week vs last week: productive total and per tag (with arrows), work hours, average sleep, counters, tasks done and missed, deadlines missed.
- **Targets:** a progress bar per weekly target, plus each day target's hit rate (e.g. "DSA: 4/5 days").
- A stacked bar per day of productive time by tag. Days off are greyed.
- **Weekly review** (a banner on Home on review day): the numbers are shown read-only, then rating, went well, didn't, and next week's focus. Save stores the review plus the frozen `snapshot`.
- Past reviews: a list. Open one to see its snapshot and notes.

### 3.3 Trends
- Ranges: 14 days, 30 days, 90 days, 12 months.
- **Charts:**
  - productive time by parent tag and sub-tag (stacked)
  - a consistency heatmap (90 days and the year, days off marked)
  - balance: wellness, break, sleep, nap/reset
  - work and commute hours per week
  - cigarettes and weed per day, with a 7-day average
  - tasks done vs missed per week
  - money: in vs out vs net per month for 12 months, and essential vs discretionary (from `money_dashboard_monthly`)
  - later: smoking cost per cigarette (Money smoking spend ÷ TaskFlow counter taps)
- **Stats:** averages (7 and 30 days, days off excluded), best day, best week, and longest streak.
- Every chart says which rule it uses where relevant, e.g. "DSA counted once (max of TaskFlow and DSA app)".

### 3.4 App pages
One page per app: all its `_now` extras, plus a 30-day table of its `_daily` view showing **every** column generically, so a new column appears without code changes. Also its contract version, last update, and a link that opens the app.

### 3.5 System
- **Per app:**
  - port and running status (launcher)
  - Start / Stop / Open / Logs (the last 200 lines)
  - "started by launcher" vs "already running" (e.g. a dev server from a Claude session; Stop is disabled for those)
  - data freshness: last `updated_at`, flagged after 2 days
  - contract health from `os_contract_health`
- **Database:**
  - the last activity of any kind, with a warning after 5 quiet days, because free Supabase projects pause after about a week
  - the last backup date, with a warning after 8 days
- Start all · Stop all (only processes the launcher started).

### 3.6 Settings
- daily goal, week start, review day
- **target editor** (add, edit, reorder, pause; the tag picker reads tag paths from `os_tag_daily` history plus TaskFlow's tag list in its `_area_daily`)
- hosted app URLs
- theme
- sign out

## 4. Launcher (`launcher/`, 127.0.0.1:5171)
- `apps.json` lists each app's key, name, folder, start command, port, local URL and hosted URL. chart-journal starts with `sh start.sh` (5173), DSA with `npm run dev` (5174), TaskFlow with `npm run dev` (5175).
- **Endpoints:**
  - `GET /status`: per app, whether the port is up and whether the launcher started it
  - `POST /start/:key` and `POST /stop/:key`
  - `POST /start-all` and `POST /stop-all`
  - `GET /logs/:key`
  - `GET /backup`
- **Safety:**
  - Bind to 127.0.0.1 only, and reject any `Host` that isn't `127.0.0.1:5171` or `localhost:5171` (DNS rebinding).
  - CORS alone doesn't stop another website from sending a simple POST (the request still runs), so the server itself rejects any request whose `Origin` isn't exactly `http://localhost:5170`, and requires `X-PersonalOS: 1` on every POST so browsers must preflight. Home calls the launcher at `http://127.0.0.1:5171` and, on any other page origin, shows "Open PersonalOS at http://localhost:5170 to use the launcher".
  - Only run commands from `apps.json`.
  - Spawn each app detached in its own process group; Stop signals the whole group (SIGTERM, then SIGKILL after 5 s) and waits until the port is free. Only groups the launcher spawned are ever signalled. Apps started elsewhere show "already running" with Stop disabled.
  - Port checks try both `127.0.0.1` and `::1`.
  - Each app's log file is truncated every time the launcher starts it and capped at about 1 MB while it runs.
  - Never restart apps in a loop.
- `../start-os.sh` starts the launcher and Home (plus every app with `--all`, skipping and naming any whose port is already up) and opens the browser. `launcher/com.personalos.start.plist` runs it at login.

## 5. Backups
- `launcher/backup.sh` runs `pg_dump` with `SUPABASE_DB_URL` from the root `.env.local`.
- It writes `../backups/YYYY-MM-DD.sql.gz` (gitignored) and keeps 8.
- It runs weekly through launchd, and System shows the date.
- `docs/RESTORE.md` lists the exact restore steps, tested once on local Postgres.

## 6. Hosting (after it works locally)
- A Vercel project from the PersonalOS repo, with root directory `dashboard/`, on `os.<my-domain>`.
- Env: the Supabase URL and anon key. `VITE_LAUNCHER_URL` stays unset.
- Add the URL in Supabase → Authentication → URL Configuration.
- PWA install (home-screen icon), same as TaskFlow.

## 7. Later (not v1)
- **AI weekly summary:** a Supabase Edge Function that sends the week's snapshot to Claude and stores a short written summary plus 2–3 suggestions in `os_reviews`. It uses the API key secret, and the key never reaches the browser.
- **Nudges:** web push in the evening, e.g. "1h 20m left to your goal" or "review due".
- Year in review, a monthly report, and a command palette (⌘K) of deep links.
- The per-app access allowlist (`os_can_use`) if anyone else ever uses my project.

## 8. Non-goals
- No data entry about activity.
- No writes to other apps.
- No reading app tables.
- No copies of app logic.
- No real-time stopwatch. TaskFlow shows the running timer. Home shows "⏱ DSA 25m" from TaskFlow's `_now`.
