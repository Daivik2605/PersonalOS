# 08 — Put the other apps online (one Claude Code session per app)

TaskFlow is already live (see `taskflow/docs/DEPLOY.md` — copy its pattern). Run each block below in its **own** Claude Code session (subscription), in the folder named. Claude Code prepares the code and a `docs/DEPLOY.md`; **you** do the Vercel, Hostinger and Supabase clicks. Never touch the portfolio site or the `daivik.dev` / `www` DNS records.

Address plan (all private: noindex, sign-up off, anon key only):

| App | Vercel project | Root directory | Address | When |
|---|---|---|---|---|
| TaskFlow | `taskflow` | (repo root) | `taskflow.jarvisjr.daivik.dev` | live |
| Trading journal | `jarvisjr-trading` | (repo root) | `trading.jarvisjr.daivik.dev` | now |
| PersonalOS Home (JarvisJr) | `jarvisjr` | `dashboard` (PersonalOS repo) | `jarvisjr.daivik.dev` | now (phases 1–3 built; more cards light up as later phases land) |
| InteractiveDSA | `jarvisjr-dsa` | (repo root) | `dsa.jarvisjr.daivik.dev` | **only after its Supabase sync (Phase 3.5) is done** — before that, progress lives only in one browser |
| Money | — | — | never hosted | never |

Shared rules for every app (put them in the prompt context):
- Vercel env vars: exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or the app's own names), type **Config**, Production + Preview. Never the service_role / secret key, never the DB password.
- Add: SPA rewrites if it has client routes, noindex (meta + `robots.txt` Disallow: / + `X-Robots-Tag` header), basic security headers like `taskflow/vercel.json`, **no CSP** unless it allows the Supabase URL over both https and wss and is tested.
- No sign-up option in the UI. Plan first, wait for approval, never run git, never kill processes by name. Tests/typecheck/build must pass. Update the app's BUILD_PLAN/BUILD_STATUS, `../CLAUDE.md` registry and `../docs/DECISIONS.md`.

---

## A. Trading journal — run in `PersonalOS/chart-journal/`

> Read CLAUDE.md, ../CLAUDE.md, docs/ (all) and ../docs/prompts/08-deploy-apps.md (section A and shared rules). Look at ../taskflow/vercel.json and ../taskflow/docs/DEPLOY.md as the pattern. Plan first and wait for my approval.
> Make this app deployable on Vercel at `trading.jarvisjr.daivik.dev`. It is a static app whose keys live in a gitignored `config.js`, so add a tiny dependency-free build step (e.g. `scripts/build.mjs`) that copies only the files the app needs into `dist/` and writes `dist/config.js` from the env vars `SUPABASE_URL` and `SUPABASE_ANON_KEY` (fail the build with a clear message if either is missing). `dist/` must not contain tests, docs, schema.sql, seed.js, config.example.js, serve.py or start scripts. Local use (`start.sh` / `serve.py` with the hand-made `config.js`) must keep working unchanged. Add `vercel.json` (buildCommand, outputDirectory `dist`, noindex + security headers, no CSP), `robots.txt`, a noindex meta tag, make sure there is no sign-up path, and add tests for the build script (missing env → fails; output has config.js with the values and none of the excluded files). Write `docs/DEPLOY.md` with my steps: new Vercel project from GitHub repo Daivik2605/tradingJournal, the two env vars (Config, Production + Preview), domain `trading.jarvisjr.daivik.dev`, Hostinger CNAME (Name `trading.jarvisjr`, target from Vercel), Deployment Protection Standard, check list.

## B. PersonalOS Home (JarvisJr) — run in `PersonalOS/` (root)

> Read CLAUDE.md, dashboard/CLAUDE.md, dashboard/docs/SPEC.md, dashboard/docs/BUILD_PLAN.md and docs/prompts/08-deploy-apps.md (section B and shared rules). Look at taskflow/vercel.json and taskflow/docs/DEPLOY.md as the pattern. Plan first and wait for my approval.
> Make `dashboard/` deployable on Vercel at `jarvisjr.daivik.dev` from the PersonalOS GitHub repo (Daivik2605/PersonalOS) with **Root Directory `dashboard`**. Hosted build: `VITE_LAUNCHER_URL` is NOT set, so every launcher feature (start/stop, logs, ports, backups) must be hidden — add a test proving the hosted build shows none of it and makes no request to 127.0.0.1. Sample-data mode must stay dev-only (never in a production build — test it). App links on Home/System point to the hosted addresses when hosted (taskflow/trading now, dsa later) and to localhost ports when local; keep these in `src/lib/apps.ts`. Add `dashboard/vercel.json` (SPA rewrites, noindex + security headers, no CSP), `robots.txt`, noindex meta, PWA only if already planned in SPEC (otherwise skip). Write `dashboard/docs/DEPLOY.md`: Vercel project `jarvisjr`, Root Directory `dashboard`, env vars, domain `jarvisjr.daivik.dev`, Hostinger CNAME (Name `jarvisjr`, target from Vercel), add the URL to Supabase Redirect URLs, Deployment Protection Standard, check list. Do not change `money/` or any other app.

## C. InteractiveDSA — run in `PersonalOS/InteractiveDSA/` — **wait**

Only after its BUILD_PLAN Phase 3.5 (Supabase sync) is done. Then use the same pattern: `vercel.json`, noindex, env vars, `docs/DEPLOY.md`, domain `dsa.jarvisjr.daivik.dev` (Hostinger CNAME Name `dsa.jarvisjr`), and update JarvisJr's app links.
