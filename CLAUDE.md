# PersonalOS — system-wide rules (read by Claude Code in every app folder)

PersonalOS is one person's set of **separate local apps** that share **one Supabase project**, plus a **dashboard** that reads a summary from each app. Each app folder below has its own CLAUDE.md with app-specific rules; this file adds the rules every app must follow.

Read `docs/ARCHITECTURE.md` (design), `docs/CONTRACT.md` (what each app must publish) and `docs/ROADMAP.md` (what is planned and where each area lives) before changing anything that touches the database, ports or another app.

## App registry (single source of truth — other docs point here; update it when an app, port or status changes)
| App | Folder | Port | Table prefix | Storage bucket prefix | Status |
|---|---|---|---|---|---|
| PersonalOS Home (dashboard + launcher) | `dashboard/` (in the root repo) | 5170 (UI), 5171 (launcher API) | `os_` | `os-` | phases 1–3 built (shell, launcher, System; data foundation: `os_core.sql` parts 1–2 — unions, health, productive time with the max-rule, streak, week; registry, sample mode, Settings, data health — re-run `supabase/os_core.sql`); final spec v2 — phases 4–7 can all be built now against the contract with fixtures; each app lights up when it publishes views (phase 8) |
| Chart Journal | `chart-journal/` | 5173 | `trading_` | `trading-` | built, on shared DB |
| InteractiveDSA | `InteractiveDSA/` | 5174 | `dsa_` | `dsa-` | built; v2 curriculum migration in progress (Phase A done); Supabase sync paused until it finishes (3.5.1 done) |
| TaskFlow (tasks, timer, calendar + days off, inbox, projects) | `taskflow/` | 5175 (dev; also deployed online for iPhone) | `taskflow_` | `taskflow-` | phases 1–2.8 and 3 (PWA + deploy config; deploy steps in `taskflow/docs/DEPLOY.md`, URL `taskflow.jarvisjr.daivik.dev`) built (scaffold, schema, sign-in, seed, tasks + Today, tag tree, task dates, counters, Insights, overview strip, header counter pills, activity buttons, task tag shortlist, goals + smoking limits + reasons); run the phase 2.5, 2.7 and 2.8 SQL; next: phase 3.5 (`taskflow/docs/BUILD_PLAN.md`) |
| Job tracker | `jobs/` | 5176 | `jobs_` | `jobs-` | in TaskFlow for now (a "Job search" project); own app only if TaskFlow can't do it |
| Money (statements → in/out, categories, subscriptions, paycheques) | `money/` | 5177 (local only, never hosted) | `money_` | `money-` | **next major app** — spec + build plan written (`money/docs/`); phase 0 (your exports) now, phases 1–6 as soon as a session slot frees up |
| SQL practice | `sql/` | 5178 | `sql_` | `sql-` | idea |
| Cert prep (Tableau + Databricks tracks) | `cert/` | 5179 | `cert_` | `cert-` | idea |

## Database rules
1. One Supabase project for everything. Never create a second project.
2. An app only creates, alters, writes or deletes tables, views, functions and buckets with **its own prefix**. It never writes to another app's objects. Any app may *read* another app's published `*_dashboard_*` views (never its tables), listed as a dependency in both apps' `docs/DATA_CONTRACT.md` — e.g. PersonalOS Home reads every app; Money reads TaskFlow's paystubs view. The one exception for writes is calling a function listed under **Shared calls** in `docs/CONTRACT.md` (e.g. `taskflow_end_reset`).
3. Every table has `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, Row Level Security on, and the `"own rows"` policy (`user_id = auth.uid()`) for `authenticated`.
4. Every view is created `with (security_invoker = true)` so RLS still applies, plus `grant select ... to authenticated`.
5. Each app keeps its SQL in **its own repo** at `<app>/supabase/<prefix>schema.sql`. It must be idempotent and safe to re-run, and never drop user data. The only shared SQL is `supabase/os_core.sql` at the root, owned by the dashboard.
6. Days are local calendar dates (`YYYY-MM-DD`, America/Toronto) stored as `date`. Moments are `timestamptz`.
7. Apps contain only the anon/publishable key, in `.env.local` (or a gitignored `config.js` for static apps). Never the service_role key, never the DB password. Exception: a Supabase **Edge Function** may use the service-role key Supabase injects server-side, only when it must act without a user session (e.g. TaskFlow's token-authenticated `taskflow-api` and scheduled `taskflow-notify`), and must scope every query to one verified user.

## Every app must
- Run on its fixed port from the registry (Vite: `server: { port, strictPort: true }`).
- Work on its own; the dashboard and the other apps being down must not break it.
- Publish the two dashboard views defined in `docs/CONTRACT.md`, and document them in `<app>/docs/DATA_CONTRACT.md`.
- Use the same Supabase login (one email/password account across all apps).

## Working rules for Claude Code
- Never run git commands. Each app is its own git repo, and the PersonalOS root is a separate small repo; the user does all version control.
- Don't edit files in another app's folder from inside an app session.
- When you change a table, view, port or prefix, update the registry above and the app's `docs/DATA_CONTRACT.md` in the same session, then add a line to `docs/DECISIONS.md` if a design choice was made.
- At the end of each session, update the app's build plan / status so the next session can pick up without this conversation.
