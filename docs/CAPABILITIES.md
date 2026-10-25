# PersonalOS — capabilities

What PersonalOS does, stated as the questions it answers. Every feature in every app should serve one of these; if it doesn't, it's out of scope. Where things live: `ROADMAP.md`. How it's built: `ARCHITECTURE.md`. Ports and status: the registry in root `CLAUDE.md`.

## The eight capabilities

| # | Capability | It answers | Lives in | Status (2026-10-24) |
|---|---|---|---|---|
| 1 | **Plan & capture** | What do I have to do, and by when? What did I miss (tasks vs real deadlines)? What's in my head that I haven't sorted yet? Which projects are going cold? | TaskFlow: tasks, windows, deadlines, inbox, project briefs | building (phases 2–2.5, 9, 10) |
| 2 | **Track time** | How long did each task take? How many **productive hours** (Study + Hustle) per day, and on average? Where did the rest of my time go? | TaskFlow timer and quick-log presets (one tag per minute), plus each learning app's own minutes, with the max-rule so nothing counts twice | building (phase 4) |
| 3 | **Learn** | Where am I in each track? What's weak? What's behind schedule? Am I getting better? | InteractiveDSA, chart-journal; later the SQL and cert apps (Tableau + Databricks) | building |
| 4 | **Work & pay** | Hours at each job (Tim Hortons, Oland Stations)? Am I paid correctly? Does my record match the store's? | TaskFlow: shifts, pay rules, paystubs, photo reading | planned (phases 6, 7, 12) |
| 5 | **Body & balance** | How did I sleep? How much wellness, break and nap/reset time? How many cigarettes and joints, and is it going down? | TaskFlow: sleep check-in, presets, nap/reset, counters | building (counters in 2.5; the rest in 5 and 8) |
| 6 | **Money** | Money in vs out, net per month, spend by category, subscriptions, rent and insurance, what to cancel | `money/` (statements → rules → categories) | idea |
| 7 | **Career** | Where did I apply, with which resume, what's the status, which follow-ups are due? | TaskFlow "Job search" project (own app only if needed) | after TaskFlow is ready |
| 8 | **See everything** | How is today going against my goal? What's my streak (days off skipped)? What needs attention across all apps? What do the last weeks look like? | Dashboard | planned (after TaskFlow phase 4.5) |

## Shared foundations (every app relies on these)
- **One login** across all apps, with sign-ups off.
- **One database** (one Supabase project), with a prefix per app, row-level security on every table, and `security_invoker` on every view.
- **Contract views:** each app publishes `*_dashboard_daily` and `*_dashboard_now`. They're the only thing the dashboard reads.
- **One shared call:** `taskflow_end_reset`. Starting work in any app ends a running nap/reset.
- **Days off** are set once in TaskFlow and apply everywhere: streaks and goals skip them.
- **Tags:** one two-level tree, and every minute has exactly one tag. Productive means Study + Hustle only.
- **Fixed ports** and a **launcher** that starts apps as separate processes. One app failing never affects another.
- **Backups:** a weekly database dump, plus every app's code in its own GitHub repo.
- **Phone access:** TaskFlow is hosted (phase 3), and the dashboard will be later. chart-journal and DSA stay on the Mac.

## Deliberately not included (for now)
- **Other people using my project.** Anikait can run his own copy of chart-journal against his own Supabase project. A per-app allowlist is designed in `DECISIONS.md` for if he ever needs mine.
- **Live bank connections.** Monthly statements only.
- **Reading the phone's call log or screen time.** iOS doesn't allow it, so those are manual entries.
- **Automations I build myself.** Action tasks are coded flows.
- **Real multi-device DSA.** DSA syncs to the cloud as a backup and for the dashboard, but stays one device.

## How to judge a new idea
1. Which capability does it serve? If none, don't build it.
2. Can TaskFlow do it with a tag, a project or a counter? Then it goes there first.
3. Does it need real logic of its own (a curriculum, parsing, practice)? Then it becomes an app, following the checklist in `ARCHITECTURE.md` §8.
