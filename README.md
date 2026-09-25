# Egypt Funds Tracker

A self-updating tracker for Egyptian markets, with three pages:

- **Mutual funds** — a searchable table of every Egyptian fund's latest price (NAV) and returns, with price-history charts and side-by-side comparisons.
- **Stock market** — the Egyptian Exchange (EGX) updating live: a ticker strip, a full chart for any stock or index, market movers and a list of every listed stock.
- **Dashboard** — a grid of live mini charts for the stocks you pick, built to stay open all trading day.

**Live site:** https://aly-mohamed-cs.github.io/egypt-funds-tracker/ (with a dark mode switch on every page)

## How it works

1. Every day at 18:00 UTC (about 21:00 in Cairo) a GitHub Actions workflow runs `python -m tracker.update`.
2. The script downloads the latest NAV of every Egyptian fund listed on [Mubasher Info](https://english.mubasher.info/countries/eg/funds) in a single request, adds it to `site/data/history/<fund id>.csv`, recalculates returns, and writes `site/data/funds.json`.
3. On Fridays, and whenever a new fund appears, it also refreshes Arabic names and fund categories (17 more requests) and imports each new fund's past prices.
4. It then runs `python -m tracker.stocks`, which refreshes the list of EGX tickers and company names (`site/data/egx-stocks.json`) used by the dashboard's stock search. If that one request fails, the old list is kept and the fund update still goes ahead.
5. The workflow commits the updated data to this repo and publishes the `site/` folder to GitHub Pages.

## Stock market and dashboard

- **Live data** comes from [TradingView](https://www.tradingview.com/) widgets embedded in the pages, so there is no data pipeline to run: prices stream into the browser while a page is open. EGX data on TradingView is delayed by about 15 minutes; real-time EGX prices need a paid data licence.
- **Stock market page:** click any stock in the ticker strip, market movers or stock list to open it in the main chart (the page address becomes `market.html?tvwidgetsymbol=EGX:TICKER`, so it can be bookmarked). The quick-pick buttons cover the main indices and several blue chips, and the chart's own search finds any EGX symbol.
- **Dashboard:** add up to 20 stocks by ticker or company name (several at once with commas), switch every chart between 1D, 1M, 3M, 1Y, 5Y and All, and use **Full screen** to fit all charts on the screen. **Keep screen on** asks the browser not to let the display sleep while the page is visible; browsers that don't support it hide the switch. Charts reload every 30 minutes, and when you return to the tab after more than 5 minutes away, in case a live feed stalls. The selection is saved in the browser and in the page address (`dashboard.html#s=COMI,TMGH&r=1D`), so it can be bookmarked or shared.
- **Dark mode:** the switch on every page overrides the system setting and is remembered in the browser; until it's used, pages follow the system setting.

## Data notes

- **Source.** Mubasher Info's fund list and price-history files. Mubasher's robots.txt asks automated clients not to use `/api/`; this project keeps its use to about one request a day, 5 seconds apart, with a User-Agent that links back here. If Mubasher blocks the requests or changes its format, the workflow fails, GitHub emails the repo owner, and the site keeps showing the last good data.
- **Freshness.** Mubasher's figures can lag by a few days, and some funds only publish a NAV once a week.
- **Returns** are price returns calculated from NAV, so distributions aren't included. 1W, 1M, 3M and 1Y need a price close to the start of the period, otherwise they're left blank; funds whose Mubasher history is missing or stale fill these in as daily prices accumulate. YTD falls back to Mubasher's own figure (marked `*`) when the stored history doesn't reach the start of the year, unless that figure is implausible (below −50% or above +200%).
- **Unit splits and glitches.** Some funds split their units (for example 1:40 or 1:100), and Mubasher's history has occasional one-off bad prices; Mubasher adjusts for neither. A move of 1.9× or more between two prices at most 45 days apart is treated as a split or glitch: earlier prices are rescaled by that ratio for returns and charts, while the stored CSVs keep the raw prices.
- **Inactive funds** are those whose latest NAV is more than 30 days older than the newest NAV in the dataset. They're hidden by default.
- **Currency** is inferred from the fund name: USD if it mentions USD or dollar, otherwise EGP.
- This is not investment advice.

## Run it locally

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # macOS/Linux: .venv/bin/pip
python -m pytest -q
python -m tracker.update
python -m http.server 8000 --directory site      # then open http://localhost:8000
```

`python -m tracker.update --full` refreshes names and categories even when it isn't Friday. `--backfill all` (or a list of fund ids) re-imports price history from Mubasher's CSV files.

## Operating it

- **Refresh now:** Actions tab → *Update fund data* → *Run workflow*, or `gh workflow run update.yml`.
- **Change the schedule:** edit the `cron` line in `.github/workflows/update.yml` (times are UTC). For example, `0 18 * * 0` runs weekly on Sundays.
- **If the schedule stops running:** GitHub disables scheduled workflows after 60 days without repository activity. The daily data commits normally prevent that; if it happens, re-enable the workflow from the Actions tab.
- **If Mubasher blocks GitHub's servers:** run the updater from your own computer instead, for example with Windows Task Scheduler running `python -m tracker.update` and then `git add site/data`, `git commit -m "data"`, `git push`. The push triggers a redeploy of the site.

## Layout

- `tracker/` — the updater: Mubasher client, storage, return calculations, and the EGX ticker list (`stocks.py`)
- `tests/` — pytest suite
- `site/` — the static website: `index.html`/`app.js` (mutual funds), `market.html`/`market.js` (stock market), `dashboard.html`/`dashboard.js` (dashboard), `theme.js` (dark mode switch), `styles.css`
- `site/data/` — the generated data
- `.github/workflows/update.yml` — daily schedule and GitHub Pages deployment
