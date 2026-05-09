"""One-shot converter: frontend/src/data/{cpt,icd10}.ts -> backend/data/{cpt,icd10}.json.

Run from the repo root after the frontend lookup tables change:
    python backend/data/_convert_lookup.py
"""
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_DATA = REPO_ROOT / "frontend" / "src" / "data"
BACKEND_DATA = REPO_ROOT / "backend" / "data"

ENTRY_RE = re.compile(
    r'\{\s*code:\s*"([^"]+)"\s*,\s*'
    r'description:\s*"((?:[^"\\]|\\.)*)"\s*,\s*'
    r'category:\s*"((?:[^"\\]|\\.)*)"\s*\}',
    re.DOTALL,
)


def parse_ts(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8")
    return [
        {
            "code": m.group(1),
            "description": bytes(m.group(2), "utf-8").decode("unicode_escape"),
            "category": bytes(m.group(3), "utf-8").decode("unicode_escape"),
        }
        for m in ENTRY_RE.finditer(text)
    ]


def main() -> None:
    for name in ("cpt", "icd10"):
        src = FRONTEND_DATA / f"{name}.ts"
        dst = BACKEND_DATA / f"{name}.json"
        rows = parse_ts(src)
        dst.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{src.name}: {len(rows):>4} entries -> {dst.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
