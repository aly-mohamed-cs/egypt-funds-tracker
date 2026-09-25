"use strict";

const EMBED_URL = "https://s3.tradingview.com/external-embedding/embed-widget-";
const DEFAULT_SYMBOL = "EGX:EGX30";
const QUICK_PICKS = [
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
];

const $ = (selector) => document.querySelector(selector);
// The stylesheet sets color-scheme from the theme switch or, if unset, the system setting.
const theme = () => (getComputedStyle(document.documentElement).colorScheme === "dark" ? "dark" : "light");
// TradingView widgets send clicks on a stock to this page as ?tvwidgetsymbol=EXCHANGE:TICKER.
const chartPageUrl = new URL("market.html", location.href).href;

function currentSymbol() {
  const requested = new URLSearchParams(location.search).get("tvwidgetsymbol") || "";
  return /^[A-Z0-9_]+:[A-Z0-9_.]+$/.test(requested) ? requested : DEFAULT_SYMBOL;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Widgets keep their own theme background: in transparent mode several of them draw
// dark-theme text over a light backdrop.
function mountWidget(container, name, config) {
  const widget = document.createElement("div");
  widget.className = "tradingview-widget-container__widget";
  const script = document.createElement("script");
  script.src = `${EMBED_URL}${name}.js`;
  script.async = true;
  script.textContent = JSON.stringify(config);
  const wrapper = document.createElement("div");
  wrapper.className = "tradingview-widget-container";
  wrapper.append(widget, script);
  container.replaceChildren(wrapper);
}

function renderTicker() {
  mountWidget($("#ticker"), "ticker-tape", {
    symbols: QUICK_PICKS.map(([proName, title]) => ({ proName, title })),
    showSymbolLogo: true,
    displayMode: "adaptive",
    colorTheme: theme(),
    locale: "en",
    largeChartUrl: chartPageUrl,
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
    timezone: "Africa/Cairo",
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
  mountWidget($("#movers"), "hotlists", {
    exchange: "EGX",
    dateRange: "1D",
    showChart: true,
    showSymbolLogo: true,
    showFloatingTooltip: false,
    colorTheme: theme(),
    locale: "en",
    width: "100%",
    height: 560,
    largeChartUrl: chartPageUrl,
  });
}

function renderScreener() {
  mountWidget($("#screener"), "screener", {
    market: "egypt",
    defaultColumn: "overview",
    defaultScreen: "general",
    showToolbar: true,
    colorTheme: theme(),
    locale: "en",
    width: "100%",
    height: 640,
    largeChartUrl: chartPageUrl,
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
  ...QUICK_PICKS.map(([symbol, label]) => {
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
