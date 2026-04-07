# gateway_app/services/sql_validator.py
"""
SQL validation for read-only enforcement.

Parses SQL queries and blocks any write/DDL/DCL operations before they
reach Snowflake. This is Layer 2 protection — Apache Ranger (Layer 3)
still enforces row/column filters at the database level.
"""
from __future__ import annotations

import re
from typing import Tuple

# --------------------------------------------------------------------------- #
#  Allowed and blocked SQL statement types                                     #
# --------------------------------------------------------------------------- #

# Statements that are explicitly ALLOWED (read-only)
_ALLOWED_PREFIXES = {
    "select",
    "with",       # CTE → SELECT
    "show",
    "describe",
    "desc",
    "explain",
    "values",     # VALUES expression (read-only)
}

# Statements that are BLOCKED (write / DDL / DCL)
_BLOCKED_PREFIXES = {
    "insert",
    "update",
    "delete",
    "merge",
    "upsert",
    "drop",
    "create",
    "alter",
    "truncate",
    "replace",
    "rename",
    "grant",
    "revoke",
    "call",
    "execute",
    "exec",
    "begin",
    "commit",
    "rollback",
    "set",
    "use",
    "copy",
    "put",
    "get",
    "list",
    "remove",
    "undrop",
}

# Dangerous patterns that should be blocked regardless of statement type
_DANGEROUS_PATTERNS = [
    re.compile(r";\s*(insert|update|delete|drop|create|alter|truncate|merge)", re.IGNORECASE),
    re.compile(r"into\s+outfile", re.IGNORECASE),
    re.compile(r"into\s+dumpfile", re.IGNORECASE),
    re.compile(r"load\s+data", re.IGNORECASE),
    re.compile(r"--\s*.*$", re.MULTILINE),  # SQL comment injection (basic check)
]


def validate_sql_readonly(sql: str) -> Tuple[bool, str]:
    """
    Validate that a SQL string is a read-only query.

    Returns:
        (True, "") if the SQL is safe to execute.
        (False, "reason") if the SQL is blocked.
    """
    if not sql or not sql.strip():
        return False, "Empty SQL query"

    cleaned = sql.strip()

    # Remove leading comments (both -- and /* */)
    cleaned = re.sub(r"--[^\n]*", "", cleaned)
    cleaned = re.sub(r"/\*.*?\*/", "", cleaned, flags=re.DOTALL)
    cleaned = cleaned.strip()

    if not cleaned:
        return False, "SQL query is empty after removing comments"

    # Check for multiple statements (semicolon-separated)
    # Allow trailing semicolons but block multi-statement
    statements = [s.strip() for s in cleaned.rstrip(";").split(";") if s.strip()]
    if len(statements) > 1:
        return False, "Multiple SQL statements are not allowed (possible injection)"

    # Get the first keyword
    first_word = cleaned.split()[0].lower() if cleaned.split() else ""

    # Check against blocked prefixes
    if first_word in _BLOCKED_PREFIXES:
        return False, f"Statement type '{first_word.upper()}' is not allowed (write/DDL operation)"

    # Check against allowed prefixes
    if first_word not in _ALLOWED_PREFIXES:
        return False, f"Statement type '{first_word.upper()}' is not recognized as a read-only operation"

    # Check for dangerous patterns
    for pattern in _DANGEROUS_PATTERNS:
        if pattern.search(cleaned):
            return False, f"SQL contains a blocked pattern: {pattern.pattern}"

    return True, ""
