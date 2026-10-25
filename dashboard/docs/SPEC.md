# PersonalOS Home — spec (final, v2 — 2026-10-25)

The hub of PersonalOS: **one place that shows how my days are going across every app**, plus a launcher that starts the apps on my Mac. Folder `dashboard/`, app key `os`. System rules: `../../CLAUDE.md`. What PersonalOS does: `../../docs/CAPABILITIES.md` (Home is capability 8, "See everything"). Contract it reads: `../../docs/CONTRACT.md`. Sections are numbered so the build plan can point at them.

---

## 0. Goal and boundaries

**Know in 10 seconds whether my days are going where I want them to — across study, work, money, body and habits — and jump straight to the app that fixes it.**

Every app records one part of my life and has its own detailed screens. **Home is the only place they meet.** It answers:
1. **Today:** productive time vs my goal, streak, work, sleep, counters, what needs attention, what's due soon.
2. **This week:** every app's week side by side vs last week, and my TaskFlow goals' progress.
3. **Over time:** consistency, where my time goes, habits and money trends.
4. **The system:** which apps are running, whether each app's data is fresh and matches the contract, whether backups ran.

### 0.1 What Home can do
- Show a combined, honest summary of every app that publishes contract views, including apps that aren't running.
- Compute the one number no single app can: **productive time across apps** (Study + Hustle, the max-rule so nothing counts twice, days off skipped), its streak, and my **daily productive goal**.
- Show TaskFlow's goals (per tag, counter, activity, tasks) with progress, read from TaskFlow.
- Show each app's attention items and deadlines, and **deep-link** into the exact screen that handles them.
- Start, stop and open apps on the Mac (launcher), show their logs, and warn when data is stale, a contract breaks, the database is going quiet, or a backup is old.
- Pick up a new app automatically once its views exist (re-run `os_core.sql`); show any new column an app adds without code changes.
- Work hosted on the phone later (`os.<my-domain>`), minus the launcher.

### 0.2 What Home can't do (by design)
- **No recording or editing in other apps.** No timer, no task edits, no counter taps, no review writing — it links to the app instead. Its only writes are its own settings.
- **No detail beyond the contract views.** It can't list individual DSA problems, trades, transactions or tasks — the app's own screens do that.
- **No data from apps that haven't published views.** Today: chart-journal publishes; TaskFlow from its phase 4.5; DSA after its sync; Money after its phase 6. Until then that app shows "not published yet" (never a fake 0).
- **No launcher when hosted** or when the launcher is off, and it never stops an app it didn't start (e.g. a dev server from a Claude session).
- **Not live to the second.** Views can't push changes, so Home refreshes on focus and every 60 s; TaskFlow shows the live running timer.
- **Not more accurate than the apps.** Known limits are shown on screen: chart-journal's `items_planned` is today's count only; DSA is one device; TaskFlow's per-tag goals count TaskFlow-timed minutes only, while Home's productive total uses the max-rule.
- **No notifications** (TaskFlow does reminders), **no offline mode** beyond the last loaded data, **no other users**.
- **Not a second place for goals or reviews.** Goals, the evening shutdown, the weekly review and the Claude weekly summary live in TaskFlow (its revision 3); Home shows them.

### 0.3 Success measures (after a month of use)
- Opened every day; "how's today going" answered in ≤ 10 s.
- Every number matches the owning app's screen — any difference is a bug.
- Nothing entered here except the daily goal and display settings.

### 0.4 Principles
- **Reads, never writes, to other apps** — deep links instead.
- **Honest numbers:** freshness shown; missing = "no data", never 0; counting rules stated where they apply.
- **Any subset of apps works.** Home is complete and testable before the apps are — it's built against the contract with fixtures, and lights up app by app.
- **Glance first, drill down second.** Home fits one screen; details are one click away.
- **No emojis in the UI** (same rule as TaskFlow; `src/noEmoji.test.ts`). Icons and text labels only.

## 1. Stack and app rules
- Vite + React + TypeScript + Tailwind + React Router + Recharts + Vitest (same as TaskFlow). supabase-js, anon key from `.env.local`, the shared account.
- UI port **5170** strict; launcher **127.0.0.1:5171** (Node, no framework). Built in phase 1.
- Days are America/Toronto dates via `src/lib/time.ts`.
- Pure, tested modules in `src/lib/`: `apps.ts` (app registry, §2.4), `productive.ts`, `goals.ts` (presentation of TaskFlow goals), `week.ts` (week windows, deltas), `health.ts` (freshness and staleness rules), `launcher.ts` (built).
- Mobile-first at 375 px, sidebar from 1024 px, dark mode with override.
- Data refresh: on window focus and every 60 s; a "last updated" time is always visible. If Supabase is unreachable, keep the last loaded data with a banner.
- **Sample-data mode** (dev only, `?sample=1` or a toggle in Settings when `import.meta.env.DEV`): screens render from fixture JSON in `src/fixtures/` shaped exactly like the contract views, with a permanent "Sample data" banner. Used to build and review every screen before the apps publish; never on in a production build.
- `VITE_LAUNCHER_URL` set on the Mac, unset when hosted (launcher features hidden).

## 2. Data

### 2.1 Home's own data — `../../supabase/os_core.sql` (idempotent, tested on local Postgres first)
- **`os_settings`** (one row per user; standard `user_id`, RLS, `"own rows"`, `updated_at`): `daily_goal_minutes` (240), `week_starts_on` (1 = Monday), `timezone` (`America/Toronto`; **display-only** — every day and week boundary in SQL and the UI is `America/Toronto`), `hidden_apps text[]`, `card_order text[]`, `theme`.
- That's all Home stores. (Targets and reviews were dropped from Home on 2026-10-25 — TaskFlow owns them.)

### 2.2 Views Home builds (all `security_invoker`, granted to `authenticated`)
Every view that depends on another app's view is generated by a `do $$ … $$` block that **discovers sources by name** (any public view called `<key>_dashboard_daily` / `<key>_dashboard_now`, key = lowercase letters and digits) and then **validates** each one (`security_invoker`, readable by `authenticated`, standard columns with the contract's names, order and types); only valid sources are included and the rest are skipped and reported. A new app therefore appears after re-running `os_core.sql` with **no edit to the file**; a short known-apps list (trading, dsa, taskflow, money) is used only to show "not published yet". Apps must change their views with `create or replace` (a plain `drop view` is blocked while a union uses it). Re-run `os_core.sql` after any app publishes or changes views.
- **`os_daily_activity` / `os_apps_now`** — `union all` of the standard columns of every valid `*_dashboard_daily` / `*_dashboard_now`.
- **`os_app_kind`** — constants: app key → kind its minutes count as (`trading → study`, `dsa → study`).
- **`os_tag_daily`** (user_id, day, parent_tag, tag, kind, app_key, minutes, source, **tag_path**) — TaskFlow's `_area_daily` (needs its `tag_path` column, else the view is skipped and reported in `os_optional_health`). `tag` is the sub-tag name (`DSA`) or the parent's own name (`Break`), `tag_path` is `Study/DSA` / `Break`. **Max-rule:** per day and app, minutes = max(TaskFlow minutes on the tag carrying that `app_key`, the app's own `active_minutes`); the surplus is added to that tag (`source = 'max'`). `app_key` is unique per user among non-archived tags, so an app links to at most one tag (if an archived tag still carries it, the most recently used one is the link). App minutes with no TaskFlow row to join (that day, or no linked tag at all) are their own row (`source = 'app'`): under the linked tag, else parent `Study`, tag `<App label>`, path `Study/<label>`. Only apps in `os_app_kind` contribute; TaskFlow's own `_daily` row is never added. Without TaskFlow it's app minutes only.
- **`os_productive_daily`** (user_id, day, minutes, is_day_off) — sum of `os_tag_daily` where kind ∈ {study, hustle}; a row exists for every day with minutes or marked as a day off (from `taskflow_dashboard_days_off`).
- **`os_streak`** (user_id, current, longest, last_productive_day) — days with productive minutes > 0; **days off neither break nor extend** (minutes worked on a day off do not extend it); today at 0 does not break it until the day is over, yesterday at 0 does. No row until the first productive day.
- **`os_week`** (user_id, week_start, app, metric, value) — long format: per app per week the sum of `active_minutes`, `items_done`, plus Home's productive minutes and selected TaskFlow/Money extras (TaskFlow: `work_minutes`, `cigarettes`, `weed`, `tasks_missed`, `deadlines_missed` summed; `sleep_minutes`, `mood`, `energy` averaged over the days that have them; only columns the view actually has. Money: `in_cents`, `out_cents`, `essential_out_cents`, `discretionary_out_cents`, `smoking_out_cents` summed, `net_cents` = in − out; plus `os` rows `productive_minutes` and `days_off`). Week start from `os_settings.week_starts_on`. Feeds the Week screen and its this-vs-last deltas.
- **`os_optional_health`** (app, view, exists, columns_ok, access_ok, in_use) — the same report for the optional TaskFlow views the part-2 views use (`_area_daily`, `_days_off`); `in_use` false while valid means "re-run os_core.sql".
- **`os_contract_health`** (app, view, exists, columns_ok, contract_version, last_updated_at, **access_ok**, **in_unions**) — one row per known or discovered app per view, live from the catalog plus each valid `_now` view's `contract_version` and `max(updated_at)`; `access_ok` = `security_invoker` and readable by signed-in users; `in_unions` = the union views already include it (valid but false means "re-run os_core.sql"). The browser-side twin of `checks.sql` queries 6, 7, 10.

### 2.3 What each app provides (contract views only)
| App (data key) | Views Home reads | Gives Home | Available |
|---|---|---|---|
| chart-journal (`trading`) | `trading_dashboard_daily`, `_now` | chart minutes, charts studied, streak, guesses to grade, accuracy, paper P&L | **now** |
| TaskFlow (`taskflow`) | `_daily`, `_now`, `_area_daily`, `_days_off`, `_deadlines`, **`_goals`** | time by tag, work, sleep, nap/reset, counters, tasks done/missed, mood/energy, overdue, inbox, running timer, deadlines, days off, goal progress | TaskFlow phase 4.5 (goals view needs its phase 2.8, mood/energy its phase 4.2) |
| InteractiveDSA (`dsa`) | `dsa_dashboard_daily`, `_now` | study minutes, items done, plan day/week, catch-up + redos, streak | after DSA sync (3.5.4) |
| Money (`money`) | `money_dashboard_daily`, `_now`, `_monthly` | month in/out/net, essentials vs discretionary, subscriptions, to categorise | Money phase 6 |
| Later: SQL, cert | their `_daily`, `_now` | study progress | when built |

### 2.4 App registry — `src/lib/apps.ts` (one place, tested)
For each app: `launcherKey` (as in `launcher/apps.json`, e.g. `chart-journal`; `null` until the app has a launcher entry — Money), **`dataKey`** (as in the contract, e.g. `trading`), name, port, local URL, hosted URL, icon, **`syncs`** (true only for apps that mirror a local store to the cloud: DSA) and **deep links**. The launcher's `apps.json` keeps folders and commands (never bundled into the UI). A test checks every `apps.json` entry has a matching registry entry.
- **TaskFlow deep links** (stable routes it publishes, SPEC §11 there): `/timer?tag=<path>`, `/tasks?view=today`, `/insights`, `/work`, `/capture`, `/review`, `/goals`.
- **chart-journal, DSA, Money:** open the app's home (no stable routes yet; add when they publish some).

## 3. Screens
Phone tabs: **Home · Week · Trends · System**; Settings under the profile menu. Desktop: sidebar with the same items.

### 3.1 Home (today)
- **Header:** productive today vs daily goal (ring) with "Xh left" and an on-pace / behind hint by time of day (linear over a fixed 08:00-22:00 Toronto window; on pace = at least 90% of where the goal would be by now; no hint before 08:00; on a **day off** — from `taskflow_dashboard_days_off` or `os_productive_daily.is_day_off` — the ring says "Day off" with no hint and never "behind") · productive streak (days off skipped) · work hours today · "Last night" = today's `sleep_minutes` (TaskFlow defines it as the night that ended this morning) · counters today (`Cig 3`, `Weed 1`, with the average of the 7 days before today, and amber at 80% / red over TaskFlow's limit; the limit comes from the goal row whose `counter_key` equals the counter's `_daily` column — never matched by name, and no colour when `counter_key` isn't published) · "updated 1 m ago".
- **Goals today:** chips for TaskFlow's daily goals (e.g. "Study/DSA 25 / 60 min"); tap → TaskFlow `/timer?tag=<tag_path>` for time goals, `/goals` for every other goal. Weekly goals show as small bars.
- **Needs attention:** every app's `needs_attention` > 0, biggest first, each linking to the right screen (overdue tasks, catch-up + redos, guesses to grade, transactions to categorise, unchecked shifts, cold projects). "Weekly review due" only when `taskflow_dashboard_now.review_due` is true → TaskFlow `/review` (if the column doesn't exist the item is left out; Home never guesses the day). Overdue tasks → `/tasks?view=today`, unchecked shifts → `/work`; everything else opens the app's home.
- **Coming up:** hard deadlines from `taskflow_dashboard_deadlines` with countdown (amber ≤ 7 days, red ≤ 2).
- **Money (when published):** this month in · out · net, subscriptions / month, to categorise; amounts hidden behind a tap on the phone.
- **Apps:** a tile per app — `status_line`, last activity, running dot, Open / Start (launcher) — and "not published yet" for apps without views.
- **Quick links:** Start timer · Capture · Today in TaskFlow · Open DSA · Open Chart Journal · Open Money.

### 3.2 Week (cross-app, read-only)
- This week vs last week for every app side by side: productive time (and by tag), work and commute hours, average sleep, mood/energy, counters, tasks done/missed, deadlines missed, DSA items, charts studied, money in/out/net. A week with no row is "No data", never 0. Only cigarettes, weed, missed tasks and missed deadlines are lower-is-better (a rise is amber "worse"); every change is also written as text. **Reads only those two weeks** (`day >= last week's start` in each query).
- TaskFlow goals for the week: progress bars and hit / missed per goal.
- Stacked productive bars per day, days off greyed.
- **Do the review in TaskFlow** → `/review` (that's where notes, ratings and the Claude summary live). Home doesn't store reviews.

### 3.3 Trends
- Ranges: 14 d, 30 d, 90 d, 12 months (`?range=`). **Each view is queried only for the range shown** (`day >= start` in the Supabase query, paged only when a range exceeds 1,000 rows): the 30-day range reads one day more than it shows (for the 30-day average) and TaskFlow's daily view 6 days more (trailing 7-day average). Day buckets for 14/30 d, week buckets for 90 d, month buckets for 12 m; every chart has a "Show as table".
- Productive by parent tag and sub-tag (stacked, max-rule note); consistency heatmap (90 days and the year, days off marked); balance (wellness, break, sleep, nap/reset); work and commute per week; counters per day with 7-day average; tasks done vs missed per week; money in/out/net per month and essentials vs discretionary (when published).
- Stats: 7- and 30-day averages (the days before today; days off excluded; days before my first productive day are not zeros; the 30-day average needs a 30-day range or longer), best day, best week (finished weeks inside the range only), longest streak (all time).
- Heatmap levels are relative to the daily goal: nothing / under half / under the goal / goal reached, days off hatched, days before the first row dashed.
- Later: smoking cost per cigarette (Money smoking spend ÷ TaskFlow counter).

### 3.4 App pages
One per app: all its `_now` extras, a 30-day table of its `_daily` view showing **every** column generically, its contract version and freshness, and Open / deep links.

### 3.5 System
- **Apps** (built in phase 1): status, port, started-by-launcher vs already running, Start / Stop / Open / Logs, Start all / Stop all.
- **Data health:** per app — published or not, contract OK (from `os_contract_health`), and "re-run os_core.sql" when a new valid view isn't in the unions yet. **Stale** (a warning) applies only to apps with `syncs: true` (DSA), when the `_now` view's `updated_at` is more than 2 days old: only an app that syncs can have data that is out of date. Every published app also shows **last activity** (`last_activity_at`) as plain information, never a warning — a quiet week is not a fault.
- **Database:** last activity anywhere (warning after 5 quiet days — free Supabase projects pause after about a week); last backup (warning after 8 days).

### 3.6 Settings
Daily productive goal · week start · hidden apps and card order · theme · sample-data toggle (dev only) · sign out. (Per-tag goals: link to TaskFlow `/goals`.)

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
- `launcher/backup.sh` runs `pg_dump` with `SUPABASE_DB_URL` from the **root** `.env.local`, writes `../backups/YYYY-MM-DD.sql.gz` (gitignored), keeps the newest 8, runs weekly through launchd; System shows the date.
- `docs/RESTORE.md`: exact restore steps, tested once on local Postgres.

## 6. Hosting (after it works locally)
- **JarvisJr** (the public name of PersonalOS Home): Vercel project from the PersonalOS repo, root directory `dashboard/`, on **`jarvisjr.daivik.dev`**; each app gets its own subdomain under it (`taskflow.jarvisjr.daivik.dev`, later `trading.`, `dsa.`, `money.`…), and the app tiles link to those URLs when hosted. `<meta name="robots" content="noindex">` + `robots.txt` disallow all; env = Supabase URL + anon key; `VITE_LAUNCHER_URL` unset. Add the URL in Supabase → Authentication → URL Configuration. PWA install like TaskFlow.

## 7. Later (not v1)
- Cross-app monthly report / year in review.
- Smoking cost per cigarette (needs Money phase 6).
- ⌘K command palette of deep links.
- Per-app access allowlist (`os_can_use`) if anyone else ever uses my project.
- (Dropped: Home's own AI weekly summary — TaskFlow's Claude weekly summary covers it. If a cross-app summary is wanted later, it reads `os_week`.)

## 8. Non-goals
No data entry about activity · no writes to other apps · no reading app tables · no copies of app logic · no goals or reviews of its own · no live timer.
