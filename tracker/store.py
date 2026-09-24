import csv
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "site" / "data"


def load_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")


def read_history(path: Path) -> dict[str, float]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8", newline="") as fh:
        return {row["date"]: float(row["nav"]) for row in csv.DictReader(fh)}


def write_history(path: Path, rows: dict[str, float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = ["date,nav", *(f"{day},{rows[day]!r}" for day in sorted(rows))]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
