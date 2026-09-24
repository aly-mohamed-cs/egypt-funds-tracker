import argparse
from datetime import date, datetime, timezone

import requests

from tracker import mubasher, store
from tracker.http import PoliteSession, UnexpectedResponseError
from tracker.returns import compute_returns, detect_splits, split_adjusted

MIN_FUNDS = 100
STALE_AFTER_DAYS = 30
FRIDAY = 4
# Mubasher doesn't adjust for unit splits, so a YTD outside this band almost always means one.
PLAUSIBLE_MUBASHER_YTD = (-0.5, 2.0)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Update Egyptian mutual fund data from Mubasher Info.")
    parser.add_argument("--full", action="store_true",
                        help="refresh Arabic names and categories even if today isn't Friday")
    parser.add_argument("--backfill", nargs="+", metavar="ID",
                        help="re-import price history for these fund ids ('all' for every listed fund)")
    args = parser.parse_args(argv)

    session = PoliteSession()
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    history_dir = store.DATA_DIR / "history"
    meta_path = store.DATA_DIR / "meta.json"

    listed = mubasher.fetch_fund_list(session, "en")
    if len(listed) < MIN_FUNDS:
        raise SystemExit(f"Mubasher returned only {len(listed)} funds (expected at least {MIN_FUNDS}); nothing was updated.")

    meta = store.load_json(meta_path, {})
    new_ids = [row["fundId"] for row in listed if str(row["fundId"]) not in meta]
    for row in listed:
        info = meta.setdefault(str(row["fundId"]), {"first_seen": today})
        info.update(
            name_en=mubasher.clean(row["name"]),
            manager_en=_join(row.get("managers")),
            owner_en=mubasher.clean(row.get("owner")),
            last_seen=today,
        )

    refresh = args.full or now.weekday() == FRIDAY or bool(new_ids)
    if refresh:
        _refresh_names_and_categories(session, meta, listed)
    for info in meta.values():
        info["currency"] = mubasher.detect_currency(info.get("name_en"), info.get("name_ar"))

    if args.backfill == ["all"]:
        backfill_ids = [row["fundId"] for row in listed]
    else:
        backfill_ids = sorted(set(new_ids) | {int(i) for i in args.backfill or []})
    imported_count, missing, failed = 0, [], []
    for n, fund_id in enumerate(backfill_ids, start=1):
        progress = f"[{n}/{len(backfill_ids)}] fund {fund_id}:"
        try:
            imported = mubasher.fetch_history(session, fund_id)
        except (requests.RequestException, UnexpectedResponseError) as exc:
            failed.append(fund_id)
            print(f"{progress} history download failed ({exc})", flush=True)
            continue
        if not imported:
            missing.append(fund_id)
            print(f"{progress} no history file", flush=True)
            continue
        print(f"{progress} {len(imported)} history rows", flush=True)
        path = history_dir / f"{fund_id}.csv"
        existing = store.read_history(path)
        store.write_history(path, {**imported, **existing})
        imported_count += 1

    snapshots = 0
    for row in listed:
        nav_date = mubasher.parse_list_date(row.get("date"))
        price = row.get("price") or 0
        if nav_date is None or price <= 0:
            continue
        path = history_dir / f"{row['fundId']}.csv"
        history = store.read_history(path)
        if history.get(nav_date.isoformat()) != price:
            history[nav_date.isoformat()] = float(price)
            store.write_history(path, history)
            snapshots += 1

    histories = {int(key): store.read_history(history_dir / f"{key}.csv") for key in meta}
    store.save_json(meta_path, dict(sorted(meta.items(), key=lambda item: int(item[0]))))
    store.save_json(store.DATA_DIR / "funds.json", build_payload(meta, histories, listed, now))

    print(f"Funds listed: {len(listed)} ({len(new_ids)} new)")
    print(f"Names and categories refreshed: {'yes' if refresh else 'no'}")
    if backfill_ids:
        print(f"History imported: {imported_count} funds, {len(missing)} without a history file, "
              f"{len(failed)} failed{f' {failed}' if failed else ''}")
    print(f"New NAV values saved: {snapshots}")
    print(f"Requests made: {session.request_count}")


def build_payload(meta: dict, histories: dict[int, dict[str, float]], listed: list[dict], now: datetime) -> dict:
    mubasher_ytd = {row["fundId"]: mubasher.parse_percent(row.get("profitYearStart")) for row in listed}
    funds = []
    for key, info in meta.items():
        fund_id = int(key)
        history = histories.get(fund_id)
        if not history:
            continue
        dates = sorted(history)
        splits = detect_splits(history)
        returns = compute_returns(split_adjusted(history, splits))
        ytd_source = "computed" if returns["YTD"] is not None else None
        fallback = mubasher_ytd.get(fund_id)
        low, high = PLAUSIBLE_MUBASHER_YTD
        if ytd_source is None and fallback is not None and low < fallback < high:
            returns["YTD"] = fallback
            ytd_source = "mubasher"
        funds.append({
            "id": fund_id,
            "name_en": info.get("name_en", ""),
            "name_ar": info.get("name_ar", ""),
            "manager_en": info.get("manager_en", ""),
            "manager_ar": info.get("manager_ar", ""),
            "owner_en": info.get("owner_en", ""),
            "category": info.get("category", "Other"),
            "currency": info.get("currency", "EGP"),
            "nav": history[dates[-1]],
            "nav_date": dates[-1],
            "returns": returns,
            "ytd_source": ytd_source,
            "history_start": dates[0],
            "history_points": len(dates),
            "splits": [{"date": day, "factor": float(f"{factor:.6g}")} for day, factor in splits],
        })
    latest = max((fund["nav_date"] for fund in funds), default=None)
    for fund in funds:
        age = (date.fromisoformat(latest) - date.fromisoformat(fund["nav_date"])).days
        fund["stale"] = age > STALE_AFTER_DAYS
    funds.sort(key=lambda fund: fund["id"])
    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "latest_nav_date": latest,
        "source": {"name": "Mubasher Info", "url": mubasher.FUNDS_PAGE},
        "funds": funds,
    }


def _refresh_names_and_categories(session: PoliteSession, meta: dict, listed: list[dict]) -> None:
    for row in mubasher.fetch_fund_list(session, "ar"):
        info = meta.get(str(row["fundId"]))
        if info is not None:
            info.update(name_ar=mubasher.clean(row["name"]), manager_ar=_join(row.get("managers")))
    category_of = {}
    for class_id, label in mubasher.CATEGORIES.items():
        members = mubasher.fetch_category_members(session, class_id)
        if len(members) >= len(listed):
            raise SystemExit(f"Category filter {class_id} returned every fund; Mubasher's API may have changed.")
        category_of.update(dict.fromkeys(members, label))
    for row in listed:
        meta[str(row["fundId"])]["category"] = category_of.get(row["fundId"], "Other")


def _join(names: list[str] | None) -> str:
    return ", ".join(mubasher.clean(name) for name in names or [])


if __name__ == "__main__":
    main()
