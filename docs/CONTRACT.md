# Dashboard contract — what every app publishes

The dashboard never reads an app's own tables. Each app publishes **two views** with a fixed set of standard columns, and may add its own columns after them. This lets the dashboard combine all apps with one query, and lets each app change its tables freely.

Rules for both views:
- Created `with (security_invoker = true)`, `grant select ... to authenticated`.
- Named exactly `<prefix>dashboard_daily` and `<prefix>dashboard_now` (e.g. `dsa_dashboard_daily`).
- Standard columns come first, in this order, with these names and types.
- **Treat them as an API:** you may add columns, but never rename, remove or change the meaning of one without bumping `contract_version` and noting it in the app's `docs/DATA_CONTRACT.md` and in `docs/DECISIONS.md`.

## 1. `<prefix>dashboard_daily` — one row per user per day with activity

| Column | Type | Meaning |
|---|---|---|
| `user_id` | uuid | owner |
| `day` | date | local date (America/Toronto) |
| `app` | text | constant: the app key (`dsa`, `trading`, `timer`, …) |
| `active_minutes` | int | real focused minutes that day (0 if the app can't measure it) |
| `items_done` | int | units of work finished (problems, charts studied, tasks…) |
| `items_planned` | int, nullable | units planned for that day; null if the app has no plan |
| `streak_current` | int, nullable | the app's own streak as of that day; null if not meaningful |
| `headline` | text | one short human line, e.g. `3 problems · 1 hint · quiz 24/30` |
| `updated_at` | timestamptz | when the row last changed |

Unique on `(user_id, day)`. Days with no activity may be omitted; the dashboard treats a missing day as zero. A row may exist for a day with activity but `items_done = 0` (e.g. only a journal entry). `streak_current` is `0` when the app tracks streaks but the streak is broken that day; use `null` only if the app has no streak concept at all. All integer columns are `int` (cast `count()`, which returns bigint), so the dashboard's `union all` lines up.

## 2. `<prefix>dashboard_now` — one row per user, the app's current state

| Column | Type | Meaning |
|---|---|---|
| `user_id` | uuid | owner |
| `app` | text | app key |
| `contract_version` | int | starts at 1 |
| `status_line` | text | e.g. `Week 3 · Day 2 · 2 items left today` |
| `needs_attention` | int | count of things waiting (catch-up items, guesses to grade, follow-ups due…) |
| `attention_label` | text, nullable | what that count means, e.g. `catch-up items` |
| `last_activity_at` | timestamptz, nullable | last time anything was recorded |
| `updated_at` | timestamptz | |

App-specific columns go after these (e.g. DSA `week`, `solved_alone_total`; trading `guess_accuracy_pct`, `paper_pnl`).

## How the dashboard combines them (owned by the dashboard, `supabase/os_core.sql`)
- `os_daily_activity`: `union all` of the **standard columns only** of every registered app's `*_dashboard_daily`.
- `os_apps_now`: `union all` of the standard columns of every `*_dashboard_now`.
- When an app is added, its views are added to these two unions in the same change.

## Computing the views
- If the app's data already lives in Supabase (chart-journal), the views are plain SQL over its tables.
- If the app's logic lives in app code (DSA's computed plan dates and statuses), the app writes a `<prefix>daily_summary` table from its own code, and the view selects from it. The dashboard must never re-implement an app's rules.

## Shared calls (the only cross-app writes)
Apps never write another app's tables. When an app must change something another app owns, the owner publishes a **function** and documents it here; other apps may call it, and nothing else.

| Function | Owner | Who calls it | When |
|---|---|---|---|
| `taskflow_end_reset(p_app text, p_detail text, p_at timestamptz default now())` → json | TaskFlow | every app with "start" moments (DSA, chart-journal, future apps) | the moment the user starts a piece of work |

Rules for callers:
- **Never block or break the app.** Call fire-and-forget with a short timeout; if the function doesn't exist (TaskFlow not set up), errors, or the app is offline, carry on normally.
- **Offline apps** (DSA) queue the call with the real start time in `p_at` and send it when back online; the popup then appears on sync.
- If the result has `ended: true`, show the popup: *"Reset ended at {time} — nap {n}, reset {r}. Recorded."* with a link that opens TaskFlow (to undo or edit).
- `p_app` = the app key from the registry; `p_detail` = a short human description of what was started.
