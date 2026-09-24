from datetime import datetime, timezone

from tracker.update import build_payload

NOW = datetime(2026, 9, 24, 18, 0, tzinfo=timezone.utc)


def test_build_payload_marks_stale_funds_and_falls_back_to_mubasher_ytd():
    meta = {
        "1": {"name_en": "Fresh Fund", "category": "Equity", "currency": "EGP"},
        "2": {"name_en": "Old Fund", "category": "Money Market", "currency": "USD"},
        "3": {"name_en": "Fund Without Prices"},
    }
    histories = {
        1: {"2026-09-01": 10.0, "2026-09-20": 11.0},
        2: {"2026-08-01": 1.5},
        3: {},
    }
    listed = [
        {"fundId": 1, "profitYearStart": "12.50%"},
        {"fundId": 2, "profitYearStart": "0.00%"},
    ]

    payload = build_payload(meta, histories, listed, NOW)

    assert payload["generated_at"] == "2026-09-24T18:00:00+00:00"
    assert payload["latest_nav_date"] == "2026-09-20"
    funds = {fund["id"]: fund for fund in payload["funds"]}
    assert set(funds) == {1, 2}
    assert funds[1]["nav"] == 11.0
    assert funds[1]["history_points"] == 2
    assert funds[1]["stale"] is False
    assert funds[1]["returns"]["YTD"] == 0.125
    assert funds[1]["ytd_source"] == "mubasher"
    assert funds[2]["stale"] is True
    assert funds[2]["returns"]["YTD"] is None
    assert funds[2]["ytd_source"] is None


def test_build_payload_adjusts_for_unit_splits_and_ignores_implausible_mubasher_ytd():
    meta = {"7": {"name_en": "Split Fund"}}
    histories = {7: {"2026-08-20": 2500.0, "2026-09-01": 25.5, "2026-09-20": 26.0}}
    listed = [{"fundId": 7, "profitYearStart": "-89.68%"}]

    fund = build_payload(meta, histories, listed, NOW)["funds"][0]

    assert fund["splits"] == [{"date": "2026-09-01", "factor": 98.0392}]
    assert fund["nav"] == 26.0
    assert fund["returns"]["1M"] == round(26 / 25.5 - 1, 6)
    assert fund["returns"]["YTD"] is None
    assert fund["ytd_source"] is None
