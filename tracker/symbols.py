import requests

from tracker import store
from tracker.http import PoliteSession, UnexpectedResponseError
from tracker.mubasher import clean

SCAN_URL = "https://scanner.tradingview.com/{screener}/scan"
LIST_DIR = store.DATA_DIR / "symbols"

EGYPT_QUERY = {"columns": ["name", "description"], "range": [0, 2000], "sort": {"sortBy": "name", "sortOrder": "asc"}}
EGYPT_INDICES = [
    {"symbol": "EGX:EGX30", "name": "EGX 30 Index"},
    {"symbol": "EGX:EGX70EWI", "name": "EGX 70 EWI Index"},
    {"symbol": "EGX:EGX100EWI", "name": "EGX 100 EWI Index"},
]
MIN_EGYPT_STOCKS = 150

US_LISTINGS = [{"left": "exchange", "operation": "in_range", "right": ["NASDAQ", "NYSE", "AMEX"]}]
US_STOCK_QUERY = {
    "columns": ["name", "description", "subtype"],
    "filter": [
        *US_LISTINGS,
        {"left": "type", "operation": "in_range", "right": ["stock", "dr"]},
        {"left": "subtype", "operation": "nequal", "right": "preferred"},
    ],
    "sort": {"sortBy": "market_cap_basic", "sortOrder": "desc"},
    "range": [0, 2000],
}
US_ETF_QUERY = {
    "columns": ["name", "description", "subtype"],
    "filter": [
        *US_LISTINGS,
        {"left": "type", "operation": "equal", "right": "fund"},
        {"left": "subtype", "operation": "equal", "right": "etf"},
    ],
    "sort": {"sortBy": "aum", "sortOrder": "desc"},
    "range": [0, 200],
}
# The official index feeds aren't available in TradingView's free widgets; FOREX.com's index CFDs are.
US_INDICES = [
    {"symbol": "FOREXCOM:SPXUSD", "name": "S&P 500 Index (CFD)"},
    {"symbol": "FOREXCOM:NSXUSD", "name": "Nasdaq 100 Index (CFD)"},
    {"symbol": "FOREXCOM:DJI", "name": "Dow Jones Industrial Average (CFD)"},
]
MIN_US_STOCKS = 1500
MIN_US_ETFS = 100

CRYPTO_QUERY = {
    "columns": ["name", "description", "base_currency", "crypto_common_categories"],
    "sort": {"sortBy": "market_cap_calc", "sortOrder": "desc"},
    "range": [0, 300],
}
CRYPTO_COINS = 200
# Stablecoins and wrapped or staked tokens only mirror another asset's price.
MIRROR_CATEGORIES = {"stablecoins", "wrapped-tokens", "rehypothecated-crypto"}
CRYPTO_INDICES = [
    {"symbol": "CRYPTOCAP:TOTAL", "name": "Total crypto market cap"},
    {"symbol": "CRYPTOCAP:BTC.D", "name": "Bitcoin dominance"},
]
MIN_CRYPTO_COINS = 100


def _entry(row: dict) -> dict:
    return {"symbol": row["s"], "name": clean(row["d"][1])}


def by_ticker(entries: list[dict]) -> list[dict]:
    return sorted(entries, key=lambda entry: (entry["symbol"].split(":", 1)[1], entry["symbol"]))


def parse_egypt(data: dict) -> list[dict]:
    return [_entry(row) for row in data["data"] if row["s"].startswith("EGX:")]


def parse_us(data: dict) -> list[dict]:
    return [_entry(row) for row in data["data"] if row["d"][2] != "preferred"]


def parse_crypto(data: dict) -> list[dict]:
    coins = [
        {**_entry(row), "code": row["d"][2]}
        for row in data["data"]
        if not MIRROR_CATEGORIES.intersection(row["d"][3] or [])
    ]
    return coins[:CRYPTO_COINS]


def _require(count: int, minimum: int, what: str) -> None:
    if count < minimum:
        raise UnexpectedResponseError(f"TradingView returned only {count} {what} (expected at least {minimum})")


def fetch_egypt(session: PoliteSession) -> list[dict]:
    stocks = parse_egypt(session.post_json(SCAN_URL.format(screener="egypt"), EGYPT_QUERY))
    _require(len(stocks), MIN_EGYPT_STOCKS, "EGX stocks")
    return EGYPT_INDICES + by_ticker(stocks)


def fetch_us(session: PoliteSession) -> list[dict]:
    url = SCAN_URL.format(screener="america")
    stocks = parse_us(session.post_json(url, US_STOCK_QUERY))
    etfs = parse_us(session.post_json(url, US_ETF_QUERY))
    _require(len(stocks), MIN_US_STOCKS, "US stocks")
    _require(len(etfs), MIN_US_ETFS, "US ETFs")
    return US_INDICES + by_ticker(stocks + etfs)


def fetch_crypto(session: PoliteSession) -> list[dict]:
    coins = parse_crypto(session.post_json(SCAN_URL.format(screener="coin"), CRYPTO_QUERY))
    _require(len(coins), MIN_CRYPTO_COINS, "coins")
    return CRYPTO_INDICES + by_ticker(coins)


FETCHERS = {"egypt": fetch_egypt, "us": fetch_us, "crypto": fetch_crypto}


def main() -> None:
    session = PoliteSession()
    failed = []
    for market, fetch in FETCHERS.items():
        try:
            entries = fetch(session)
        # Network errors, blocked requests, or a changed response format.
        except (requests.RequestException, UnexpectedResponseError, KeyError, IndexError, TypeError) as exc:
            print(f"{market}: list not updated ({exc})")
            failed.append(market)
            continue
        store.save_json(LIST_DIR / f"{market}.json", entries)
        print(f"{market}: {len(entries)} symbols saved")
    if failed:
        raise SystemExit(f"Symbol lists not updated: {', '.join(failed)}. The previous lists were kept.")


if __name__ == "__main__":
    main()
