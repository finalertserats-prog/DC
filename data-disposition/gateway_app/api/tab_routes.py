# gateway_app/api/tab_routes.py
"""
REST + SSE API consumed by the React Tab UI (sidebar chat experience).

Routes are mounted at /tabs/api by server.py.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, StreamingResponse

from ..services.agent import Agent
from ..services.conversation_store_redis import RedisConversationStore

logger = logging.getLogger(__name__)

tab_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Lazy singletons – created on first request so startup stays fast.
# ---------------------------------------------------------------------------
_store: Optional[RedisConversationStore] = None
_agent: Optional[Agent] = None


def _get_store() -> RedisConversationStore:
    global _store
    if _store is None:
        _store = RedisConversationStore()
    return _store


def _get_agent() -> Agent:
    global _agent
    if _agent is None:
        _agent = Agent(_get_store())
    return _agent


def _get_user_id(req: Request) -> str:
    """Extract user identity - prefers JWT Bearer token, falls back to legacy headers."""
    # 1. Try JWT Bearer token (used by the standalone web app)
    auth = req.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from .auth_routes import decode_jwt
            payload = decode_jwt(auth[7:])
            if payload and payload.get("email"):
                return payload["email"]
        except Exception:
            pass

    # 2. Legacy fallback (X-User-Email / X-User-Id headers)
    email = (req.headers.get("x-user-email") or "").strip()
    if email:
        return email
    return (
        req.headers.get("x-user-id")
        or req.query_params.get("user_id")
        or "tab-default"
    )



# ---------------------------------------------------------------------------
# DB Preference Endpoints
# ---------------------------------------------------------------------------
from fastapi import status
from fastapi.responses import JSONResponse

PREF_KEY_PREFIX = "tmcp:db_pref:"
DB_OPTIONS = ["Snowflake", "StarRocks"]

def _db_pref_key(user_id: str) -> str:
    return f"{PREF_KEY_PREFIX}{user_id}"

def _normalize_db_source(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    val = str(raw).strip()
    if not val:
        return None
    low = val.lower()
    if low in ("snowflake", "sf"):
        return "Snowflake"
    if low in ("starrocks", "sr", "starrock"):
        return "StarRocks"
    if val in DB_OPTIONS:
        return val
    return None

def _get_user_keys(req: Optional[Request]) -> tuple[str, Optional[str], str]:
    email = None
    user_id = "agent-default"

    if req is not None:
        # 1. Try JWT Bearer token
        auth = req.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            try:
                from .auth_routes import decode_jwt
                payload = decode_jwt(auth[7:])
                if payload and payload.get("email"):
                    jwt_email = payload["email"]
                    return jwt_email, jwt_email, jwt_email
            except Exception:
                pass

        # 2. Legacy headers
        email = (req.headers.get("x-user-email") or "").strip() or None
        user_id = (
            req.headers.get("x-user-id")
            or req.query_params.get("user_id")
            or "tab-default"
        )

    user_id = user_id.strip() if isinstance(user_id, str) else "tab-default"
    primary = email or user_id
    return primary, email, user_id

def _read_db_preference(req: Optional[Request], store: RedisConversationStore, user_id: Optional[str] = None) -> str:
    if user_id:
        primary, email, uid = user_id, None, user_id
    else:
        primary, email, uid = _get_user_keys(req)
    
    redis = store._redis
    db_source = redis.get(_db_pref_key(primary))
    if not db_source and email and uid and email != uid:
        db_source = redis.get(_db_pref_key(uid))
        if db_source:
            redis.set(_db_pref_key(email), db_source)
    normalized = _normalize_db_source(db_source) or DB_OPTIONS[0]
    return normalized

@tab_router.get("/preferences/db")
async def get_db_preference(req: Request):
    store = _get_store()
    db_source = _read_db_preference(req, store)
    return JSONResponse(content={"db_source": db_source, "options": DB_OPTIONS})

@tab_router.put("/preferences/db")
async def set_db_preference(req: Request):
    store = _get_store()
    redis = store._redis
    try:
        body = await req.json()
        normalized = _normalize_db_source(body.get("db_source"))
        if normalized is None:
            return JSONResponse(content={"error": "Invalid db_source"}, status_code=status.HTTP_400_BAD_REQUEST)
        primary, email, user_id = _get_user_keys(req)
        redis.set(_db_pref_key(primary), normalized)
        if email and user_id and email != user_id:
            redis.set(_db_pref_key(user_id), normalized)
        return JSONResponse(content={"db_source": normalized, "ok": True})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=status.HTTP_400_BAD_REQUEST)
# Conversation CRUD
# ---------------------------------------------------------------------------
@tab_router.get("/conversations")
async def list_conversations(req: Request):
    user_id = _get_user_id(req)
    store = _get_store()
    convs = store.list_tab_conversations(user_id)
    return JSONResponse(content={"conversations": convs})


@tab_router.post("/conversations")
async def create_conversation(req: Request):
    user_id = _get_user_id(req)
    store = _get_store()
    body: dict = {}
    if (req.headers.get("content-type") or "").startswith("application/json"):
        try:
            body = await req.json()
        except Exception:
            pass
    title = body.get("title", "New chat")
    conv_id = f"tab-{uuid.uuid4().hex[:12]}"
    meta = store.create_tab_conversation(user_id, conv_id, title)
    return JSONResponse(content=meta, status_code=201)


# search MUST be declared before the {conv_id} catch-all
@tab_router.get("/conversations/search")
async def search_conversations(req: Request):
    user_id = _get_user_id(req)
    q = req.query_params.get("q", "")
    store = _get_store()
    results = store.search_tab_conversations(user_id, q)
    return JSONResponse(content={"conversations": results})


@tab_router.get("/conversations/{conv_id}/messages")
async def get_messages(conv_id: str, req: Request):
    user_id = _get_user_id(req)
    store = _get_store()
    msgs = store.get(user_id, conv_id)
    # Reset TTL whenever conversation is opened
    store.touch_conversation(user_id, conv_id)
    visible = [
        {"role": m["role"], "content": m.get("content", ""), "ts": m.get("ts")}
        for m in msgs
        if m.get("role") in ("user", "assistant")
        and m.get("content", "").strip()  # skip empty planning-round tool-call messages
    ]
    return JSONResponse(content={"messages": visible})


# ---------------------------------------------------------------------------
# Send message – returns an SSE stream with deltas + final text.
# ---------------------------------------------------------------------------
@tab_router.post("/conversations/{conv_id}/messages")
async def send_message(conv_id: str, req: Request):
    user_id = _get_user_id(req)
    body = await req.json()

    text = (body.get("text") or "").strip()
    if not text:
        return JSONResponse(content={"error": "Empty message"}, status_code=400)

    # Intercept connection status questions and answer using db preference
    connection_qs = [
        "which one you connected",
        "which one are you connected",
        "which one you are connected",
        "which database are you connected to",
        "current database",
        "connected to snowflake or starrocks",
        "which db are you using",
    ]
    is_connection_q = any(q in text.lower() for q in connection_qs)
    
    if is_connection_q:
        # Read user db preference from Redis, default to first available option
        store = _get_store()
        db_source = _read_db_preference(req, store)
        return JSONResponse(content={"role": "assistant", "content": f"I am currently connected to {db_source}."})

    store = _get_store()
    agent = _get_agent()

    # Read db_source for passing to agent
    db_source = _read_db_preference(req, store)

    # Auto-register / auto-title
    meta = store.get_conversation_meta(user_id, conv_id)
    if not meta or not meta.get("title"):
        store.create_tab_conversation(user_id, conv_id, text[:60])
    elif meta.get("title") == "New chat":
        store.update_conversation_title(user_id, conv_id, text[:60])
    store.touch_conversation(user_id, conv_id)

    # Async queue bridges the Agent callbacks → SSE generator
    queue: asyncio.Queue = asyncio.Queue()

    async def on_delta(accumulated_text: str):
        await queue.put(("delta", accumulated_text))

    async def on_start(_: str):
        await queue.put(("start", ""))

    async def on_done(final_text: str):
        await queue.put(("done", final_text))

    async def on_attachment(attach: dict):
        await queue.put(("attachment", json.dumps(attach, default=str)))

    async def _run_agent():
        try:
            await agent.run_stream(
                user_id=user_id,
                conversation_id=conv_id,
                user_text=text,
                on_delta=on_delta,
                on_start=on_start,
                on_done=on_done,
                on_attachment=on_attachment,
                db_source=db_source,
            )
        except Exception as exc:
            logger.exception("Tab agent error: %s", exc)
            await queue.put(("error", str(exc)))
        finally:
            await queue.put(None)  # sentinel

    task = asyncio.create_task(_run_agent())  # noqa: F841

    async def _event_stream():
        try:
            while True:
                try:
                    item = await asyncio.wait_for(queue.get(), timeout=300)
                except asyncio.TimeoutError:
                    yield _sse("error", {"error": "Response timed out"})
                    break

                if item is None:
                    break

                event_type, data = item
                if event_type == "delta":
                    yield _sse("delta", {"text": data})
                elif event_type == "done":
                    yield _sse("message", {"text": data})
                elif event_type == "start":
                    yield _sse("start", {"status": "thinking"})
                elif event_type == "error":
                    yield _sse("error", {"error": data})
                elif event_type == "attachment":
                    yield f"event: attachment\ndata: {data}\n\n"
        except asyncio.CancelledError:
            task.cancel()
        except Exception as exc:
            yield _sse("error", {"error": str(exc)})

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-source",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Suggestions – mines past user messages from Redis for autocomplete
# ---------------------------------------------------------------------------
@tab_router.get("/suggestions")
async def get_suggestions(req: Request):
    user_id = _get_user_id(req)
    q = (req.query_params.get("q") or "").strip().lower()
    store = _get_store()

    # Collect all user messages across all conversations
    convs = store.list_tab_conversations(user_id, limit=200)
    seen: dict[str, int] = {}  # message -> frequency

    for conv in convs:
        conv_id = conv.get("id")
        if not conv_id:
            continue
        try:
            msgs = store.get(user_id, conv_id)
            for m in msgs:
                if m.get("role") != "user":
                    continue
                text = (m.get("content") or "").strip()
                # skip very short or very long messages
                if len(text) < 8 or len(text) > 300:
                    continue
                # skip system-like messages
                if text.startswith("/") or text.startswith("\\"):
                    continue
                key = text.lower()
                seen[text] = seen.get(text, 0) + 1
        except Exception:
            continue

    # Sort by frequency descending
    ranked = sorted(seen.keys(), key=lambda t: seen[t], reverse=True)

    # Filter by query if provided
    if q:
        matched = [t for t in ranked if q in t.lower()]
    else:
        matched = ranked

    return JSONResponse(content={"suggestions": matched[:8]})


@tab_router.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, req: Request):
    user_id = _get_user_id(req)
    store = _get_store()
    store.delete_tab_conversation(user_id, conv_id)
    return JSONResponse(content={"ok": True})


@tab_router.patch("/conversations/{conv_id}")
async def update_conversation(conv_id: str, req: Request):
    user_id = _get_user_id(req)
    body = await req.json()
    title = body.get("title")
    if title:
        store = _get_store()
        store.update_conversation_title(user_id, conv_id, title)
    return JSONResponse(content={"ok": True})


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"
