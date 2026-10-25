# PersonalOS Home

The dashboard and launcher for PersonalOS. Rules: `CLAUDE.md`. What to build: `docs/SPEC.md`. Plan and status: `docs/BUILD_PLAN.md`.

## Run it
From the PersonalOS root:
```
sh start-os.sh          # launcher (127.0.0.1:5171) + dashboard (http://localhost:5170), opens the browser
sh start-os.sh --all    # also chart-journal, InteractiveDSA and TaskFlow (skips any already running, and says which)
```
Ctrl+C stops what the script started. First time only: `cd dashboard && npm install`, then copy `.env.example` to `.env.local` and fill in the Supabase URL and anon key (anon key only).

Always open **http://localhost:5170** (not `127.0.0.1:5170`): the launcher only answers that origin.

## Launcher
`launcher/` is a dependency-free Node server on 127.0.0.1:5171. It only runs the commands in `launcher/apps.json`, starts each app as its own process group, and stops the whole group. It never stops an app it didn't start. Logs are in `launcher/logs/` (gitignored, truncated each start).

Set `VITE_LAUNCHER_URL=http://127.0.0.1:5171` (see `.env.example`). Leave it unset when hosted: Start/Stop and logs are then hidden.

## Data and sample mode
Home's SQL is `../supabase/os_core.sql` (idempotent: run it in the Supabase SQL Editor, and **re-run it whenever an app publishes or changes its `*_dashboard_*` views**; new apps are found by view name). It is proven by `sh ../supabase/tests/run-local.sh`, which starts a throwaway local Postgres on its own port and deletes it afterwards.

In dev, open `http://localhost:5170/?sample=1` (or tick "Sample data" in Settings) to build and review screens from made-up fixtures in `src/fixtures/`; a violet banner stays on while it is on. `?sample=0` turns it off. It is impossible in a production build.

## Commands
`npm test` (UI and launcher tests, including real processes and sockets) · `npm run typecheck` · `npm run build` · `npm run dev` (UI only) · `npm run launcher` (launcher only).
