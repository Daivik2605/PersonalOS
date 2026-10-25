# Prompt 02 — InteractiveDSA: Supabase sync + dashboard views
Before running: in the DSA app (still on port 5173), go to **Settings → Export** and save the file into `PersonalOS/backups/`. Commit your DSA work.
Then run Claude Code **inside `PersonalOS/InteractiveDSA/`** and say: *"Read ../docs/prompts/02-dsa-sync.md and follow it."*

---

Read `../CLAUDE.md`, `../docs/ARCHITECTURE.md` and `../docs/CONTRACT.md`. Then read this app's `CLAUDE.md`, `docs/SPEC.md`, `docs/CONTENT_SCHEMA.md`, `docs/BUILD_PLAN.md`, `src/lib/db.ts`, `src/lib/schedule.ts`, `src/lib/actions.ts` and `src/types/content.ts`.

**Do not write code yet.** Reply with a plan:
- files to add or change
- every `dsa_` table with its columns
- the Dexie migration
- the sync design
- how the summary is computed
- tests
- anything that conflicts with the SPEC, or that you think is a mistake

Wait for my approval, then build it **one phase at a time**, stopping after each phase. All existing CLAUDE.md rules still apply: never run git, local `YYYY-MM-DD` days, never delete user progress, bump the Dexie version to migrate, keep `schedule.ts` pure and tested.

## Context
InteractiveDSA is one app in PersonalOS. All apps share **one Supabase project** (chart-journal is already on it with `trading_` tables). This app's prefix is **`dsa_`**, its storage prefix `dsa-`, and its port is **5174**. Today all progress is in Dexie/IndexedDB, which no other app can read and which is lost if browser storage is cleared. The goal is to copy that data to Supabase and publish the dashboard views, **without** making the app depend on the network.

## Requirements
1. **Dexie stays the source of truth.** The UI keeps reading Dexie, and the app works fully offline and while signed out.
2. **Mirror tables.** Create one `dsa_` table per Dexie table: every table in `TABLE_NAMES` in `db.ts`, using snake_case names such as `dsa_quiz_answers`. Each table has:
   - the standard `user_id` / RLS / `"own rows"` policy from `../CLAUDE.md`
   - typed columns for keys and fields worth querying (ids, `problem_id`, `plan_day_id`, days as `date`, outcome, minutes)
   - `data jsonb` holding the full Dexie row, so restore is exact
   - `updated_at timestamptz` and `deleted_at timestamptz` (soft delete, so deletions sync)
   - a unique key on `(user_id, <local key>)`

   SQL goes in `supabase/dsa_schema.sql`, idempotent and append-only for future upgrades.
3. **Auto-increment ids.** Tables using `++id` will collide across devices. Propose a fix (for example a per-install `device_id` in the cloud key, or UUIDs for new rows with a migration) and explain the trade-off.
4. **Outbox.** The next Dexie version (v3 today; check `db.ts`) adds an `outbox` table. Every write in `lib/actions.ts`, and in import/reset, records an outbox entry in the **same Dexie transaction**. First grep the whole `src/` for Dexie writes outside `actions.ts` (quiz engine, drill, settings, problem journal…) and list them in the plan. Every write must produce an outbox entry, or the cloud copy silently drifts. `src/lib/sync/` pushes the entries as upserts when signed in and online, retries with backoff, and deletes an entry only after success. Sync runs:
   - on app start
   - on sign-in
   - when the browser comes back online
   - debounced after changes
5. **Backfill.** On the first successful sign-in, push every existing local row.
6. **Restore.** If Dexie is empty and the cloud has data, offer **Restore from cloud**. Conflicts are last-write-wins by `updated_at`.
7. **Import, export and reset still work.** Import queues a full re-push. Reset asks whether to also soft-delete the cloud copy.
8. **Auth and UI.**
   - Settings gets an email/password sign-in using the same account as chart-journal, plus sign-out and a sync status (synced / N pending / offline / error with message) with a **Sync now** button.
   - The layout gets a small sync dot.
   - Config comes from `.env.local` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), and you should add a `.env.example`.
   - Add `@supabase/supabase-js`. Use the anon key only.
9. **Dashboard views,** exactly per `../docs/CONTRACT.md`:
   - The app writes a `dsa_daily_summary` table (one row per user per scheduled date from the start date through today). Columns: `day`, `week`, `plan_day_index`, `plan_day_id`, `status` (done / done-late / partial / missed / rest), `items_total`, `items_done`, `problems_attempted`, `solved_alone`, `needed_hint`, `needed_solution`, `failed`, `coding_minutes`, `quiz_answered`, `quiz_correct`, `redos_due`, `catchup_queue_size`, `current_streak`, `longest_streak`, `updated_at`.
   - It's built by a **pure, unit-tested function** that reuses `schedule.ts`. Don't duplicate any date or status logic.
   - Recompute and upsert all days on app start and after any progress change, because statuses change later and extensions shift dates. Soft-delete rows for dates that no longer exist.
   - `dsa_dashboard_daily` (view over the summary):
     - `app` = `'dsa'`
     - `active_minutes` = `coding_minutes` (+ quiz time if recorded)
     - `items_done`, `items_planned` = `items_total`
     - `streak_current`
     - `headline` like `3 problems · 1 hint · quiz 24/30`
     - all summary columns as extras
   - `dsa_dashboard_now`:
     - `status_line` like `Week 3 · Day 2 · 2 left today`
     - `needs_attention` = catch-up queue + redos due, `attention_label` = `'catch-up + redos'`
     - extras: `week`, `day_in_week`, `plan_progress_pct`, `solved_alone_total`, `problems_total`, `longest_streak`, `next_redo_on`
   - Both views use `security_invoker = true` and are granted to `authenticated`. Document them in `docs/DATA_CONTRACT.md`.
10. **Port 5174.** Set `server: { port: 5174, strictPort: true }` (and `preview` too). IndexedDB is per origin, so after the port change the app starts empty on 5174. **Do this in the last phase**, and before it, tell me to make sure I've exported or synced, then restore or import on 5174.
11. **Docs.**
    - `SPEC.md`: accounts/sync is currently listed as out of scope, so move it into scope.
    - `BUILD_PLAN.md`: add this as a phase and mark its status.
    - `CLAUDE.md`: stack now includes Supabase sync, the `dsa_` prefix rule, never touch other apps' objects.
    - `README.md`: setup steps.
    - Add a dated line to `../docs/DECISIONS.md` for each design choice.

## Tests
- the outbox entry is written in the same transaction as each action
- push, retry and clear (mock the Supabase client)
- the summary builder covers done, done-late, partial, missed, rest, and week extensions
- the Dexie migration keeps every existing row
- restore round-trips exactly
- `npm test`, `npm run typecheck` and `npm run validate` pass

## Phases (stop after each)
1. `supabase/dsa_schema.sql` + `docs/DATA_CONTRACT.md` + doc updates (no app code)
2. Dexie version bump + outbox + Supabase client + sign-in UI
3. Push sync + backfill + status UI
4. Summary builder + upsert + views
5. Restore from cloud + import/reset handling
6. Port change to 5174 (with the export/restore reminder first)
