import bisect
import calendar
from datetime import date, timedelta

LABELS = ("1W", "1M", "3M", "YTD", "1Y")
SPLIT_RATIO = 1.9
SPLIT_MAX_GAP_DAYS = 45
# label: (months back, days back, how many days before the target date the base NAV may be)
WINDOWS = {
    "1W": (0, 7, 7),
    "1M": (1, 0, 10),
    "3M": (3, 0, 15),
    "1Y": (12, 0, 30),
}
YTD_TOLERANCE_DAYS = 19  # base NAV must be from Dec 12-31 of the previous year


def shift_months(day: date, months: int) -> date:
    year, month_index = divmod(day.month - 1 + months, 12)
    year += day.year
    month = month_index + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def detect_splits(history: dict[str, float]) -> list[tuple[str, float]]:
    # No fund really moves ~2x between two nearby prices; such jumps (e.g. 2512.99 -> 25.09)
    # are unit splits or glitches in the source data. Far-apart prices may reflect genuine growth.
    dates = sorted(history)
    splits = []
    for before, after in zip(dates, dates[1:]):
        ratio = history[before] / history[after]
        nearby = (date.fromisoformat(after) - date.fromisoformat(before)).days <= SPLIT_MAX_GAP_DAYS
        if nearby and not 1 / SPLIT_RATIO < ratio < SPLIT_RATIO:
            splits.append((after, ratio))
    return splits


def split_adjusted(history: dict[str, float], splits: list[tuple[str, float]]) -> dict[str, float]:
    adjusted = dict(history)
    for split_date, factor in splits:
        for day in adjusted:
            if day < split_date:
                adjusted[day] /= factor
    return adjusted


def compute_returns(history: dict[str, float]) -> dict[str, float | None]:
    returns = dict.fromkeys(LABELS)
    if not history:
        return returns
    dates = sorted(history)
    as_of = date.fromisoformat(dates[-1])
    latest = history[dates[-1]]

    def change_since(target: date, tolerance_days: int) -> float | None:
        i = bisect.bisect_right(dates, target.isoformat()) - 1
        if i < 0 or dates[i] < (target - timedelta(days=tolerance_days)).isoformat():
            return None
        return round(latest / history[dates[i]] - 1, 6)

    for label, (months, days, tolerance) in WINDOWS.items():
        returns[label] = change_since(shift_months(as_of, -months) - timedelta(days=days), tolerance)
    returns["YTD"] = change_since(date(as_of.year - 1, 12, 31), YTD_TOLERANCE_DAYS)
    return returns
