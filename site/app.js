"use strict";

const RETURN_KEYS = ["1W", "1M", "3M", "YTD", "1Y"];
const PERIODS = { "1M": 1, "3M": 3, "6M": 6, YTD: "ytd", "1Y": 12, "3Y": 36, "5Y": 60, All: null };
const TICK_UNITS = { "1M": "week", "3M": "month", "6M": "month", YTD: "month", "1Y": "month", "3Y": "quarter", "5Y": "year", All: "year" };
const DEFAULT_PERIOD = "1Y";
const MAX_COMPARE = 5;
const DAY_MS = 86_400_000;
const GAP_MS = 45 * DAY_MS;
const TEXT_SORT_KEYS = new Set(["name", "category", "manager", "currency"]);
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const FUND_PAGE_URL = "https://english.mubasher.info/countries/EG/funds/";

const state = {
  data: null,
  funds: [],
  byId: new Map(),
  categories: [],
  sort: { key: "YTD", dir: "desc" },
  filters: { search: "", categories: new Set(), currency: "", manager: "", hideStale: true },
  lang: readPref("lang") === "ar" ? "ar" : "en",
  compare: new Map(),
  view: null,
};
const historyCache = new Map();
let chart = null;
let chartConfig = null;
let lastRender = null;
let returnFocusTo = null;

const navFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const pctFormat = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const indexFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const factorFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 });
const dayFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const cairoFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Cairo",
});

const $ = (selector) => document.querySelector(selector);
const formatPct = (value) => (value == null ? "—" : pctFormat.format(value).replace("-", "−"));
// Noon UTC keeps the calendar day the same in every viewer's time zone.
const toTime = (isoDay) => Date.parse(`${isoDay}T12:00:00Z`);
const formatDay = (time) => dayFormat.format(new Date(time));
const signClass = (value) => (value > 0 ? "pos" : value < 0 ? "neg" : "");
const displayName = (fund) => (state.lang === "ar" && fund.name_ar) || fund.name_en || fund.name_ar;
const managerName = (fund) => (state.lang === "ar" && fund.manager_ar) || fund.manager_en;
const compareIds = () => [...state.compare].sort((a, b) => a[1] - b[1]).map(([id]) => id);
const viewHash = (view) => `${view.type}=${view.ids.join(",")}&p=${view.period}`;

function secondaryName(fund) {
  const other = state.lang === "ar" ? fund.name_en : fund.name_ar;
  return other && other !== displayName(fund) ? other : "";
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "text") node.textContent = value;
    else if (key === "class") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.filter((child) => child != null && child !== false));
  return node;
}

function readPref(key) {
  try {
    return localStorage.getItem(`egypt-funds:${key}`);
  } catch {
    return null;
  }
}

function writePref(key, value) {
  try {
    localStorage.setItem(`egypt-funds:${key}`, value);
  } catch {
    // Storage is blocked (e.g. private mode); the preference just isn't remembered.
  }
}

function normalize(text) {
  return (text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯـً-ٰٟ]/g, "")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) || 0) + 1);
  return counts;
}

async function init() {
  bindControls();
  updateLangButtons();
  try {
    const response = await fetch("data/funds.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    loadData(await response.json());
  } catch (error) {
    $("#status").textContent = "Couldn't load the fund data. Please refresh the page.";
    console.error(error);
    return;
  }
  renderTable();
  updateCompareBar();
  applyHash();
}

function loadData(data) {
  state.data = data;
  state.funds = data.funds.map((fund) => ({
    ...fund,
    searchText: normalize([fund.name_en, fund.name_ar, fund.manager_en, fund.manager_ar].join(" ")),
  }));
  state.byId = new Map(state.funds.map((fund) => [fund.id, fund]));
  const counts = countBy(state.funds, (fund) => fund.category);
  state.categories = [...counts.keys()].sort(
    (a, b) => (a === "Other") - (b === "Other") || counts.get(b) - counts.get(a) || a.localeCompare(b),
  );
  $("#categories").replaceChildren(
    categoryChip("", "All"),
    ...state.categories.map((category) => categoryChip(category, category)),
  );
  const managers = countBy(state.funds.filter((fund) => fund.manager_en), (fund) => fund.manager_en);
  $("#manager").append(
    ...[...managers.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((manager) => el("option", { value: manager, text: `${manager} (${managers.get(manager)})` })),
  );
  $("#status").replaceChildren(
    `NAVs up to ${formatDay(toTime(data.latest_nav_date))} · Updated ${cairoFormat.format(new Date(data.generated_at))} Cairo time · ${state.funds.length} funds · Source: `,
    el("a", { href: data.source.url, target: "_blank", rel: "noopener", text: data.source.name }),
  );
}

function categoryChip(value, label) {
  return el("button", { type: "button", class: "chip", "data-category": value, "aria-pressed": "false" },
    label, el("span", { class: "chip-count" }));
}

function bindControls() {
  const { filters } = state;
  $("#search").addEventListener("input", (event) => {
    filters.search = event.target.value;
    renderTable();
  });
  $("#currency").addEventListener("change", (event) => {
    filters.currency = event.target.value;
    renderTable();
  });
  $("#manager").addEventListener("change", (event) => {
    filters.manager = event.target.value;
    renderTable();
  });
  $("#hide-stale").addEventListener("change", (event) => {
    filters.hideStale = event.target.checked;
    renderTable();
  });
  $("#categories").addEventListener("click", onCategoryClick);
  for (const button of document.querySelectorAll("[data-lang]")) {
    button.addEventListener("click", () => setLang(button.dataset.lang));
  }
  $(".funds thead").addEventListener("click", onSortClick);
  $("#rows").addEventListener("click", onRowClick);
  $("#rows").addEventListener("change", onCompareToggle);
  $("#compare-open").addEventListener("click", () => {
    location.hash = viewHash({ type: "compare", ids: compareIds(), period: DEFAULT_PERIOD });
  });
  $("#compare-clear").addEventListener("click", () => {
    state.compare.clear();
    syncCompare();
  });

  const panel = $("#panel");
  panel.addEventListener("cancel", (event) => {
    event.preventDefault();
    requestClose();
  });
  panel.addEventListener("click", (event) => {
    if (event.target === panel) requestClose();
  });
  $("#panel-close").addEventListener("click", requestClose);
  $("#periods").replaceChildren(
    ...Object.keys(PERIODS).map((period) =>
      el("button", { type: "button", "data-period": period, "aria-pressed": "false", text: period })),
  );
  $("#periods").addEventListener("click", onPeriodClick);
  $("#panel-legend").addEventListener("click", onLegendClick);
  $("#table-view").addEventListener("toggle", renderTableView);
  window.addEventListener("hashchange", applyHash);
  window.addEventListener("themechange", () => {
    if (lastRender) drawView(lastRender.view, lastRender.series);
  });
}

/* ---------- Table ---------- */

function visibleFunds() {
  const { filters } = state;
  const terms = normalize(filters.search).split(/\s+/).filter(Boolean);
  const base = state.funds.filter(
    (fund) =>
      !(filters.hideStale && fund.stale) &&
      (!filters.currency || fund.currency === filters.currency) &&
      (!filters.manager || fund.manager_en === filters.manager) &&
      terms.every((term) => fund.searchText.includes(term)),
  );
  const rows = filters.categories.size ? base.filter((fund) => filters.categories.has(fund.category)) : base;
  return { base, rows: sortFunds(rows) };
}

function sortValue(fund, key) {
  switch (key) {
    case "name":
      return displayName(fund);
    case "manager":
      return managerName(fund);
    case "category":
    case "currency":
    case "nav":
    case "nav_date":
      return fund[key];
    default:
      return fund.returns[key];
  }
}

function sortFunds(funds) {
  const { key, dir } = state.sort;
  const sign = dir === "asc" ? 1 : -1;
  const collator = new Intl.Collator(state.lang, { sensitivity: "base", numeric: true });
  return [...funds].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    const aMissing = va == null || va === "";
    const bMissing = vb == null || vb === "";
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    const order = aMissing ? 0 : typeof va === "number" ? va - vb : collator.compare(va, vb);
    return order * sign || a.id - b.id;
  });
}

function renderTable() {
  const { base, rows } = visibleFunds();
  const counts = countBy(base, (fund) => fund.category);
  for (const chip of $("#categories").children) {
    const category = chip.dataset.category;
    const pressed = category ? state.filters.categories.has(category) : state.filters.categories.size === 0;
    chip.setAttribute("aria-pressed", String(pressed));
    chip.querySelector(".chip-count").textContent = category ? counts.get(category) || 0 : base.length;
  }

  const fragment = document.createDocumentFragment();
  for (const fund of rows) fragment.append(renderRow(fund));
  $("#rows").replaceChildren(fragment);
  $("#empty").hidden = rows.length > 0;

  const hidden = state.filters.hideStale ? state.funds.filter((fund) => fund.stale).length : 0;
  $("#count").textContent =
    `Showing ${rows.length} of ${state.funds.length} funds` + (hidden ? ` · ${hidden} inactive hidden` : "");
  for (const th of document.querySelectorAll(".funds th[data-key]")) {
    const active = th.dataset.key === state.sort.key;
    th.setAttribute("aria-sort", active ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none");
  }
}

function renderRow(fund) {
  const selected = state.compare.has(fund.id);
  const name = displayName(fund);
  const nameIsArabic = name === fund.name_ar;
  const alt = secondaryName(fund);
  return el("tr", { class: fund.stale ? "stale" : null, "data-id": fund.id },
    el("td", { class: "col-name" },
      el("div", { class: "name-cell" },
        el("input", {
          type: "checkbox",
          class: "compare-check",
          "data-id": fund.id,
          "aria-label": `Compare ${name}`,
          checked: selected,
          disabled: !selected && state.compare.size >= MAX_COMPARE,
        }),
        el("div", { class: "name-text" },
          el("a", { class: "fund-link", href: `#fund=${fund.id}`, dir: "auto", lang: nameIsArabic ? "ar" : null, text: name }),
          alt ? el("span", { class: "alt-name", dir: "auto", lang: nameIsArabic ? null : "ar", title: alt, text: alt }) : null,
          fund.stale ? el("span", { class: "badge", text: "Inactive" }) : null))),
    el("td", { text: fund.category }),
    el("td", { class: "col-manager", dir: "auto", text: managerName(fund) }),
    el("td", { text: fund.currency }),
    el("td", { class: "num", text: navFormat.format(fund.nav) }),
    el("td", { text: formatDay(toTime(fund.nav_date)) }),
    ...RETURN_KEYS.map((key) => returnCell(fund, key)));
}

function returnCell(fund, key) {
  const value = fund.returns[key];
  const fromMubasher = key === "YTD" && fund.ytd_source === "mubasher";
  return el("td", { class: `num ${value == null ? "missing" : signClass(value)}` },
    formatPct(value),
    fromMubasher ? el("span", { class: "flag", title: "Reported by Mubasher", text: "*" }) : null);
}

function onSortClick(event) {
  const th = event.target.closest("th[data-key]");
  if (!th) return;
  const key = th.dataset.key;
  if (state.sort.key === key) state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  else state.sort = { key, dir: TEXT_SORT_KEYS.has(key) ? "asc" : "desc" };
  renderTable();
}

function onCategoryClick(event) {
  const chip = event.target.closest("button[data-category]");
  if (!chip) return;
  const selected = state.filters.categories;
  const category = chip.dataset.category;
  if (!category) selected.clear();
  else if (selected.has(category)) selected.delete(category);
  else selected.add(category);
  renderTable();
}

function onRowClick(event) {
  if (event.target.closest("input, label")) return;
  if (event.target.closest("a") && (event.ctrlKey || event.metaKey || event.shiftKey)) return;
  const row = event.target.closest("tr[data-id]");
  if (!row) return;
  event.preventDefault();
  location.hash = viewHash({ type: "fund", ids: [Number(row.dataset.id)], period: DEFAULT_PERIOD });
}

function setLang(lang) {
  state.lang = lang;
  writePref("lang", lang);
  updateLangButtons();
  renderTable();
  updateCompareBar();
}

function updateLangButtons() {
  for (const button of document.querySelectorAll("[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === state.lang));
  }
}

/* ---------- Compare selection ---------- */

function onCompareToggle(event) {
  const box = event.target.closest("input.compare-check");
  if (!box) return;
  const id = Number(box.dataset.id);
  if (!box.checked) {
    state.compare.delete(id);
  } else if (state.compare.size < MAX_COMPARE) {
    // Each fund keeps its colour slot while selected, so removing one never recolours the others.
    const used = new Set(state.compare.values());
    let slot = 0;
    while (used.has(slot)) slot += 1;
    state.compare.set(id, slot);
  }
  syncCompare();
}

function syncCompare() {
  const full = state.compare.size >= MAX_COMPARE;
  for (const box of document.querySelectorAll("input.compare-check")) {
    const selected = state.compare.has(Number(box.dataset.id));
    box.checked = selected;
    box.disabled = full && !selected;
  }
  updateCompareBar();
}

function updateCompareBar() {
  const ids = compareIds();
  $("#compare-bar").hidden = ids.length === 0;
  document.body.classList.toggle("has-compare", ids.length > 0);
  $("#compare-list").replaceChildren(
    ...ids.map((id) =>
      el("span", { class: "compare-item" },
        el("span", { class: "line-key", style: `--key: var(--series-${state.compare.get(id) + 1})` }),
        el("span", { class: "compare-name", dir: "auto", text: displayName(state.byId.get(id)) }))),
  );
  $("#compare-hint").textContent =
    ids.length < 2 ? "Pick at least 2 funds" : ids.length >= MAX_COMPARE ? "Maximum reached" : "";
  const open = $("#compare-open");
  open.textContent = `Compare (${ids.length})`;
  open.disabled = ids.length < 2;
}

/* ---------- Panel & routing ---------- */

function parseHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const requested = params.get("p");
  const period = requested && Object.hasOwn(PERIODS, requested) ? requested : DEFAULT_PERIOD;
  const fundId = Number(params.get("fund"));
  if (state.byId.has(fundId)) return { type: "fund", ids: [fundId], period };
  const ids = [...new Set((params.get("compare") || "").split(",").map(Number))]
    .filter((id) => state.byId.has(id))
    .slice(0, MAX_COMPARE);
  return ids.length ? { type: "compare", ids, period } : null;
}

function applyHash() {
  const view = parseHash();
  if (!view) {
    closePanel();
    return;
  }
  if (view.type === "compare") {
    const unchanged = view.ids.length === state.compare.size && view.ids.every((id) => state.compare.has(id));
    if (!unchanged) state.compare = new Map(view.ids.map((id, slot) => [id, slot]));
    view.ids = compareIds();
    syncCompare();
  }
  openPanel(view);
}

async function openPanel(view) {
  state.view = view;
  const panel = $("#panel");
  if (!panel.open) {
    returnFocusTo = document.activeElement;
    panel.showModal();
  }
  renderPanelFrame(view);
  showChartMessage("Loading price history…");
  let series;
  try {
    series = await Promise.all(view.ids.map(loadHistory));
  } catch (error) {
    if (state.view === view) showChartMessage("Couldn't load the price history. Check your connection and try again.");
    console.error(error);
    return;
  }
  if (state.view !== view) return;
  showChartMessage("");
  drawView(view, series);
}

function closePanel() {
  state.view = null;
  lastRender = null;
  if (chart) {
    chart.destroy();
    chart = null;
  }
  $("#tooltip").hidden = true;
  const panel = $("#panel");
  if (panel.open) {
    panel.close();
    if (returnFocusTo?.isConnected) returnFocusTo.focus();
  }
  returnFocusTo = null;
}

function requestClose() {
  history.replaceState(null, "", location.pathname + location.search);
  closePanel();
}

function renderPanelFrame(view) {
  updatePeriodButtons(view.period);
  $("#table-view").open = false;
  $("#chart-caption").replaceChildren();
  $("#panel-legend").replaceChildren();
  if (view.type === "fund") {
    const fund = state.byId.get(view.ids[0]);
    $("#panel-title").textContent = displayName(fund);
    $("#panel-subtitle").textContent = secondaryName(fund);
    $("#panel-summary").replaceChildren(fundSummary(fund));
    $("#panel-about").replaceChildren(...fundAbout(fund));
  } else {
    $("#panel-title").textContent = "Compare funds";
    $("#panel-subtitle").textContent = "Growth of 100 invested at the start of the period";
    $("#panel-summary").replaceChildren();
    $("#panel-about").replaceChildren();
  }
}

function updatePeriodButtons(period) {
  for (const button of $("#periods").children) {
    button.setAttribute("aria-pressed", String(button.dataset.period === period));
  }
}

function fundSummary(fund) {
  return el("div", { class: "summary" },
    el("div", { class: "nav-block" },
      el("span", { class: "nav-value", text: `${navFormat.format(fund.nav)} ${fund.currency}` }),
      el("span", { class: "subtle", text: `NAV on ${formatDay(toTime(fund.nav_date))}${fund.stale ? " · inactive" : ""}` })),
    el("dl", { class: "returns-strip" },
      ...RETURN_KEYS.map((key) => {
        const value = fund.returns[key];
        const flagged = key === "YTD" && fund.ytd_source === "mubasher";
        return el("div", {},
          el("dt", { text: key }),
          el("dd", { class: signClass(value), text: `${formatPct(value)}${flagged ? "*" : ""}` }));
      })),
    el("p", { class: "meta-line", dir: "auto", text: [fund.category, fund.currency, managerName(fund)].filter(Boolean).join(" · ") }),
    fund.ytd_source === "mubasher"
      ? el("p", { class: "note", text: "* Year-to-date figure reported by Mubasher; the stored price history doesn't reach the start of the year." })
      : null,
    fund.splits?.length ? el("p", { class: "note", text: splitNote(fund) }) : null);
}

function fundAbout(fund) {
  const rows = [
    ["Manager", managerName(fund)],
    ["Owner", fund.owner_en],
    ["Price history", `Since ${formatDay(toTime(fund.history_start))} · ${fund.history_points.toLocaleString("en-US")} prices`],
  ];
  return [
    ...rows.filter(([, value]) => value).flatMap(([label, value]) => [el("dt", { text: label }), el("dd", { dir: "auto", text: value })]),
    el("dt", { text: "Source" }),
    el("dd", {}, el("a", { href: FUND_PAGE_URL + fund.id, target: "_blank", rel: "noopener", text: "Fund page on Mubasher" })),
  ];
}

function onPeriodClick(event) {
  const button = event.target.closest("button[data-period]");
  if (!button || !state.view || !lastRender) return;
  state.view.period = button.dataset.period;
  updatePeriodButtons(state.view.period);
  history.replaceState(null, "", `#${viewHash(state.view)}`);
  drawView(state.view, lastRender.series);
}

function onLegendClick(event) {
  const button = event.target.closest("[data-remove]");
  if (!button || !state.view) return;
  state.compare.delete(Number(button.dataset.remove));
  syncCompare();
  const ids = compareIds();
  if (!ids.length) {
    requestClose();
    return;
  }
  const view = { type: "compare", ids, period: state.view.period };
  history.replaceState(null, "", `#${viewHash(view)}`);
  $("#panel-close").focus();
  openPanel(view);
}

function showChartMessage(text) {
  const message = $("#chart-message");
  message.textContent = text;
  message.hidden = !text;
}

/* ---------- Price history ---------- */

function loadHistory(id) {
  if (!historyCache.has(id)) {
    const version = encodeURIComponent(state.data.generated_at);
    const request = fetch(`data/history/${id}.csv?v=${version}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for fund ${id}`);
        return response.text();
      })
      .then((text) => applySplits(parseHistory(text), state.byId.get(id).splits))
      .catch((error) => {
        historyCache.delete(id);
        throw error;
      });
    historyCache.set(id, request);
  }
  return historyCache.get(id);
}

function parseHistory(text) {
  const points = [];
  for (const line of text.split("\n").slice(1)) {
    const comma = line.indexOf(",");
    if (comma < 0) continue;
    const value = Number(line.slice(comma + 1));
    if (value > 0) points.push({ t: toTime(line.slice(0, comma)), v: value });
  }
  return points;
}

// Same adjustment the updater uses for returns: prices before a unit split are rescaled by its factor.
function applySplits(points, splits = []) {
  for (const { date, factor } of splits) {
    const splitTime = toTime(date);
    for (const point of points) if (point.t < splitTime) point.v /= factor;
  }
  return points;
}

function splitNote(fund) {
  const jumps = fund.splits.map(({ date, factor }) =>
    `${formatDay(toTime(date))} (${factor >= 1 ? "÷" : "×"}${factorFormat.format(factor >= 1 ? factor : 1 / factor)})`);
  return `Adjusted for price jumps in Mubasher's data that look like unit splits or glitches: ${jumps.join(", ")}. ` +
    "Earlier prices are rescaled so returns and charts stay continuous.";
}

function periodStart(period, lastTime) {
  const months = PERIODS[period];
  if (months === null) return -Infinity;
  const last = new Date(lastTime);
  const year = last.getUTCFullYear();
  if (months === "ytd") return Date.UTC(year - 1, 11, 31, 12);
  const monthIndex = last.getUTCMonth() - months;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Date.UTC(year, monthIndex, Math.min(last.getUTCDate(), daysInMonth), 12);
}

// Starts at the last price on or before the period start (the base the return is measured from).
function windowPoints(points, start) {
  let first = points.findIndex((point) => point.t >= start);
  if (first === -1) return [];
  if (first > 0 && start - points[first - 1].t <= GAP_MS) first -= 1;
  return points.slice(first);
}

// A null point makes Chart.js break the line instead of bridging a long stretch with no prices.
function withGaps(points) {
  const data = [];
  points.forEach((point, i) => {
    if (i > 0 && point.t - points[i - 1].t > GAP_MS) data.push({ x: points[i - 1].t + DAY_MS, y: null });
    data.push({ x: point.t, y: point.v });
  });
  return data;
}

/* ---------- Charts ---------- */

function drawView(view, series) {
  lastRender = { view, series };
  if (!window.Chart) {
    showChartMessage("The chart library didn't load. Check your connection and refresh the page.");
    return;
  }
  Chart.defaults.font.family = FONT;
  const colors = themeColors();
  if (view.type === "fund") drawFund(view, series[0], colors);
  else drawCompare(view, series, colors);
  renderTableView();
}

function drawFund(view, points, colors) {
  const fund = state.byId.get(view.ids[0]);
  const shown = windowPoints(points, periodStart(view.period, points.at(-1).t));
  const first = shown[0];
  const last = shown.at(-1);
  const change = shown.length > 1 ? last.v / first.v - 1 : null;
  $("#chart-caption").replaceChildren(
    el("strong", { class: signClass(change), text: formatPct(change) }),
    ` from ${formatDay(first.t)} to ${formatDay(last.t)}`,
  );
  renderChart(colors, {
    unit: TICK_UNITS[view.period],
    datasets: [lineDataset(displayName(fund), withGaps(shown), colors.series[0])],
    yTitle: `NAV (${fund.currency})`,
    format: (y) => navFormat.format(y),
    tableHeaders: [`NAV (${fund.currency})`],
    tableFormat: (y) => navFormat.format(y),
    label: `NAV of ${displayName(fund)} from ${formatDay(first.t)} to ${formatDay(last.t)}, change ${formatPct(change)}`,
  });
}

function drawCompare(view, seriesList, colors) {
  const end = Math.max(...seriesList.map((points) => points.at(-1).t));
  const start = periodStart(view.period, end);
  const windows = seriesList.map((points) => windowPoints(points, start));
  const times = [...new Set(windows.flat().map((point) => point.t))].sort((a, b) => a - b);
  // Align every fund on the same dates (carrying the last price forward) so the tooltip can list all funds at once.
  const datasets = view.ids.map((id, i) => {
    const shown = windows[i];
    let j = -1;
    const data = times.map((t) => {
      while (j + 1 < shown.length && shown[j + 1].t <= t) j += 1;
      const point = shown[j];
      return { x: t, y: point && t - point.t <= GAP_MS ? (point.v / shown[0].v) * 100 : null };
    });
    return lineDataset(displayName(state.byId.get(id)), data, colors.series[state.compare.get(id)]);
  });
  $("#chart-caption").textContent = times.length
    ? `${formatDay(times[0])} to ${formatDay(times.at(-1))}`
    : "No prices in this period";
  renderChart(colors, {
    unit: TICK_UNITS[view.period],
    datasets,
    yTitle: "Growth of 100",
    format: (y) => formatPct(y / 100 - 1),
    tableHeaders: datasets.map((dataset) => dataset.label),
    tableFormat: (y) => indexFormat.format(y),
    label: `Growth of 100 for ${datasets.map((dataset) => dataset.label).join(", ")}`,
  });
  renderCompareLegend(view, windows);
}

function lineDataset(label, data, color) {
  return { label, data, borderColor: color, backgroundColor: color, pointHoverBackgroundColor: color };
}

function renderCompareLegend(view, windows) {
  const rows = view.ids.map((id, i) => {
    const fund = state.byId.get(id);
    const shown = windows[i];
    const change = shown.length > 1 ? shown.at(-1).v / shown[0].v - 1 : null;
    return el("tr", {},
      el("td", {},
        el("span", { class: "name-with-key" },
          el("span", { class: "line-key", style: `--key: var(--series-${state.compare.get(id) + 1})` }),
          el("a", { href: `#fund=${id}`, dir: "auto", text: displayName(fund) }))),
      el("td", { class: `num ${signClass(change)}`, text: formatPct(change) }),
      el("td", { class: "num since", text: shown.length ? formatDay(shown[0].t) : "No data" }),
      el("td", { class: "num", text: `${navFormat.format(fund.nav)} ${fund.currency}` }),
      el("td", { class: "remove" },
        el("button", { type: "button", class: "icon-btn small", "data-remove": id, "aria-label": `Remove ${displayName(fund)}`, text: "×" })));
  });
  $("#panel-legend").replaceChildren(
    el("table", { class: "legend-table" },
      el("thead", {},
        el("tr", {},
          el("th", { scope: "col", text: "Fund" }),
          el("th", { scope: "col", class: "num", text: "Change" }),
          el("th", { scope: "col", class: "num since", text: "From" }),
          el("th", { scope: "col", class: "num", text: "Latest NAV" }),
          el("th", { scope: "col" }, el("span", { class: "sr-only", text: "Remove" })))),
      el("tbody", {}, ...rows)),
  );
}

function themeColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name) => style.getPropertyValue(name).trim();
  return {
    ink: read("--ink"),
    ink2: read("--ink-2"),
    grid: read("--grid"),
    axis: read("--axis"),
    surface: read("--surface"),
    crosshair: read("--crosshair"),
    series: [1, 2, 3, 4, 5].map((n) => read(`--series-${n}`)),
  };
}

function renderChart(colors, config) {
  const canvas = $("#chart");
  canvas.setAttribute("aria-label", config.label);
  if (chart) chart.destroy();
  $("#tooltip").hidden = true;
  chartConfig = config;
  chart = new Chart(canvas, {
    type: "line",
    data: { datasets: config.datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      normalized: true,
      spanGaps: false,
      layout: { padding: { top: 12, right: 76 } },
      interaction: { mode: "index", axis: "x", intersect: false },
      elements: {
        line: { borderWidth: 2, borderCapStyle: "round", borderJoinStyle: "round", tension: 0 },
        point: { radius: 0, hitRadius: 12, hoverRadius: 4, hoverBorderWidth: 2, hoverBorderColor: colors.surface },
      },
      scales: {
        x: {
          type: "time",
          time: {
            unit: config.unit,
            displayFormats: { week: "d MMM", month: "MMM yyyy", quarter: "MMM yyyy", year: "yyyy" },
          },
          grid: { display: false },
          border: { color: colors.axis },
          ticks: { color: colors.ink2, maxRotation: 0, autoSkipPadding: 24, font: { size: 11 } },
        },
        y: {
          grid: { color: colors.grid },
          border: { display: false },
          ticks: { color: colors.ink2, maxTicksLimit: 6, font: { size: 11 } },
          title: { display: true, text: config.yTitle, color: colors.ink2, font: { size: 11 } },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: renderTooltip },
        crosshair: { color: colors.crosshair },
        endLabels: { format: config.format, ink: colors.ink, surface: colors.surface },
      },
    },
    plugins: [crosshairPlugin, endLabelsPlugin],
  });
}

function renderTooltip({ chart: current, tooltip }) {
  const tip = $("#tooltip");
  const points = (tooltip.dataPoints || []).filter((point) => point.raw.y != null);
  if (tooltip.opacity === 0 || points.length === 0) {
    tip.hidden = true;
    return;
  }
  points.sort((a, b) => b.raw.y - a.raw.y);
  tip.replaceChildren(
    el("div", { class: "tt-date", text: formatDay(points[0].raw.x) }),
    ...points.map((point) =>
      el("div", { class: "tt-row" },
        el("span", { class: "line-key", style: `--key: ${point.dataset.borderColor}` }),
        el("strong", { text: chartConfig.format(point.raw.y) }),
        el("span", { class: "tt-name", dir: "auto", text: point.dataset.label }))),
  );
  tip.hidden = false;
  const offset = 14;
  const width = tip.offsetWidth;
  const height = tip.offsetHeight;
  let left = tooltip.caretX + offset;
  if (left + width > current.width) left = tooltip.caretX - offset - width;
  const top = Math.min(Math.max(tooltip.caretY - height / 2, 0), current.height - height);
  tip.style.transform = `translate(${Math.max(0, left)}px, ${Math.max(0, top)}px)`;
}

const crosshairPlugin = {
  id: "crosshair",
  beforeDatasetsDraw(current, _args, options) {
    const active = current.tooltip?.getActiveElements() ?? [];
    if (!active.length) return;
    const x = Math.round(active[0].element.x) + 0.5;
    const { top, bottom } = current.chartArea;
    const { ctx } = current;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = options.color;
    ctx.stroke();
    ctx.restore();
  },
};

// Marks each line's latest value with a dot; adds value labels only when they don't collide.
const endLabelsPlugin = {
  id: "endLabels",
  afterDatasetsDraw(current, _args, options) {
    const ends = [];
    current.data.datasets.forEach((dataset, i) => {
      for (let k = dataset.data.length - 1; k >= 0; k -= 1) {
        if (dataset.data[k].y == null) continue;
        const point = current.getDatasetMeta(i).data[k];
        ends.push({ x: point.x, y: point.y, color: dataset.borderColor, text: options.format(dataset.data[k].y) });
        break;
      }
    });
    const { ctx } = current;
    ctx.save();
    for (const end of ends) {
      ctx.beginPath();
      ctx.arc(end.x, end.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = options.surface;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = end.color;
      ctx.fill();
    }
    const byHeight = [...ends].sort((a, b) => a.y - b.y);
    const fits = ends.length <= 4 && byHeight.every((end, i) => i === 0 || end.y - byHeight[i - 1].y >= 16);
    if (fits) {
      ctx.font = `12px ${FONT}`;
      ctx.fillStyle = options.ink;
      ctx.textBaseline = "middle";
      for (const end of ends) ctx.fillText(end.text, end.x + 10, end.y);
    }
    ctx.restore();
  },
};

function renderTableView() {
  if (!$("#table-view").open || !chart || !chartConfig) return;
  const { datasets } = chart.data;
  const rows = [];
  for (let k = datasets[0].data.length - 1; k >= 0; k -= 1) {
    const values = datasets.map((dataset) => dataset.data[k].y);
    if (values.every((value) => value == null)) continue;
    rows.push(el("tr", {},
      el("th", { scope: "row", text: formatDay(datasets[0].data[k].x) }),
      ...values.map((value) => el("td", { class: "num", text: value == null ? "—" : chartConfig.tableFormat(value) }))));
  }
  $("#table-view-body").replaceChildren(
    el("table", { class: "data-table" },
      el("thead", {},
        el("tr", {},
          el("th", { scope: "col", text: "Date" }),
          ...chartConfig.tableHeaders.map((header) => el("th", { scope: "col", class: "num", dir: "auto", text: header })))),
      el("tbody", {}, ...rows)),
  );
}

init();
