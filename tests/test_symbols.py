import json

import pytest

from tracker import symbols
from tracker.http import UnexpectedResponseError
from tracker.symbols import by_ticker, parse_crypto, parse_egypt, parse_us


def test_parse_egypt_keeps_egx_stocks_with_clean_names():
    data = {
        "totalCount": 3,
        "data": [
            {"s": "EGX:COMI", "d": ["COMI", "Commercial International Bank  - Egypt (CIB) S.A.E."]},
            {"s": "EGX:ABUK", "d": ["ABUK", "Abou Kir Fertilizers & Chemical Industries Co."]},
            {"s": "OTHER:XYZ", "d": ["XYZ", "Not listed on EGX"]},
        ],
    }
    assert parse_egypt(data) == [
        {"symbol": "EGX:COMI", "name": "Commercial International Bank - Egypt (CIB) S.A.E."},
        {"symbol": "EGX:ABUK", "name": "Abou Kir Fertilizers & Chemical Industries Co."},
    ]


def test_parse_us_skips_preferred_shares():
    data = {
        "data": [
            {"s": "NASDAQ:AAPL", "d": ["AAPL", "Apple Inc.", "common"]},
            {"s": "NYSE:BAC/PL", "d": ["BAC/PL", "Bank of America Corporation Preferred", "preferred"]},
            {"s": "NYSE:BABA", "d": ["BABA", "Alibaba Group Holding Limited", ""]},
        ],
    }
    assert [entry["symbol"] for entry in parse_us(data)] == ["NASDAQ:AAPL", "NYSE:BABA"]


def test_parse_crypto_skips_coins_that_mirror_another_price():
    data = {
        "data": [
            {"s": "CRYPTO:BTCUSD", "d": ["BTCUSD", "Bitcoin", "BTC", ["cryptocurrencies", "layer-1"]]},
            {"s": "CRYPTO:USDTUSD", "d": ["USDTUSD", "Tether USDt", "USDT", ["stablecoins", "fiat-stablecoins"]]},
            {"s": "CRYPTO:WBTCUSD", "d": ["WBTCUSD", "Wrapped Bitcoin", "WBTC", ["wrapped-tokens"]]},
            {"s": "CRYPTO:HYPEHUSD", "d": ["HYPEHUSD", "Hyperliquid", "HYPE", None]},
        ],
    }
    assert parse_crypto(data) == [
        {"symbol": "CRYPTO:BTCUSD", "name": "Bitcoin", "code": "BTC"},
        {"symbol": "CRYPTO:HYPEHUSD", "name": "Hyperliquid", "code": "HYPE"},
    ]


def test_by_ticker_sorts_across_exchanges():
    entries = [{"symbol": "NYSE:BABA"}, {"symbol": "AMEX:SPY"}, {"symbol": "NASDAQ:AAPL"}]
    assert [entry["symbol"] for entry in by_ticker(entries)] == ["NASDAQ:AAPL", "NYSE:BABA", "AMEX:SPY"]


def test_main_saves_the_lists_that_succeed(tmp_path, monkeypatch):
    def blocked(session):
        raise UnexpectedResponseError("HTTP 403")

    monkeypatch.setattr(symbols, "LIST_DIR", tmp_path)
    monkeypatch.setattr(symbols, "FETCHERS", {"egypt": lambda session: [{"symbol": "EGX:COMI", "name": "CIB"}], "us": blocked})
    with pytest.raises(SystemExit, match="us"):
        symbols.main()
    assert json.loads((tmp_path / "egypt.json").read_text(encoding="utf-8")) == [{"symbol": "EGX:COMI", "name": "CIB"}]
    assert not (tmp_path / "us.json").exists()
