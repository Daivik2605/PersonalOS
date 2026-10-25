# Prompt 05 — Chart Journal round 2 (Anikait's lessons, settings, better practice trades)
Run **one phase per Claude Code session**, inside `PersonalOS/chart-journal/`:
> *"Read ../docs/prompts/05-chart-journal-round2.md and do **Phase N** only."*

Phases, in order: **1 Layout** → **2 Watchlist & charts** → **3 Learn** → **4 Settings** → **5 Practice trades**. Each one builds on the one before, so don't skip ahead. `docs/BUILD_STATUS.md` records which phases are done.

---

Read `../CLAUDE.md`, `../docs/ARCHITECTURE.md`, `../docs/CONTRACT.md`, this app's `CLAUDE.md`, `docs/DATA_CONTRACT.md`, `docs/BUILD_STATUS.md`, `supabase/trading_schema.sql`, `app.js`, `seed.js`, `styles.css`, `index.html`. Also read the sections of this file for the phase you're asked to do and the phases already marked done.

**Do not write code yet.** Reply with a plan **for this phase only**: every file you'll change, every schema change (as idempotent SQL), anything you'd build differently from this spec, and anything you'd move to a later phase. Wait for my approval, then build that phase, update `docs/BUILD_STATUS.md` ("Round 2: Phase N done" plus what to test), and **stop**.

## Context
- The live Supabase project (`personal-os`) already has the `trading_` tables, and **I may already have an account with real data**. So:
  - Every schema change must be additive and safe to re-run (`add column if not exists`, drop/re-add check constraints by name, never drop data).
  - The seed only runs on an empty account. New default assets and concepts must be **added to existing accounts too** ("insert missing by symbol/title" on sign-in), without duplicating or overwriting anything I've edited.
- Keep the dashboard views working. If you change what a view column means, update `docs/DATA_CONTRACT.md` and `../docs/DECISIONS.md`.
- No build step: static HTML/JS, libraries only from a pinned CDN URL.

---

## Phase 1 — Layout and quick fixes

1. **Remove the "What do you see? Tick all that apply" pattern chips** from the observation form. Keep the `patterns` column; old data still shows on old cards.
2. **Tabs, in this order:** `Progress · Watchlist · Today · Learn · Practice trades`, plus a **⚙ Settings** button at the far right.
   - Rename "Concepts" to **Learn**.
   - **Today** stays the tab that opens by default.
3. **Progress becomes one page with three sections:** Overview (current stats and heatmap), **Journal** (moved from its own tab), and **History** (moved from its own tab; the grading still works there).
   - Use in-page sub-tabs or anchors. Keep the "ready to grade" badge on the Progress tab.
4. **Group order everywhere** (Today checklist, Watchlist table, heatmap, practice-trade dropdown): **US market → Resources → Crypto → India → Other**.
5. **Small view fixes:**
   - `trading_dashboard_daily.streak_current` currently shows 0 on days with only a journal entry or trade. It should show the streak as of that day, carrying the last observation streak forward.
   - The headline should say `1 opened` instead of `1 trade` next to `1 closed`.
   - Note both in DATA_CONTRACT.md and DECISIONS.md.

## Phase 2 — Watchlist, Coinglass, timeframes

### New assets
Add these to `seed.js` and to existing accounts. Symbols were checked on 24 Oct 2026; verify each loads in TradingView and Yahoo before shipping.

| Symbol | Name | Group | TradingView | Yahoo | Active | Note |
|---|---|---|---|---|---|---|
| TSLA | Tesla | us | `NASDAQ:TSLA` | `TSLA` | yes | |
| SPCX | SpaceX | us | `NASDAQ:SPCX` | `SPCX` | yes | Listed on Nasdaq since 12 Jun 2026 |
| DJI | Dow Jones Industrial Average | us | `TVC:DJI` | `^DJI` | yes | Index; can't be traded directly (the ETF is `DIA`) |
| HYPE | Hyperliquid | crypto | `PYTH:HYPEUSD` (or a `…:HYPEUSDT` exchange pair) | check (CoinGecko id `hyperliquid`) | yes | |
| BTC.D | Bitcoin dominance | crypto | `CRYPTOCAP:BTC.D` | none (hide the Yahoo button) | yes | BTC's share of total crypto market cap, not a price |
| ANTHROPIC | Anthropic (pre-IPO) | us | none yet | none yet | **no** | Not public. IPO expected around late Nov 2026. Fill in symbols when it lists. "Claude" is Anthropic's product, so this one row covers both |
| OPENAI | OpenAI (pre-IPO) | us | none yet | none yet | **no** | Not public. IPO not expected before 2027 |

- Pre-IPO rows show a "Not listed yet" badge and no chart buttons until symbols are filled in.
- Allow an empty `yahoo_symbol` / `tv_symbol` to hide that button.
- With these, 20 assets are active, which is the top of Anikait's 10–20 range. The Watchlist pill should treat 10–20 as "good".

### Coinglass
- Add a **Coinglass ↗** button to "Open the chart in", shown for **crypto** assets only.
- Default link: `https://www.coinglass.com/pro/futures/LiquidationMap`. Also add a **Heatmap ↗** link: `https://www.coinglass.com/pro/futures/LiquidationHeatMap?coin=<BASE>`, where BASE is BTC, ETH, SOL, HYPE…
- Add an optional `coinglass_url` per asset (Watchlist → Edit) to override the default.
- Add `coinglass` to the observation `source` values. The check constraint needs dropping and re-adding by name.

### What Anikait asked me to record on each crypto chart
- Add fields on the observation form, shown for crypto (optional for others):
  - **Liquidation cluster above** (price)
  - **Liquidation cluster below** (price)
  - **Where do stop losses likely sit?** (short text)
  - **Liquidation map checked** (yes/no)
- New nullable columns: `liq_above numeric`, `liq_below numeric`, `stops_note text`, `liq_map_checked boolean`.
- Show them on observation cards.

### Timeframes
- Replace the single **Timeframe** dropdown with **"Timeframes I checked"** multi-select chips. Store them in a new `timeframes text[]` column, and keep writing the first one into `timeframe` for old views.
- Default chip list (editable in Settings): **15m, 30m, 1h, 4h, 8h, 12h, 1D, 1W, 1M, 1Y**. This merges my list (15m, 30m, 1h, 4h, 12h, 24h, weekly, 1 year) with Anikait's (15m, 1h, 4h, 8h, 12h, 24h, weekly, monthly).
- Show a hint: *"Higher timeframes matter more than lower ones."*

### Multi-timeframe chart view
- Add a **"All timeframes"** button next to "Quick chart here". It opens a grid of small TradingView widgets, one per chosen timeframe, for the selected asset.
  - Load the widgets lazily, only when the grid is opened.
  - Allow 2 columns on desktop and 1 on phones.
  - Clicking a tile enlarges it.
- **Limits to check and report.** The free TradingView widget officially accepts intervals `1, 3, 5, 15, 30, 60, 120, 180, 240, D, W` (and `M`).
  - **8h, 12h and 1Y** may not be supported. Try `480` and `720`. If they're rejected, show the nearest supported interval with a small "(4h shown, 12h not available in the free widget)" note.
  - For **1Y**, use a monthly or weekly interval with the widget's `range: "12M"` option.
  - Don't build a custom charting backend for this.

## Phase 3 — Learn: "Start here" first

1. Add a new **Phase 0 · Start here (from Anikait)** at the top of Learn, open by default. Use these concepts, in order:
   - **Spot vs futures (perpetuals)**: owning the coin vs betting on its price.
   - **Long**: profit if price goes up.
   - **Short**: profit if price goes down, and why the risk is unlimited.
   - **Leverage**: borrowing to make a position bigger; small moves become big gains or losses.
   - **Margin and liquidation**: when the exchange force-closes a leveraged position, and how to find the liquidation price.
   - **Stop losses**: your planned exit, and why price is often drawn towards where *other people's* stops sit.
   - **Support and resistance**
   - **Flags (chart pattern)**: a short pause in a strong move, often before it continues. *(Ask me to confirm. My notes say "fags", which I think means "flags".)*
   - **Liquidation map (Coinglass)**: where leveraged positions would be wiped out, and price levels it might be pulled to.
   - **Liquidation heatmap and liquidation history**
   - **How to read these maps**: current price vs nearby liquidation clusters, 48-hour vs weekly view, higher timeframes first.
   - **Order book**: the list of waiting buy and sell orders, and what "walls" are.
   - **Market makers**: who they are (firms like Wintermute or Jump in crypto, Citadel Securities or Virtu in stocks, plus the exchanges themselves, e.g. Binance) and what they do.
   - **Bitcoin dominance (BTC.D)**: why it matters for altcoins.
2. **No duplicates.** Phase 1 already has "Support & resistance", and phase 4 has "Long vs short" and "Leverage, margin & liquidation". Move those rows into Phase 0 (update `phase` and `sort`) instead of adding copies. Do the same on existing accounts, matching by title, and don't touch my notes or `learned` ticks.
3. **"Words I don't understand" list**, a new card at the top of Learn:
   - A quick-add box ("word + where I heard it"), for terms Anikait uses that I don't fully get.
   - Each word has: notes, **Asked Anikait** tick, **Understood** tick, and **Promote to concept** (turns it into a Learn row).
   - Also add a small **＋ Word** button in the header so I can add one from any tab.
   - New table `trading_glossary` (id, user_id, term, context, notes, asked, understood, created_at; unique per user + term), following the root RLS rules.

## Phase 4 — Settings (⚙)
A Settings page or panel with:
1. **Theme: Light / Dark / System** (default System).
   - Saved to `trading_settings.theme` and also `localStorage`, so there's no flash on load.
   - Convert `styles.css` from the media query to `:root[data-theme]` tokens.
   - The embedded TradingView widgets should follow the theme.
2. **Defaults** (add the `trading_settings` columns from Phase 5's schema list now, so Phase 5 only has to read them):
   - home currency
   - risk % per trade
   - fee %
   - funding %
   - starting practice balance (moved here)
   - timeframe chip list
3. **Export my data:**
   - **Date range:** from/to pickers with shortcuts (This week, Last 30 days, All time). This filters every export by `observed_on`, `entry_on` and `opened_on`. *(I read "choose the date frame of the data" as this range. Ask me if you think I meant something else.)*
   - **Everything as a .zip:** use JSZip from a pinned CDN version. It holds:
     - one CSV and one JSON per table
     - a `screenshots/` folder with every image in range, downloaded from storage
     - a `README.txt` explaining the files
   - **Single item:** a **Download** button on each observation card and each practice-trade card. Phase 5 must keep these working. It gives a small .zip with that row's JSON, a readable `.md` summary and its screenshots.
4. **Reset to day one:**
   - A danger-zone section. It suggests "Export everything first" with a button.
   - The user must type **RESET** exactly to enable the button.
   - It deletes all of my `trading_` rows (observations, journal, glossary, trades, concepts, assets, settings). New tables added in later phases must be added to this list and my files in `trading-screenshots`. Then it re-seeds the default watchlist and Learn list, so the 30-day challenge starts again at day 1.
   - Only ever delete rows where `user_id = auth.uid()`; RLS already enforces this. Never touch other apps' tables.
5. **Sign out** moves here, with the account email shown.

## Phase 5 — Practice trades upgrade

### Currency converter
A card at the top right of Practice trades:
- **Input:** an amount and a currency (CAD default, plus INR, EUR, USD, GBP… any currency Frankfurter supports).
- **Output:**
  - the amount in **USDT**
  - **how much of the selected asset** that buys at the current price (e.g. "500 CAD ≈ 357.14 USDT ≈ 0.00352 BTC or 1.4 AAPL shares")
  - a **"Use as quantity"** button that fills the trade form
- **Data sources (all free):**
  - **Fiat rates:** Frankfurter (`https://api.frankfurter.dev/v1/latest?base=CAD`). No key needed, browser-friendly, European Central Bank daily rates.
  - **Crypto and USDT prices:** CoinGecko `simple/price` (free, no key, about 30 calls a minute). Treat 1 USDT as its actual CoinGecko USD price, not exactly $1.
  - **Stock prices:** no reliable free source works without a key. Use Finnhub's free tier, with an optional `FINNHUB_KEY` in `config.js` and `config.example.js`. If there's no key, ask me to type the price.
- **Caching:** about 60 seconds in memory, plus the last value in `localStorage` so it works offline. Always show "as of HH:MM" and the source.
- Put all price fetching in one module (`prices.js`) so the rest of the app can reuse it. Use it to pre-fill **Current price** on the observation form and **Price now** when grading guesses.

### Improvements, based on what paper-trading platforms offer
TradingView, Bybit, Binance, OKX and MEXC all have demo trading, so this tab shouldn't try to be an exchange. Its edge is **practising the rules and recording why**. Build the **must-haves**, and list the **later** items in BUILD_STATUS.md.

**Must-haves:**
1. **Spot or futures mode per trade.**
   - Futures adds **leverage** (1–50x), isolated margin, and a shown **liquidation price**.
   - Formula for long: `entry × (1 − 1/leverage + maintenance)`. Short mirrors it. Default maintenance is 0.5%.
   - If a stop loss sits beyond the liquidation price, show a red warning: "you'd be liquidated before your stop".
2. **Live unrealised P&L** on open trades from `prices.js`, plus account **equity** (balance + unrealised). Refresh every 60 seconds while the tab is open.
3. **Stop and target alerts.** When the live price crosses a trade's stop or target, highlight the trade and offer one-click "Close at stop/target". Don't auto-close silently.
4. **Fees.**
   - Default taker fee is 0.055% each side, editable in Settings.
   - Subtract fees from P&L, and show gross vs net.
   - For futures held more than 8 hours, show an estimated funding cost using a flat editable rate (default 0.01% per 8 hours), and label it as an estimate.
5. **Position-size calculator.** Enter "risk X% of balance" plus a stop, and the app works out the quantity. Default 1%.
6. **Pre-trade checklist,** ticked before **Open trade** is enabled:
   - Higher timeframe trend checked
   - Support/resistance marked
   - Liquidation map checked (crypto)
   - Stop placed
   - Reward/risk ≥ 2

   Store the ticks with the trade.
7. **Setup tag** per trade (breakout, bounce off support, trend continuation, other), and a link to the observation it came from, if any.
8. **Stats panel:**
   - win rate
   - average R
   - expectancy
   - profit factor
   - largest win and loss
   - max drawdown
   - an **equity curve** chart (inline SVG, no library needed)
   - breakdowns by setup, asset, spot vs futures, and how I felt

**Later** (list in BUILD_STATUS.md, don't build now):
- limit orders that fill when price touches
- partial closes
- a chart-replay mode
- trades drawn on the chart

**Schema:** new nullable columns on `trading_paper_trades` (`mode`, `leverage`, `maintenance_pct`, `fee_pct`, `funding_est`, `setup`, `checklist jsonb`, `observation_id`) and on `trading_settings` (`fee_pct`, `funding_pct_8h`, `risk_pct`, `home_currency`; Phase 4 already added these, so reuse them).

---

## Done when
- Each phase works in the browser against the real project, using my account, and existing data is still there afterwards.
- `supabase/trading_schema.sql` runs twice in a row without errors, and `../supabase/checks.sql` is clean (including `trading_glossary`).
- Both dashboard views still return the standard columns, and `trading_dashboard_now` shows the new streak and headline behaviour.
- Export → Reset → (optional) re-import isn't required, but Export then Reset must leave a zip I can open, and an app back at day 1.
- `docs/DATA_CONTRACT.md`, `docs/BUILD_STATUS.md`, `README.md` and `../docs/DECISIONS.md` are updated.

Stop after the phase you were asked to do, and tell me exactly what to test in the browser.
