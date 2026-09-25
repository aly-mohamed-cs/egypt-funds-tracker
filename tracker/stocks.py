from tracker import store
from tracker.http import PoliteSession
from tracker.mubasher import clean

SCAN_URL = "https://scanner.tradingview.com/egypt/scan"
SCAN_QUERY = {"columns": ["name", "description"], "range": [0, 2000], "sort": {"sortBy": "name", "sortOrder": "asc"}}
INDICES = [
    {"symbol": "EGX:EGX30", "name": "EGX 30 Index"},
    {"symbol": "EGX:EGX70EWI", "name": "EGX 70 EWI Index"},
    {"symbol": "EGX:EGX100EWI", "name": "EGX 100 EWI Index"},
]
MIN_STOCKS = 150


def parse_scan(data: dict) -> list[dict]:
    stocks = [{"symbol": row["s"], "name": clean(row["d"][1])} for row in data["data"] if row["s"].startswith("EGX:")]
    return sorted(stocks, key=lambda stock: stock["symbol"])


def main() -> None:
    stocks = parse_scan(PoliteSession().post_json(SCAN_URL, SCAN_QUERY))
    if len(stocks) < MIN_STOCKS:
        raise SystemExit(f"TradingView returned only {len(stocks)} EGX stocks (expected at least {MIN_STOCKS}); list not updated.")
    store.save_json(store.DATA_DIR / "egx-stocks.json", INDICES + stocks)
    print(f"EGX symbols saved: {len(stocks)} stocks and {len(INDICES)} indices")


if __name__ == "__main__":
    main()
