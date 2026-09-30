# Egypt Funds Tracker

A self-updating tracker for Egyptian mutual funds, with live Egyptian, US and crypto markets alongside, on five pages:

- **Mutual funds** — a searchable table of every Egyptian fund's latest price (NAV) and returns, with price-history charts and side-by-side comparisons.
- **Egypt stocks** — the Egyptian Exchange (EGX) updating live: a ticker strip, a full chart for any stock or index, market movers and a list of every listed stock.
- **US stocks** — US-listed stocks updating live: S&P 500, Nasdaq 100 and Dow Jones levels, a full chart for any stock, market movers and a screener sorted by market value.
- **Crypto** — cryptocurrencies in real time: top coins, total market cap and Bitcoin dominance trends, a full chart for any coin and a screener of coins by market value.
- **Dashboard** — a grid of live mini charts for any mix of Egyptian stocks, US stocks and coins, built to stay open all day.

**Live site:** https://aly-mohamed-cs.github.io/egypt-funds-tracker/ (with a dark mode switch on every page)

## How it works

1. Every day at 18:00 UTC (about 21:00 in Cairo) a GitHub Actions workflow runs `python -m tracker.update`.
2. The script downloads the latest NAV of every Egyptian fund listed on [Mubasher Info](https://english.mubasher.info/countries/eg/funds) in a single request, adds it to `site/data/history/<fund id>.csv`, recalculates returns, and writes `site/data/funds.json`.
3. On Fridays, and whenever a new fund appears, it also refreshes Arabic names and fund categories (17 more requests) and imports each new fund's past prices.
4. It then runs `python -m tracker.symbols`, which refreshes the lists behind the dashboard's search box from TradingView's screener (four requests): every EGX stock, the 2,000 largest US stocks and 200 largest US ETFs, and the 200 largest coins, leaving out stablecoins and wrapped or staked tokens because they only mirror another price. They're saved to `site/data/symbols/egypt.json`, `us.json` and `crypto.json`. If a market's request fails, its old list is kept and the fund update still goes ahead.
5. The workflow commits the updated data to this repo and publishes the `site/` folder to GitHub Pages.

## Markets and dashboard

- **Live data** comes from [TradingView](https://www.tradingview.com/) widgets embedded in the pages, so there is no data pipeline to run: prices stream into the browser while a page is open.
  - Egyptian and US stock prices are delayed by about 15 minutes (TradingView marks them with a D). Real-time stock prices need a paid data licence.
  - Crypto prices are real time, in US dollars, combined from several exchanges by TradingView.
  - The S&P 500, Nasdaq 100 and Dow Jones levels come from FOREX.com's index CFDs, which aren't delayed and trade almost around the clock, because the official index feeds aren't available in free widgets.
- **Market pages** (`market.html`, `us-stocks.html`, `crypto.html`) share `market.js`; each page's `data-market` attribute picks its quick picks and widgets. Click any symbol in the ticker strip, market movers or list to open it in the main chart; the page address becomes, for example, `us-stocks.html?tvwidgetsymbol=NASDAQ:AAPL`, so it can be bookmarked. The crypto page shows a **Trends** panel (top coins, total market cap and dominance) in place of market movers. Charts show each market's own time: Cairo, New York or UTC.
- **Dashboard:** add up to 20 charts from any market by ticker, company or coin name, or coin code (for example `COMI, AAPL, Bitcoin, BTC`), several at once with commas; anything missing from the search lists can be added as `EXCHANGE:TICKER`. Switch every chart between 1D, 1M, 3M, 1Y, 5Y and All, and use **Full screen** to fit all charts on the screen. **Keep screen on** asks the browser not to let the display sleep while the page is visible; browsers that don't support it hide the switch. Charts reload every 30 minutes, and when you return to the tab after more than 5 minutes away, in case a live feed stalls. Clicking a chart opens it on its market page. The selection is saved in the browser and in the page address (`dashboard.html#s=COMI,NASDAQ:AAPL,CRYPTO:BTCUSD&r=1D`; Egyptian tickers need no exchange), so it can be bookmarked or shared.
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

- `tracker/` — the updater: Mubasher client, storage, return calculations, and the dashboard's search lists (`symbols.py`)
- `tests/` — pytest suite
- `site/` — the static website: `index.html`/`app.js` (mutual funds), `market.html`, `us-stocks.html` and `crypto.html` with `market.js` (market pages), `dashboard.html`/`dashboard.js` (dashboard), `markets.js` (which page and search list belong to each market), `theme.js` (dark mode switch), `styles.css`
- `site/data/` — the generated data
- `.github/workflows/update.yml` — daily schedule and GitHub Pages deployment
