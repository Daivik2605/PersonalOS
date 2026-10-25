# Prompt 07 — Reset hook (run once in each app)
Only after TaskFlow phase 5 (`taskflow/docs/BUILD_PLAN.md`) is done and `taskflow_end_reset` exists. Run Claude Code **inside the app's folder** (`InteractiveDSA/`, `chart-journal/`, and every later app) and say: *"Read ../docs/prompts/07-reset-hook.md and follow it."*

---

Read `../CLAUDE.md`, `../docs/CONTRACT.md` (section **Shared calls**) and this app's own `CLAUDE.md` and docs. Don't edit anything outside this app's folder except `../docs/DECISIONS.md`.

**Do not write code yet.** Reply with the list of "start" moments you found and where you'd hook them, and wait for approval.

## Goal
When I start a piece of work in this app while a TaskFlow nap/reset is running, the reset ends at that moment and this app shows a popup saying so.

## What to build
1. **Find the start moments** — the user action that means "I'm starting work now", not passive browsing. Examples: DSA → starting a problem/attempt, starting a quiz, starting a study session; chart-journal → starting an observation/chart timer, opening a practice trade. Opening the app or settings is **not** a start.
2. A tiny helper `endTaskflowReset(detail)` that calls `supabase.rpc('taskflow_end_reset', { p_app: '<app key>', p_detail: detail, p_at: <start time> })`:
   - fire-and-forget, timeout ~3 s, never throws into the UI, never delays starting the work;
   - only when signed in; at most once per start moment;
   - **offline apps (DSA):** if offline, store `{detail, at}` in a small local queue and send it on reconnect/sync with the original time.
3. **Popup** when the result is `ended: true`: *"Reset ended at {time} — nap {n} min, reset {r} min. Recorded."* with an "Open TaskFlow" link (deployed URL from an env var / config, optional). Use the app's existing toast/modal style. Dismiss on tap.
4. Nothing else changes: if TaskFlow isn't set up, the function is missing, or the call fails, the app behaves exactly as before.

## Docs
- This app's `CLAUDE.md`: one line that start moments must call `endTaskflowReset`, so future features keep doing it.
- This app's `docs/DATA_CONTRACT.md`: note that it calls `taskflow_end_reset` (a Shared call) and from where.
- One line in `../docs/DECISIONS.md`.

## Done when
- With a reset running in TaskFlow, starting work here shows the popup and TaskFlow shows the reset ended at that time.
- With no reset running, nothing visible happens.
- With TaskFlow's function missing (or network off), starting work behaves exactly as before.
