# gateway_app/api/auth_routes.py
"""
Authentication for the standalone web app.

Two login methods supported:
  1. Email + password  → POST /auth/login
  2. Google OAuth      → POST /auth/verify  (requires GOOGLE_CLIENT_ID)

Both issue the same short-lived JWT for subsequent API calls.
The email from the JWT becomes the user identity that maps to
StarRocks username (email → email.replace("@", "_at_")).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Optional

import jwt
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth")

# ── Config ───────────────────────────────────────────────────────────────────
JWT_SECRET: str = os.getenv("JWT_SECRET", "friday-change-me-use-a-strong-random-secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECS = 7 * 24 * 3600  # 7 days
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")


def _load_allowed_users() -> dict[str, str]:
    """Load ALLOWED_USERS from env.
    Format: JSON object {"email": "password"} or {"email": "sha256:<hash>"}
    Example:  {"mahesh.k@techsophy.com": "friday123"}
    """
    raw = os.getenv("ALLOWED_USERS", "").strip()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return {k.strip().lower(): str(v) for k, v in parsed.items() if k and v}
    except Exception:
        pass
    return {}


def _verify_password(stored: str, provided: str) -> bool:
    """Compare stored password (plain or sha256:<hash>) with user input."""
    if stored.startswith("sha256:"):
        return stored[7:] == hashlib.sha256(provided.encode()).hexdigest()
    return stored == provided


# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_jwt(email: str, name: str, picture: str = "") -> str:
    now = int(time.time())
    payload = {
        "sub": email,
        "email": email,
        "name": name,
        "picture": picture,
        "iat": now,
        "exp": now + JWT_EXPIRY_SECS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_jwt(token: str) -> Optional[dict]:
    """Decode and verify an app JWT. Returns payload dict or None on failure."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


def get_user_from_request(req: Request) -> Optional[dict]:
    """Extract and decode the JWT from the Authorization header."""
    auth = req.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return decode_jwt(auth[7:])
    return None


# ── Endpoints ────────────────────────────────────────────────────────────────

@auth_router.post("/login")
async def login(req: Request):
    """
    Email + password login for the standalone web app.

    Body: { "email": "user@company.com", "password": "secret" }

    Configure allowed users in .env:
        ALLOWED_USERS={"user@company.com": "plaintext_password"}
    or with hashed passwords:
        ALLOWED_USERS={"user@company.com": "sha256:<hex_hash>"}
    """
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    email = (body.get("email") or "").strip().lower()
    password = (body.get("password") or "").strip()

    if not email or not password:
        raise HTTPException(status_code=400, detail="email and password are required")

    allowed = _load_allowed_users()

    if not allowed:
        raise HTTPException(
            status_code=503,
            detail="No users configured. Set ALLOWED_USERS in .env",
        )

    stored = allowed.get(email)
    if stored is None or not _verify_password(stored, password):
        logger.warning("Failed login attempt for: %s", email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    name = email.split("@")[0].replace(".", " ").replace("_", " ").title()
    token = _make_jwt(email, name)
    logger.info("Login successful for: %s", email)

    return JSONResponse(content={
        "token": token,
        "user": {"email": email, "name": name, "picture": ""},
    })


@auth_router.post("/verify")
async def verify_google_token(req: Request):
    """
    Verify a Google id_token (credential) and return an app JWT.
    Body: { "credential": "<google-id-token>" }
    Requires GOOGLE_CLIENT_ID in .env.
    """
    try:
        body = await req.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    credential = (body.get("credential") or "").strip()
    if not credential:
        raise HTTPException(status_code=400, detail="Missing credential field")

    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests

        id_info = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID if GOOGLE_CLIENT_ID else None,
        )
    except Exception as exc:
        logger.warning("Google token verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid or expired Google token")

    email: str = id_info.get("email", "")
    name: str = id_info.get("name", email.split("@")[0] if email else "User")
    picture: str = id_info.get("picture", "")

    if not email:
        raise HTTPException(status_code=401, detail="No email found in Google token")

    token = _make_jwt(email, name, picture)
    logger.info("Issued JWT via Google OAuth for: %s", email)

    return JSONResponse(content={
        "token": token,
        "user": {"email": email, "name": name, "picture": picture},
    })


@auth_router.get("/me")
async def get_me(req: Request):
    """Return current user info from the app JWT."""
    user = get_user_from_request(req)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return JSONResponse(content={
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture", ""),
    })
