# PersonalOS — roadmap (everything in my head, and where each piece lives)

Last updated 2026-10-24. This is the "don't forget we have to build this" file. Each item says **where it lives now** and **what gets built later**. Ports and prefixes are in the registry in root `CLAUDE.md`.

## The rule that sorts everything
- **TaskFlow** (`taskflow/`) is the general-purpose layer: tasks, deadlines, a timer for *anything*, calendar + days off, ideas/research/notes, projects. If something doesn't have its own app yet, it lives in TaskFlow under a **tag**.
- **A dedicated app** gets built only when an area needs logic TaskFlow can't do (a curriculum, chart practice, statement parsing). Until then the area's tasks and time are in TaskFlow, so nothing waits on a future app.
- **The dashboard** shows time per tag and per app, from the contract views only.

## Tags (seeded in TaskFlow — revision 2)
Every timed thing has exactly **one tag** from a two-level tree (parent → sub-tag), so each minute is counted once. Tasks have one optional tag. Edit the tree in TaskFlow → Settings → Tags. Details: `taskflow/docs/SPEC.md` §2b.

| Parent (kind) | Sub-tags | Counts as |
|---|---|---|
| Work | Tim Hortons · Oland Stations · Commute | hours at work (paid shift time; commute shown separately, never paid) |
| Hustle | AEO Studio | **productive hours** |
| Study | DSA (`dsa`) · SQL · Trading (`trading`) · Tableau Data Analyst Certification · Databricks Data Analyst Certification | **productive hours**, hours studying |
| Wellness | Kriya · Padmasadna · Home Workout · Gym | balance |
| Break | — (resets go here) | balance |
| Sleep | — (naps and night sleep) | balance |
| Personal | — (life tasks like "Pass G2") | balance |

**No double counting** (resolves the OPEN item in `DECISIONS.md`): for a tag linked to an app, the dashboard uses `max(TaskFlow minutes, app-measured minutes)` per day, not the sum. So timing a DSA session in TaskFlow while InteractiveDSA also logs it counts once.

## The items

### 1. DSA — existing app (InteractiveDSA)
- **Now:** nothing new to build. In TaskFlow, the DSA area holds anything outside the curriculum ("redo graph problems before interview X"); the timer can be used, and the max-rule prevents double counting.
- **Later:** none needed.

### 2. Trading — existing app (chart-journal)
- **Now:** same as DSA. Trading area in TaskFlow for to-dos ("read about order blocks").
- **Later:** none needed.

### 3. SQL — future app `sql/`
- **Now:** TaskFlow area *SQL*: tasks for topics, timer for practice, notes for queries worth remembering.
- **Later — SQL practice app:** problems run against a real Postgres (could even use a sandbox schema in Supabase or in-browser SQLite/PGlite), spaced repetition like DSA, a curriculum. Publishes `sql_dashboard_*`.

### 4 + 5. Tableau and Databricks Data Analyst certifications — one future app `cert/`
- **Now:** in TaskFlow, each cert is a project with an **exam date task**, a checklist of exam-guide domains as sub-tasks, and its own area for timing.
- **Later — one cert-prep app with two tracks** (same shape for both: exam domains → study plan to the exam date → practice question bank → mock exams → weak-topic report). One app because the logic is identical; tracks are data. Publishes `cert_dashboard_*` with a per-track extra column.

### 6. Relaxation — in TaskFlow (no separate app)
How the time gets measured — pick whichever is least effort for each activity:
| Activity | How it's logged |
|---|---|
| Sudarshan Kriya, Padmasadhna | **Quick-log preset**: one tap logs a fixed duration (set once, e.g. SKY = 35 min) |
| Exercise | Timer start/stop, or quick-log; later imported from Apple Health workouts via an iOS Shortcut |
| PS5 | Timer start/stop (start on phone, stop on Mac — it's one shared running timer) |
| Calls/time with Bini, Mom, Dad | Manual "after the fact" entry: person + minutes. iOS doesn't let apps or Shortcuts read the call log, so this one stays manual |
These go under the Wellness, Break or Personal tags, so they show on the dashboard as balance, never as productive hours (productive = Study + Hustle only).

### 7. Sleep — in TaskFlow
- **Now:** morning check-in card: bedtime + wake time (pre-filled from yesterday), optional 1–5 quality. Stored per night, attributed to the wake-up day.
- **Later:** an iOS Shortcut that reads last night's *Sleep* samples from Apple Health and posts them, so the card is pre-filled (works if the iPhone/Watch tracks sleep).

### 8. Smoke counter — in TaskFlow (the separate Smoke app is dropped)
- Two one-tap buttons on TaskFlow's Today screen: 🚬 Cigarette and 🌿 Weed, with Undo and "add at a past time". **Counts only** — no time, no cost.
- Stats in TaskFlow → Insights: today, week, month, all time, per-day/week/month charts, daily averages, days since last, zero days.
- Money spent on them comes from Finance (bank statements), not from here.

### 9. Finance — `money/` (next major app)
- **Full spec and 10-phase build plan:** `money/docs/SPEC.md`, `money/docs/BUILD_PLAN.md`. Local on the Mac only (most sensitive data); the phone sees a summary through PersonalOS Home.
- Answers: in vs out and net per day/week/month/year; spend by category and merchant; essential vs discretionary; every subscription with a keep/cancel decision; paycheques per employer matched to TaskFlow's paystubs; smoking spend (Home can later show cost per cigarette with TaskFlow's counters).
- How: CSV exports (PDF later) parsed in the browser and never stored, account numbers stripped, exact integer cents, duplicate-proof re-imports, rules + a "what was this?" review queue, transfers and card payments excluded, optional Claude suggestions via an Edge Function.
- Split with TaskFlow: TaskFlow owns jobs, shifts, hours and paystubs; Money owns bank deposits and matches them through `taskflow_dashboard_paystubs`.

### 10. AEO Studio — in TaskFlow (a project with extras)
- One TaskFlow **project** with its own area.
- Tasks have an **owner**: me, Anikait, or external, and a **waiting on** note — so "what's out of my hand" and "what Anikait is handling" are filters, not lists to maintain.
- **Agents** = tasks tagged `agent` with status (idea → building → built → live), so "which agents are built, what's left" is one view.
- **Research** = TaskFlow notes of kind *research* attached to the project, searchable.
- **Limit:** Anikait can't log in (single-user RLS). If he needs to edit, that's a later decision (a shared tool like Linear/Notion for AEO, or adding a second user with project sharing — a real change to the DB rules).

### 11. Projects — in TaskFlow
Every project gets a **brief** so future-me can pick it up after 2 months: what it is, why, where it lives (folder / repo / URL), status (idea · active · paused · done · dropped), what's left, **next step when I come back**, and last-touched date. Projects untouched for 30+ days are flagged "going cold" on the TaskFlow home screen.

### 12. Work — Tim Hortons shifts — in TaskFlow
- An **action task** on Today: tap it to punch in (or enter a punch-in time you forgot), start/end a break (or add break minutes after the fact), punch out.
- Pay rules are editable per job: clock-in rounding (15:02 → paid from 15:05), clock-out rounding, paid/unpaid break, required break length, Ontario overtime after 44 h/week.
- **Left on break:** ends my record at the break start. If the manager says it won't be deducted, the shift stays *unverified* until the store's numbers (time card or paystub) are entered, then shows the difference in minutes and dollars.
- **Paystub check** per pay period: my expected paid hours and gross vs the paystub.
- **Later:** photo of the time card or paystub → read by Claude (vision) through a Supabase Edge Function, confirmed before saving.

### 13. Nap + reset — in TaskFlow, ended by any app
- One button: nap clock → `Nap done` → reset keeps running until I start something.
- Ends automatically when I start work anywhere: a timer under a Study, Hustle or Work tag, or a punch-in, in TaskFlow, or a start moment in DSA, chart-journal or any later app (they call `taskflow_end_reset` and show the popup — `docs/prompts/07-reset-hook.md`). Undo/edit afterwards.
- Nap = Sleep tag, reset = Break tag; neither counts as productive hours.

### 14. Job search — in TaskFlow (own app only if needed)
- **Now:** a TaskFlow **project** "Job search". Each application is a task (title = company · role) with labels for status (`applied`, `interview`, `offer`, `rejected`), a note holding the job description and which resume version was sent, the applied date as the task's done date, and a follow-up date as its due date.
- **Later — `jobs/` app (port 5176, prefix `jobs_`)** only if this gets clumsy: a pipeline board, resume versions as files, follow-up reminders, response-rate stats. Publishes `jobs_dashboard_*`.

### Also in TaskFlow (from the same brain-dump)
- **Action tasks** — pinned buttons that run a flow instead of being ticked (shift, quick-log presets, sleep check-in; plus the smoke counter buttons).
- **Ideas / research to do / points to remember** — a quick-capture inbox reachable from phone and Mac. Each note can be attached to an area or project, or turned into a task.
- **Calendar** — month/week view of deadlines, days off and time logged.
- **Holidays / days off for all of PersonalOS** — set in TaskFlow's calendar; the dashboard reads them so streaks and daily goals skip those days.

## Build order (after this file)
Three apps are being built in parallel (keep it to three sessions at once — they share one subscription limit); use them only once they're finished. **Money is the next major app** and takes the first free slot.
1. **TaskFlow** — `taskflow/docs/BUILD_PLAN.md` (spec in `taskflow/docs/SPEC.md`). Phases 1–4, then **4.5 (dashboard views, moved up)**, then 5–13.
   - after phase 5: the reset hook in each existing app — `docs/prompts/07-reset-hook.md`
2. **chart-journal** round 2 — `docs/prompts/05-chart-journal-round2.md`
3. **InteractiveDSA** — v2 curriculum migration (B–D), then Supabase sync (3.5.2–3.5.6)
4. **PersonalOS Home (dashboard + launcher), local on the Mac** — `dashboard/docs/BUILD_PLAN.md` (spec: `dashboard/docs/SPEC.md`). Phase 1 (shell + launcher) any time; phases 2–3 after TaskFlow phase 4.5; works with whichever apps have published views (DSA joins when its sync is done)
5. Hosting: TaskFlow at TaskFlow phase 3; the dashboard after it works locally (both on subdomains of my Vercel domain — `docs/ARCHITECTURE.md` §4)
6. **Money** — phase 0 (your CSV exports) now; phases 1–6 in the first free session slot (likely when chart-journal round 2 finishes); phase 7 after TaskFlow phase 7
7. SQL app → cert-prep app; job tracker only if the TaskFlow project isn't enough

## Later TaskFlow add-ons (not in v1)
- iOS Shortcuts / share-sheet capture ("Add to TaskFlow" from any app) through a Supabase Edge Function with a personal capture token
- Apple Health imports (sleep, workouts) through the same function
- Reminders via web push (works on iOS for home-screen web apps)
- Recurring tasks, offline capture queue
