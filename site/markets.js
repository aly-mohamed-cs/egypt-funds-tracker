// The markets the site covers: the page that charts each one and the symbol list behind the dashboard search.
export const MARKETS = {
  egypt: { label: "Egypt", page: "market.html", list: "data/symbols/egypt.json" },
  us: { label: "US", page: "us-stocks.html", list: "data/symbols/us.json" },
  crypto: { label: "Crypto", page: "crypto.html", list: "data/symbols/crypto.json" },
};

// FOREX.com supplies the US index levels (see tracker/symbols.py).
const US_EXCHANGES = new Set(["NASDAQ", "NYSE", "AMEX", "BATS", "OTC", "FOREXCOM"]);
const EMBED_URL = "https://s3.tradingview.com/external-embedding/embed-widget-";

export const isSymbol = (value) => /^[A-Z0-9_]+:[A-Z0-9_.]+$/.test(value);

export function marketOf(symbol) {
  const exchange = symbol.slice(0, symbol.indexOf(":"));
  if (exchange === "EGX") return "egypt";
  return US_EXCHANGES.has(exchange) ? "us" : "crypto";
}

// TradingView widgets send clicks on a symbol to this page as ?tvwidgetsymbol=EXCHANGE:TICKER.
export const chartPageUrl = (market) => new URL(MARKETS[market].page, location.href).href;

// The stylesheet sets color-scheme from the theme switch or, if unset, the system setting.
export const theme = () => (getComputedStyle(document.documentElement).colorScheme === "dark" ? "dark" : "light");

// Widgets keep their own theme background: in transparent mode several of them draw
// dark-theme text over a light backdrop.
export function mountWidget(container, name, config) {
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
