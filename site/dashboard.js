"use strict";

const EMBED_URL = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
const STORAGE_KEY = "egypt-funds:dashboard";
const KEEP_ON_KEY = "egypt-funds:keep-screen-on";
const DEFAULT_SYMBOLS = ["EGX:EGX30", "EGX:COMI", "EGX:TMGH", "EGX:HRHO", "EGX:EAST", "EGX:ETEL", "EGX:SWDY", "EGX:ABUK", "EGX:FWRY"];
// Button label -> TradingView dateRange value.
const RANGES = { "1D": "1D", "1M": "1M", "3M": "3M", "1Y": "12M", "5Y": "60M", All: "ALL" };
const MAX_CHARTS = 20;
const RELOAD_EVERY_MS = 30 * 60_000;
const RELOAD_AFTER_HIDDEN_MS = 5 * 60_000;

const $ = (selector) => document.querySelector(selector);
const theme = () => (getComputedStyle(document.documentElement).colorScheme === "dark" ? "dark" : "light");
const chartPageUrl = new URL("market.html", location.href).href;
const cairoTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Cairo" });
const isSymbol = (value) => /^EGX:[A-Z0-9_.]+$/.test(value);
const tickerOf = (symbol) => symbol.slice("EGX:".length);
const wakeSwitch = $("#wake-switch");

const state = { symbols: [], range: "1D", names: new Map(), lastReload: 0, hiddenAt: 0 };
let wakeLock = null;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children);
  return node;
}

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage is blocked (e.g. private mode); the page address still keeps the dashboard.
  }
}

function showMessage(text) {
  $("#dash-message").textContent = text;
}

/* ---------- State ---------- */

function loadState() {
  let saved = {};
  try {
    saved = JSON.parse(readStorage(STORAGE_KEY)) || {};
  } catch {
    saved = {};
  }
  const params = new URLSearchParams(location.hash.slice(1));
  const linked = (params.get("s") || "").split(",").filter(Boolean).map((ticker) => `EGX:${ticker.toUpperCase()}`);
  const symbols = params.has("s") ? linked : Array.isArray(saved.symbols) ? saved.symbols : DEFAULT_SYMBOLS;
  state.symbols = [...new Set(symbols)].filter(isSymbol).slice(0, MAX_CHARTS);
  const range = String(params.get("r") || saved.range);
  state.range = Object.hasOwn(RANGES, range) ? range : "1D";
}

function saveState() {
  writeStorage(STORAGE_KEY, JSON.stringify({ symbols: state.symbols, range: state.range }));
  history.replaceState(null, "", `#s=${state.symbols.map(tickerOf).join(",")}&r=${state.range}`);
}

/* ---------- Charts ---------- */

function mountChart(container, symbol) {
  const script = document.createElement("script");
  script.src = EMBED_URL;
  script.async = true;
  script.textContent = JSON.stringify({
    symbol,
    dateRange: RANGES[state.range],
    colorTheme: theme(),
    autosize: true,
    locale: "en",
    largeChartUrl: chartPageUrl,
  });
  container.replaceChildren(
    el("div", { class: "tradingview-widget-container" }, el("div", { class: "tradingview-widget-container__widget" }), script),
  );
}

function tile(symbol) {
  const ticker = tickerOf(symbol);
  const body = el("div", { class: "tile-body" });
  mountChart(body, symbol);
  return el("article", { class: "tile", "data-symbol": symbol },
    el("header", { class: "tile-head" },
      el("span", { text: ticker }),
      el("button", { type: "button", class: "icon-btn small", "data-remove": symbol, "aria-label": `Remove ${ticker}`, text: "×" })),
    body);
}

function reloadCharts() {
  $("#board").replaceChildren(...state.symbols.map(tile));
  state.lastReload = Date.now();
  updateBoard();
}

function updateBoard() {
  $("#board-empty").hidden = state.symbols.length > 0;
  $("#status").textContent =
    `${state.symbols.length} of ${MAX_CHARTS} charts · live, delayed about 15 minutes · ` +
    `last reloaded ${cairoTime.format(state.lastReload)} Cairo time`;
  for (const button of $("#ranges").children) {
    button.setAttribute("aria-pressed", String(button.dataset.range === state.range));
  }
  fitFullscreen();
}

/* ---------- Adding and removing stocks ---------- */

function resolve(term) {
  const ticker = term.split(" — ")[0].trim().toUpperCase();
  if (state.names.has(`EGX:${ticker}`)) return { symbol: `EGX:${ticker}` };
  if (!state.names.size) {
    return /^[A-Z0-9_.]{2,12}$/.test(ticker) ? { symbol: `EGX:${ticker}` } : { error: `“${term}” isn't a ticker` };
  }
  const needle = term.toLowerCase();
  const matches = [...state.names].filter(([, name]) => name.toLowerCase().includes(needle));
  if (matches.length === 1) return { symbol: matches[0][0] };
  return {
    error: matches.length
      ? `“${term}” matches ${matches.length} stocks; pick one from the list`
      : `No EGX stock matches “${term}”`,
  };
}

function onAdd(event) {
  event.preventDefault();
  const input = $("#add-input");
  const value = input.value.trim();
  if (!value) return;
  // A suggestion from the list is "TICKER — Company name"; otherwise commas separate several stocks.
  const terms = value.includes(" — ") ? [value] : value.split(/[,،]/).map((term) => term.trim()).filter(Boolean);
  const added = [];
  const problems = [];
  for (const term of terms) {
    const { symbol, error } = resolve(term);
    if (error) {
      problems.push(error);
    } else if (state.symbols.includes(symbol)) {
      problems.push(`${tickerOf(symbol)} is already on the dashboard`);
    } else if (state.symbols.length >= MAX_CHARTS) {
      problems.push(`The dashboard holds up to ${MAX_CHARTS} charts`);
      break;
    } else {
      state.symbols.push(symbol);
      $("#board").append(tile(symbol));
      added.push(tickerOf(symbol));
    }
  }
  if (added.length) {
    input.value = "";
    saveState();
    updateBoard();
  }
  showMessage([added.length ? `Added ${added.join(", ")}` : "", ...problems].filter(Boolean).join(". ") + ".");
}

function onRemove(event) {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  state.symbols = state.symbols.filter((symbol) => symbol !== button.dataset.remove);
  button.closest(".tile").remove();
  saveState();
  updateBoard();
  showMessage(`Removed ${tickerOf(button.dataset.remove)}.`);
}

async function loadStockList() {
  try {
    const response = await fetch("data/egx-stocks.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const list = await response.json();
    for (const { symbol, name } of list) state.names.set(symbol, name);
    $("#stock-options").replaceChildren(...list.map(({ symbol, name }) => el("option", { value: `${tickerOf(symbol)} — ${name}` })));
  } catch (error) {
    // Without the list, exact tickers can still be added.
    console.error(error);
  }
}

/* ---------- Full screen and keeping the screen on ---------- */

// In full screen all charts share the screen; pick the column count that gives the largest ~16:10 tiles.
function fitFullscreen() {
  const board = $("#board");
  if (document.fullscreenElement !== board) return;
  const count = Math.max(state.symbols.length, 1);
  let best = { cols: 1, rows: count, size: 0 };
  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const size = Math.min(innerWidth / cols / 1.6, innerHeight / rows);
    if (size > best.size) best = { cols, rows, size };
  }
  board.style.setProperty("--cols", best.cols);
  board.style.setProperty("--rows", best.rows);
}

async function requestWakeLock() {
  if (wakeLock || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    setKeepScreenOn(false);
    showMessage("This browser didn't allow keeping the screen on.");
  }
}

function setKeepScreenOn(on) {
  wakeSwitch.setAttribute("aria-checked", String(on));
  writeStorage(KEEP_ON_KEY, on ? "on" : null);
}

/* ---------- Wiring ---------- */

$("#ranges").replaceChildren(
  ...Object.keys(RANGES).map((range) => el("button", { type: "button", "data-range": range, "aria-pressed": "false", text: range })),
);
$("#ranges").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-range]");
  if (!button || button.dataset.range === state.range) return;
  state.range = button.dataset.range;
  saveState();
  reloadCharts();
});
$("#add-form").addEventListener("submit", onAdd);
$("#board").addEventListener("click", onRemove);
$("#refresh").addEventListener("click", reloadCharts);
$("#clear").addEventListener("click", () => {
  if (!state.symbols.length || !confirm("Remove all charts from the dashboard?")) return;
  state.symbols = [];
  saveState();
  reloadCharts();
  showMessage("Cleared. Add stocks to build a new dashboard.");
});

if (document.fullscreenEnabled) {
  $("#fullscreen").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else $("#board").requestFullscreen().catch(() => showMessage("Full screen isn't available here."));
  });
  document.addEventListener("fullscreenchange", () => {
    $("#fullscreen").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
    fitFullscreen();
  });
  window.addEventListener("resize", fitFullscreen);
} else {
  $("#fullscreen").hidden = true;
}

if ("wakeLock" in navigator) {
  wakeSwitch.hidden = false;
  wakeSwitch.addEventListener("click", () => {
    const on = wakeSwitch.getAttribute("aria-checked") !== "true";
    setKeepScreenOn(on);
    if (on) requestWakeLock();
    else wakeLock?.release();
  });
  if (readStorage(KEEP_ON_KEY) === "on") {
    setKeepScreenOn(true);
    requestWakeLock();
  }
}

// Reload the charts periodically and after the tab was hidden for a while, in case a live feed stalled.
setInterval(() => {
  if (document.visibilityState === "visible" && Date.now() - state.lastReload >= RELOAD_EVERY_MS) reloadCharts();
}, 60_000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    state.hiddenAt = Date.now();
    return;
  }
  if (state.hiddenAt && Date.now() - state.hiddenAt >= RELOAD_AFTER_HIDDEN_MS) reloadCharts();
  state.hiddenAt = 0;
  if (wakeSwitch.getAttribute("aria-checked") === "true") requestWakeLock();
});
window.addEventListener("hashchange", () => {
  loadState();
  reloadCharts();
});
window.addEventListener("themechange", reloadCharts);

loadState();
reloadCharts();
saveState();
loadStockList();
