import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

_DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def _load(filename: str) -> dict[str, str]:
    path = _DATA_DIR / filename
    try:
        rows = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"code_lookup: failed to load {path.name}: {e}")
        return {}
    table = {}
    for row in rows:
        code = (row.get("code") or "").strip()
        desc = (row.get("description") or "").strip()
        if code:
            table[code.upper()] = desc
    return table


_ICD10 = _load("icd10.json")
_CPT = _load("cpt.json")


def _lookup(table: dict[str, str], code) -> str | None:
    if not code:
        return None
    key = str(code).strip().upper()
    if not key:
        return None
    return table.get(key)


def describe_diagnosis(code) -> str | None:
    return _lookup(_ICD10, code)


def describe_procedure(code) -> str | None:
    return _lookup(_CPT, code)


def format_code_with_description(code, description: str | None) -> str:
    if not code:
        return "Unknown"
    if description:
        return f"{code} — {description}"
    return f"{code} (description not in local catalogue; rely on the clinical document)"
