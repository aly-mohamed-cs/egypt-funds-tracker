from datetime import date

import pytest

from tracker.returns import compute_returns, detect_splits, shift_months, split_adjusted


def test_shift_months_clamps_to_month_end():
    assert shift_months(date(2026, 3, 31), -1) == date(2026, 2, 28)
    assert shift_months(date(2026, 1, 15), -1) == date(2025, 12, 15)
    assert shift_months(date(2026, 9, 20), -12) == date(2025, 9, 20)


def test_returns_use_last_nav_on_or_before_each_target():
    history = {
        "2025-09-20": 95.0,
        "2025-12-31": 100.0,
        "2026-06-18": 105.0,
        "2026-08-20": 108.0,
        "2026-09-13": 109.0,
        "2026-09-20": 110.0,
    }
    assert compute_returns(history) == {
        "1W": round(110 / 109 - 1, 6),
        "1M": round(110 / 108 - 1, 6),
        "3M": round(110 / 105 - 1, 6),
        "YTD": 0.1,
        "1Y": round(110 / 95 - 1, 6),
    }


def test_returns_are_none_across_a_gap_in_history():
    history = {"2025-05-14": 16.15, "2026-09-20": 21.17}
    assert compute_returns(history) == {"1W": None, "1M": None, "3M": None, "YTD": None, "1Y": None}


def test_ytd_requires_a_nav_from_late_december():
    assert compute_returns({"2025-12-15": 10.0, "2026-03-01": 11.0})["YTD"] == 0.1
    assert compute_returns({"2025-12-01": 10.0, "2026-03-01": 11.0})["YTD"] is None


def test_empty_history():
    assert compute_returns({}) == {"1W": None, "1M": None, "3M": None, "YTD": None, "1Y": None}


def test_detect_splits_flags_big_jumps_between_nearby_prices():
    history = {"2025-11-25": 2512.99, "2025-11-26": 25.0894, "2025-12-01": 25.3, "2026-01-05": 24.0}
    assert detect_splits(history) == [("2025-11-26", pytest.approx(100.162, abs=0.001))]
    assert detect_splits({"2025-11-25": 617.43, "2025-11-26": 15.37875}) == [("2025-11-26", pytest.approx(40.148, abs=0.001))]
    assert detect_splits({"2026-01-01": 10.0, "2026-01-02": 101.0}) == [("2026-01-02", pytest.approx(0.0990099))]


def test_detect_splits_ignores_real_moves_and_far_apart_prices():
    assert detect_splits({"2026-01-01": 10.0, "2026-01-02": 7.0, "2026-01-03": 7.2}) == []
    assert detect_splits({"2024-01-01": 10.0, "2025-06-01": 30.0}) == []


def test_split_adjusted_scales_prices_before_the_split():
    history = {"2025-11-25": 2512.99, "2025-11-26": 25.0894}
    assert split_adjusted(history, [("2025-11-26", 100)]) == pytest.approx({"2025-11-25": 25.1299, "2025-11-26": 25.0894})
