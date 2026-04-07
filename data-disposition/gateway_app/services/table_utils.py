# gateway_app/services/table_utils.py
import re
from typing import Any, Dict, List, Optional, Tuple

MAX_ROWS_KEEP = 5000  # safeguard for state

def extract_rows_from_payload(payload: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
    """
    Try to normalize a tool result payload into list[dict] rows.
    Expected payload shape from registry.call_tool:
      { is_error, data, structured_content, text }
    Returns None if nothing tabular is found.
    """
    if not payload or payload.get("is_error"):
        return None

    # 0) Check the payload itself for columnar format (e.g. Snowflake results)
    rows = _as_rows(payload)
    if rows:
        return rows[:MAX_ROWS_KEEP]

    # 1) Direct list[dict]
    data = payload.get("data")
    rows = _as_rows(data)
    if rows:
        return rows[:MAX_ROWS_KEEP]

    # 2) structured_content may carry raw JSON
    sc = payload.get("structured_content")
    rows = _as_rows(sc)
    if rows:
        return rows[:MAX_ROWS_KEEP]

    # 3) Try to parse JSON-looking strings embedded in text
    text = payload.get("text") or ""
    guess = _extract_json_objects(text)
    rows = _as_rows(guess)
    if rows:
        return rows[:MAX_ROWS_KEEP]

    return None

def _as_rows(obj: Any) -> Optional[List[Dict[str, Any]]]:
    if isinstance(obj, list) and all(isinstance(x, dict) for x in obj):
        return obj
    if isinstance(obj, dict):
        # Handle columnar format: {"columns": [...], "rows": [[...], ...]}
        # This is the format returned by Snowflake executor
        columns = obj.get("columns")
        rows_val = obj.get("rows")
        if (
            isinstance(columns, list)
            and isinstance(rows_val, list)
            and columns
            and rows_val
            and all(isinstance(r, (list, tuple)) for r in rows_val)
        ):
            return [{col: val for col, val in zip(columns, row)} for row in rows_val]

        for key in ("rows", "items", "data", "results"):
            val = obj.get(key)
            if isinstance(val, list) and all(isinstance(x, dict) for x in val):
                return val
    return None

def _extract_json_objects(text: str) -> Optional[Any]:
    # Very lightweight; caller will validate shape in _as_rows
    if not text:
        return None
    # Look for {...} or [{...}]
    m = re.search(r"(\[\s*\{.*\}\s*\]|\{\s*\"[^\"]+\"\s*:\s*\[.*\]\s*\})", text, flags=re.DOTALL)
    if not m:
        return None
    import json
    try:
        return json.loads(m.group(1))
    except Exception:
        return None

def parse_markdown_table_to_rows(markdown: str) -> Optional[List[Dict[str, Any]]]:
    """
    Parse a simple GitHub-style markdown table into list[dict] rows.
    """
    if not markdown or "|" not in markdown:
        return None
    lines = [ln.strip() for ln in markdown.strip().splitlines() if ln.strip()]
    # Find header and separator
    header_idx = None
    for i in range(len(lines) - 1):
        if "|" in lines[i] and re.match(r"^\|?\s*:?-{2,}.*-+:?\s*\|?$", lines[i + 1]):
            header_idx = i
            break
    if header_idx is None:
        return None
    headers = [h.strip().strip("|").strip() for h in lines[header_idx].split("|") if h.strip()]
    rows: List[Dict[str, Any]] = []
    for ln in lines[header_idx + 2:]:
        if "|" not in ln:
            continue
        cols = [c.strip() for c in ln.strip("|").split("|")]
        if len(cols) != len(headers):
            continue
        row = {h: cols[i] for i, h in enumerate(headers)}
        rows.append(row)
    return rows[:MAX_ROWS_KEEP] if rows else None
