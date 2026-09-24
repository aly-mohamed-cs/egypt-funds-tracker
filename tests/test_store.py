from tracker.store import load_json, read_history, save_json, write_history


def test_history_round_trip_is_sorted_with_lf_endings(tmp_path):
    path = tmp_path / "history" / "1.csv"
    write_history(path, {"2026-09-20": 21.17115, "2026-01-02": 18.5})
    assert path.read_bytes() == b"date,nav\n2026-01-02,18.5\n2026-09-20,21.17115\n"
    assert read_history(path) == {"2026-01-02": 18.5, "2026-09-20": 21.17115}


def test_missing_files_return_defaults(tmp_path):
    assert read_history(tmp_path / "missing.csv") == {}
    assert load_json(tmp_path / "missing.json", {}) == {}


def test_json_keeps_arabic_readable(tmp_path):
    path = tmp_path / "meta.json"
    save_json(path, {"1": {"name_ar": "صندوق"}})
    assert "صندوق" in path.read_text(encoding="utf-8")
    assert load_json(path, {}) == {"1": {"name_ar": "صندوق"}}
