# gateway_app/services/interceptor.py
import re
from typing import Optional

# Common phrasings for "which database are you connected to?"
CONNECTION_STATUS_PATTERNS = [
    r"which.*connected",
    r"connected.*(snowflake|starrocks)",
    r"current.*(db|database)",
    r"which.*(db|database).*(using|use)",
    r"(tell me|what is).*current.*connection",
]

_RE_CONNECTION_STATUS = re.compile("|".join(CONNECTION_STATUS_PATTERNS), re.IGNORECASE)

def is_connection_status_query(text: str) -> bool:
    """Check if the user is asking about the current database connection."""
    if not text:
        return False
    return bool(_RE_CONNECTION_STATUS.search(text))

def get_connection_status_response(db_source: str) -> str:
    """Return a friendly response about the current connection."""
    return f"I am currently connected to {db_source}."
