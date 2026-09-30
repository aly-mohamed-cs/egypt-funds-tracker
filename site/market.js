import { chartPageUrl, isSymbol, mountWidget, theme } from "./markets.js";

const COINS = [
  ["CRYPTO:BTCUSD", "Bitcoin"],
  ["CRYPTO:ETHUSD", "Ethereum"],
  ["CRYPTO:XRPUSD", "XRP"],
  ["CRYPTO:BNBUSD", "BNB"],
  ["CRYPTO:SOLUSD", "Solana"],
  ["CRYPTO:TRXUSD", "TRON"],
  ["CRYPTO:DOGEUSD", "Dogecoin"],
  ["CRYPTO:ADAUSD", "Cardano"],
  ["CRYPTO:LINKUSD", "Chainlink"],
];

// Each market page shares this script; <body data-market> picks its quick picks and widgets.
// The first quick pick is the chart's default symbol.
const PAGES = {
  egypt: {
    timezone: "Africa/Cairo",
    quickPicks: [
      ["EGX:EGX30", "EGX 30"],
      ["EGX:EGX70EWI", "EGX 70 EWI"],
      ["EGX:EGX100EWI", "EGX 100 EWI"],
      ["EGX:COMI", "CIB"],
      ["EGX:TMGH", "Talaat Moustafa"],
      ["EGX:HRHO", "EFG Holding"],
      ["EGX:EAST", "Eastern Company"],
      ["EGX:ETEL", "Telecom Egypt"],
      ["EGX:SWDY", "Elsewedy Electric"],
      ["EGX:ABUK", "Abu Qir Fertilizers"],
      ["EGX:FWRY", "Fawry"],
      ["EGX:EFIH", "e-finance"],
      ["EGX:ORAS", "Orascom Construction"],
    ],
    movers: ["hotlists", { exchange: "EGX" }],
    screener: { market: "egypt", defaultScreen: "general", showToolbar: true },
  },
  us: {
    timezone: "America/New_York",
    quickPicks: [
      ["FOREXCOM:SPXUSD", "S&P 500"],
      ["FOREXCOM:NSXUSD", "Nasdaq 100"],
      ["FOREXCOM:DJI", "Dow Jones"],
      ["NASDAQ:NVDA", "Nvidia"],
      ["NASDAQ:AAPL", "Apple"],
      ["NASDAQ:MSFT", "Microsoft"],
      ["NASDAQ:GOOGL", "Alphabet"],
      ["NASDAQ:AMZN", "Amazon"],
      ["NASDAQ:META", "Meta"],
      ["NASDAQ:AVGO", "Broadcom"],
      ["NASDAQ:TSLA", "Tesla"],
      ["NYSE:BRK.B", "Berkshire Hathaway"],
      ["NYSE:JPM", "JPMorgan Chase"],
    ],
    movers: ["hotlists", { exchange: "US" }],
    screener: { market: "america", defaultScreen: "most_capitalized", showToolbar: true },
  },
  crypto: {
    timezone: "Etc/UTC",
    quickPicks: [...COINS, ["CRYPTOCAP:TOTAL", "Total market cap"], ["CRYPTOCAP:BTC.D", "Bitcoin dominance"]],
    movers: ["market-overview", {
      tabs: [
        { title: "Coins", symbols: COINS.map(([s, d]) => ({ s, d })) },
        {
          title: "Market",
          symbols: [
            { s: "CRYPTOCAP:TOTAL", d: "Total market cap" },
            { s: "CRYPTOCAP:TOTAL2", d: "Market cap excluding Bitcoin" },
            { s: "CRYPTOCAP:BTC.D", d: "Bitcoin dominance" },
            { s: "CRYPTOCAP:ETH.D", d: "Ethereum dominance" },
          ],
        },
      ],
    }],
    screener: { screener_type: "crypto_mkt", displayCurrency: "USD" },
  },
};

const market = document.body.dataset.market;
const page = PAGES[market];
const pageUrl = chartPageUrl(market);
const $ = (selector) => document.querySelector(selector);

function currentSymbol() {
  const requested = new URLSearchParams(location.search).get("tvwidgetsymbol") || "";
  return isSymbol(requested) ? requested : page.quickPicks[0][0];
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderTicker() {
  mountWidget($("#ticker"), "ticker-tape", {
    symbols: page.quickPicks.map(([proName, title]) => ({ proName, title })),
    showSymbolLogo: true,
    displayMode: "adaptive",
    colorTheme: theme(),
    locale: "en",
    largeChartUrl: pageUrl,
  });
}

function renderSelected(symbol) {
  mountWidget($("#symbol-info"), "symbol-info", {
    symbol,
    width: "100%",
    locale: "en",
    colorTheme: theme(),
  });
  mountWidget($("#chart"), "advanced-chart", {
    autosize: true,
    symbol,
    interval: "5",
    timezone: page.timezone,
    theme: theme(),
    style: "1",
    locale: "en",
    backgroundColor: cssVar("--surface"),
    gridColor: cssVar("--grid"),
    allow_symbol_change: true,
    hide_side_toolbar: true,
    calendar: false,
    support_host: "https://www.tradingview.com",
  });
  for (const chip of $("#symbol-chips").children) {
    chip.setAttribute("aria-pressed", String(chip.dataset.symbol === symbol));
  }
}

function renderMovers() {
  const [widget, config] = page.movers;
  mountWidget($("#movers"), widget, {
    ...config,
    dateRange: "1D",
    showChart: true,
    showSymbolLogo: true,
    showFloatingTooltip: false,
    colorTheme: theme(),
    locale: "en",
    width: "100%",
    height: 560,
    largeChartUrl: pageUrl,
  });
}

function renderScreener() {
  mountWidget($("#screener"), "screener", {
    ...page.screener,
    defaultColumn: "overview",
    colorTheme: theme(),
    locale: "en",
    width: "100%",
    height: 640,
    largeChartUrl: pageUrl,
  });
}

function renderAll() {
  renderTicker();
  renderSelected(currentSymbol());
  renderMovers();
  renderScreener();
}

function showSymbol(symbol) {
  const url = new URL(location.href);
  url.searchParams.set("tvwidgetsymbol", symbol);
  history.pushState(null, "", url);
  renderSelected(symbol);
}

$("#symbol-chips").replaceChildren(
  ...page.quickPicks.map(([symbol, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.dataset.symbol = symbol;
    chip.textContent = label;
    chip.setAttribute("aria-pressed", "false");
    return chip;
  }),
);
$("#symbol-chips").addEventListener("click", (event) => {
  const chip = event.target.closest("button[data-symbol]");
  if (chip) showSymbol(chip.dataset.symbol);
});
window.addEventListener("popstate", () => renderSelected(currentSymbol()));
window.addEventListener("themechange", renderAll);
renderAll();
