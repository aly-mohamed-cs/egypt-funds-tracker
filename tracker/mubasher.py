import re
from datetime import date

from tracker.http import PoliteSession

EN_BASE = "https://english.mubasher.info"
AR_BASE = "https://www.mubasher.info"
FUNDS_PAGE = f"{EN_BASE}/countries/eg/funds"
HISTORY_URL = "https://static.mubasher.info/File.MubasherCharts/File.Mutual_Fund_Charts_Dir/priceChartFund_{fund_id}.csv"

CATEGORIES = {
    2: "Balanced",
    3: "Bonds",
    4: "Capital Guaranteed",
    5: "Capital Protection",
    6: "Fixed Income",
    7: "Fund of Funds",
    8: "Hedge",
    9: "Index",
    10: "IPO",
    11: "Money Market",
    12: "Real Estate",
    13: "Sectors",
    14: "Equity",
    15: "Sukuk",
    16: "Trade Finance",
    18: "Commodities",
}

_MONTHS = {
    name: number
    for number, name in enumerate(
        ("january", "february", "march", "april", "may", "june",
         "july", "august", "september", "october", "november", "december"),
        start=1,
    )
}
_USD = re.compile(r"\bUSD\b|dollar|دولار", re.IGNORECASE)


def clean(text: str | None) -> str:
    return " ".join((text or "").split())


def parse_list_date(text: str | None) -> date | None:
    parts = clean(text).split(" ")
    if len(parts) != 3 or parts[1].lower() not in _MONTHS:
        return None
    try:
        return date(int(parts[2]), _MONTHS[parts[1].lower()], int(parts[0]))
    except ValueError:
        return None


def parse_percent(text: str | None) -> float | None:
    try:
        value = float(clean(text).rstrip("%"))
    except ValueError:
        return None
    # Mubasher reports "0.00%" when the figure is not available.
    return round(value / 100, 6) if value else None


def parse_history_csv(text: str) -> dict[str, float]:
    rows = {}
    for line in text.splitlines():
        stamp, _, value = line.strip().partition(",")
        try:
            day = date.fromisoformat(stamp[:10].replace("/", "-"))
            nav = float(value)
        except ValueError:
            continue
        if nav > 0:
            rows[day.isoformat()] = nav
    return rows


def detect_currency(*names: str | None) -> str:
    return "USD" if any(_USD.search(name or "") for name in names) else "EGP"


def fetch_fund_list(session: PoliteSession, lang: str) -> list[dict]:
    return _fetch_rows(session, EN_BASE if lang == "en" else AR_BASE)


def fetch_category_members(session: PoliteSession, class_id: int) -> set[int]:
    return {row["fundId"] for row in _fetch_rows(session, EN_BASE, classification=class_id)}


def fetch_history(session: PoliteSession, fund_id: int) -> dict[str, float] | None:
    text = session.get_text(HISTORY_URL.format(fund_id=fund_id))
    return None if text is None else parse_history_csv(text)


def _fetch_rows(session: PoliteSession, base: str, **filters) -> list[dict]:
    data = session.get_json(f"{base}/api/1/funds", params={"country": "eg", "size": 1000, **filters})
    if data.get("numberOfPages", 1) > 1:
        raise ValueError("Mubasher split the fund list into several pages; paging is not implemented.")
    return data["rows"]
