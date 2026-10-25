# Prompt 01 — Move chart-journal onto the shared PersonalOS database
Run Claude Code **inside `PersonalOS/chart-journal/`** and say: *"Read ../docs/prompts/01-chart-journal.md and follow it."*

---

Read `../CLAUDE.md`, `../docs/ARCHITECTURE.md`, `../docs/CONTRACT.md`, then this app's `README.md`, `schema.sql`, `app.js`, `seed.js`, `config.js` and `start.sh`.

**Do not write code yet.** Reply with a plan (every file you'll change or add, the full list of renamed tables and columns, the two views and how each column is computed, and any risks). Wait for my approval, then build it and stop.

## Context
chart-journal is one app in PersonalOS. All apps share **one Supabase project** and keep apart with table prefixes; this app's prefix is **`trading_`** and its port is **5173**. Its Supabase project has **not been set up yet** (config.js still has placeholders), so there is no data to migrate. Rename freely, but confirm that assumption with me in your plan.

## Changes
1. **Prefix everything.** In SQL and in every `sb.from(...)` call, rename the tables:
   - `assets` → `trading_assets`
   - `observations` → `trading_observations`
   - `concepts` → `trading_concepts`
   - `journal_entries` → `trading_journal_entries`
   - `paper_trades` → `trading_paper_trades`
   - `user_settings` → `trading_settings`

   Rename the storage bucket `screenshots` → `trading-screenshots`, and give its storage policies unique names that start with `trading:` so they can't collide with other apps' policies. Also rename indexes. Keep the same columns, checks, RLS pattern and behaviour.
2. **Move the SQL** to `supabase/trading_schema.sql`, still idempotent and safe to re-run. Remove the old `schema.sql`, or leave a one-line pointer to the new file. Update the "Tables are missing" error text and the setup screen to name the new file.
3. **Publish the dashboard views** exactly per `../docs/CONTRACT.md`, `with (security_invoker = true)` and granted to `authenticated`. Use today = `(now() at time zone 'America/Toronto')::date`.
   - `trading_dashboard_daily` (one row per user per `observed_on`):
     - `app` = `'trading'`
     - `active_minutes` = sum(`seconds_spent`)/60
     - `items_done` = distinct assets observed that day
     - `items_planned` = count of currently active assets (say in the doc that this is today's count, not historical)
     - `streak_current` = consecutive observation days ending that day
     - `headline` like `4 charts · 1 journal · 1 trade`
     - Extras: `journal_entries`, `trades_opened`, `trades_closed`.
   - `trading_dashboard_now`:
     - `status_line` like `4/6 charts today · 12-day streak`
     - `needs_attention` = guesses ready to grade (prediction set, no outcome, 7+ days old), `attention_label` = `'guesses to grade'`
     - `last_activity_at` = newest `created_at` across the tables
     - Extras: `concepts_learned`, `concepts_total`, `guess_accuracy_pct` (right / graded), `open_trades`, `paper_pnl_closed`, `paper_balance`, `challenge_day` (the app's 30-day challenge counter)
     - Match the app's existing streak and accuracy logic in `app.js`. If SQL can't match it exactly, say so in the plan.
4. **Secrets:** this folder will become its own git repo. Make `config.js` gitignored, add `config.example.js` with placeholders, add a `.gitignore` (`config.js`, `.DS_Store`), and have the app show the setup screen if `config.js` is missing.
5. **Docs:**
   - Add this app's `CLAUDE.md`: what the app is, the stack (static HTML/JS + supabase-js from CDN), the `trading_` prefix rule, never touch other apps' objects, never run git, port 5173.
   - Add `docs/DATA_CONTRACT.md` listing both views' columns.
   - Update `README.md` setup: one shared PersonalOS Supabase project, run `supabase/trading_schema.sql`, copy `config.example.js` → `config.js`, use the same login as the other apps.
6. **Port:** keep 5173 in `start.sh` and `start.bat`. If 5173 is taken, fail with a clear message instead of picking another port.

## Done when
- every Supabase reference in `app.js` uses the new names (grep shows no old unprefixed table or bucket names)
- the SQL runs twice in a row without errors
- I can sign up, see seeded assets and concepts, save an observation with a screenshot, and query both views in the SQL editor
- `../supabase/checks.sql` shows nothing wrong for `trading_` objects

Then update the app registry status in `../CLAUDE.md`, and add a line to `../docs/DECISIONS.md` for any choice you made. Stop.
