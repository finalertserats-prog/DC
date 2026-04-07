# gateway_app/services/access_registry.py
"""
Access Registry service for Friday Gateway.
Handles tool discovery, filtering, and identity-based authorization.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set

from ..config.settings import settings

logger = logging.getLogger(__name__)

class AccessRegistry:
    """
    Manages the catalog of available tools and enforces identity-based access rules.
    This is Layer 2 of the multi-layer security architecture.
    """

    def __init__(self):
        """Initialize the access registry."""
        self._tools: Dict[str, List[Dict[str, Any]]] = {}
        # Pre-calculate identity mappings from settings
        self._access_rules = settings.ACCESS_RULES
        self._aad_to_email = settings.AAD_TO_EMAIL

    def _resolve_identity(self, user_id: Optional[str]) -> str:
        """
        Resolve user_id (potentially an AAD ID or opaque ID) to an email address.
        """
        if not user_id:
            return "anonymous"
        
        # Check if it's already an email (simple check)
        if "@" in user_id:
            return user_id.lower()
        
        # Check AAD mapping
        email = self._aad_to_email.get(user_id)
        if email:
            return email.lower()
        
        return user_id.lower()

    def get_user_allowed_tools(self, user_id: Optional[str]) -> Optional[Set[str]]:
        """
        Determine the set of tools a user is allowed to access.
        Returns None if no restrictions are defined (all tools allowed).
        """
        email = self._resolve_identity(user_id)
        
        # Check for explicit user rules
        if email in self._access_rules:
            return set(self._access_rules[email])
        
        # Check for default rules
        if "default" in self._access_rules:
            return set(self._access_rules["default"])
        
        # If no rules exist at all, allow everything (backward compatible)
        if not self._access_rules:
            return None
            
        # If rules exist but this user matches nothing, return empty set (deny all)
        return set()

    def filter_tools(self, tools: List[Dict[str, Any]], user_id: Optional[str]) -> List[Dict[str, Any]]:
        """
        Filter a list of tools based on user identity and access rules.
        """
        allowed_set = self.get_user_allowed_tools(user_id)
        if allowed_set is None:
            return tools

        filtered = []
        is_wildcard = "*" in allowed_set
        for tool in tools:
            name = tool.get("name")
            if is_wildcard or name in allowed_set:
                filtered.append(tool)
            else:
                logger.debug(f"Tool '{name}' filtered for user '{user_id}'")
        
        return filtered

    async def list_tools_payload(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Returns a simplified list of tools for UI or summary purposes, filtered by user access.
        """
        # Placeholder for tool discovery logic
        all_tools = [] 
        return self.filter_tools(all_tools, user_id)

    def is_database_allowed(self, user_id: Optional[str], database_name: str) -> bool:
        """
        Check if a user is allowed to access a specific database (Layer 2.5).
        
        DEPRECATED: We now rely on Engine-level security (e.g. Apache Ranger) via
        per-user mapped identities. This method always returns True to allow
        the engine to perform the final authorization check.
        """
        return True
            
    def get_database_user(self, user_id: Optional[str]) -> str:
        """
        Map a user's identity to a database-compatible username (e.g. for StarRocks).
        Example: mahesh.k@techsophy.com -> mahesh.k_at_techsophy.com
        """
        email = self._resolve_identity(user_id)
        if not email or email == "anonymous":
            return None  # No fallback — anonymous users are denied
            
        return email.replace("@", "_at_")
