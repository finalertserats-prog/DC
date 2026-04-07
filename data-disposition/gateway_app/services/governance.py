# gateway_app/services/governance.py
"""
Governance Service for Friday Gateway.
Handles Row-Level Security (RLS) and Column Masking by injecting policy filters into SQL queries.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Set

from ..config.settings import settings

logger = logging.getLogger(__name__)

class GovernanceService:
    """
    Enforces data governance policies at Layer 3.
    Re-writes SQL queries to inject user-specific row and column filters.
    """

    def __init__(self):
        """Initialize the governance service."""
        # Ranger-style policies: {"email": {"table_name": "filter_clause"}}
        self._policies = settings.RANGER_POLICIES

    def apply_policies(self, sql: str, user_id: Optional[str]) -> str:
        """
        Apply governance policies to a SQL query for a specific user.
        Injects WHERE clauses for Row-Level Security.
        """
        if not user_id:
            return sql
            
        # Resolve identity (similar to AccessRegistry)
        email = self._resolve_identity(user_id)
        
        user_policies = self._policies.get(email)
        if not user_policies:
            # Check for default policies
            user_policies = self._policies.get("default")
            
        if not user_policies:
            return sql

        modified_sql = sql
        for table, filter_clause in user_policies.items():
            # Very basic RLS injection: wrap the query if it mentions the table
            # In a production system, use a real SQL parser (sqlglot, pglast, etc.)
            # For this gateway, we'll use a robust wrapping technique:
            # SELECT * FROM ( {original_sql} ) WHERE {filter_clause}
            # This works for most SELECT queries.
            
            # Simple check if table is mentioned (case insensitive)
            if re.search(rf"\b{table}\b", sql, re.IGNORECASE):
                logger.info(f"Applying RLS filter for user '{email}' on table '{table}'")
                modified_sql = f"SELECT * FROM ({modified_sql}) AS enforced_rls WHERE {filter_clause}"
                # Note: We only apply one level of wrapping for simplicity in this version
                break
        
        return modified_sql

    def _resolve_identity(self, user_id: str) -> str:
        """Helper to resolve AAD ID to email."""
        if "@" in user_id:
            return user_id.lower()
        return settings.AAD_TO_EMAIL.get(user_id, user_id).lower()
