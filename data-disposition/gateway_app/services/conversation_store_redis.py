# gateway_app/services/conversation_store_redis.py
import json
from typing import Any, Dict, List, Optional

from redis import Redis
from redis.client import Pipeline
from ..config.settings import settings


class RedisConversationStore:
    """
    Redis-backed conversation store using:
      - LIST per conversation for messages: tg:conv:{user_id}:{conversation_id}
      - HASH per conversation for scratch state: tg:state:{user_id}:{conversation_id}
    """

    def __init__(self, redis_url: Optional[str] = None):
        self._redis = Redis.from_url(redis_url or settings.REDIS_URL, decode_responses=True)
        self._ttl = int(settings.HISTORY_TTL_SECS)
        self._max_turns = int(settings.HISTORY_MAX_TURNS)

    def _normalize_user(self, user_id: Optional[str]) -> str:
        return user_id or settings.SINGLE_USER_ID

    def _key(self, user_id: Optional[str], conv_id: str) -> str:
        normalized = self._normalize_user(user_id)
        return f"tg:conv:{normalized}:{conv_id}"

    def _state_key(self, user_id: Optional[str], conv_id: str) -> str:
        normalized = self._normalize_user(user_id)
        return f"tg:state:{normalized}:{conv_id}"

    # ------------- messages -------------
    def get(self, user_id: Optional[str], conv_id: str) -> List[Dict[str, Any]]:
        key = self._key(user_id, conv_id)
        raw = self._redis.lrange(key, 0, -1) or []
        out: List[Dict[str, Any]] = []
        for r in raw:
            try:
                out.append(json.loads(r))
            except Exception:
                continue
        return out

    def append(self, user_id: Optional[str], conv_id: str, role: str, content: str, **extra: Any) -> None:
        key = self._key(user_id, conv_id)
        msg = {"role": role, "content": content}
        if extra:
            msg.update(extra)
        pipe: Pipeline = self._redis.pipeline()
        pipe.rpush(key, json.dumps(msg, default=str))
        if self._ttl > 0:
            pipe.expire(key, self._ttl)
        pipe.execute()
        self._trim_turns(user_id, conv_id)

    def extend(self, user_id: Optional[str], conv_id: str, messages: List[Dict[str, Any]]) -> None:
        if not messages:
            return
        key = self._key(user_id, conv_id)
        pipe: Pipeline = self._redis.pipeline()
        for m in messages:
            pipe.rpush(key, json.dumps(m, default=str))
        if self._ttl > 0:
            pipe.expire(key, self._ttl)
        pipe.execute()
        self._trim_turns(user_id, conv_id)

    def overwrite(self, user_id: Optional[str], conv_id: str, messages: List[Dict[str, Any]]) -> None:
        key = self._key(user_id, conv_id)
        pipe: Pipeline = self._redis.pipeline()
        pipe.delete(key)
        if messages:
            for m in messages:
                pipe.rpush(key, json.dumps(m, default=str))
        if self._ttl > 0:
            pipe.expire(key, self._ttl)
        pipe.execute()

    def purge(self, user_id: Optional[str], conv_id: str) -> int:
        """
        Delete both the conversation history list and the per-conversation state hash.

        Returns the total number of Redis keys removed for this (user, conversation).
        """
        conv_key = self._key(user_id, conv_id)
        state_key = self._state_key(user_id, conv_id)
        pipe: Pipeline = self._redis.pipeline()
        pipe.delete(conv_key)
        pipe.delete(state_key)
        deleted_conv, deleted_state = pipe.execute()
        deleted_conv = int(deleted_conv or 0)
        deleted_state = int(deleted_state or 0)
        return deleted_conv + deleted_state

    def _conv_list_key(self, user_id: Optional[str]) -> str:
        return f"tg:user_convlist:{self._normalize_user(user_id)}"

    def _conv_meta_key(self, user_id: Optional[str], conv_id: str) -> str:
        return f"tg:conv_meta:{self._normalize_user(user_id)}:{conv_id}"

    # ------------- Tab UI conversation management -------------
    def create_tab_conversation(
        self, user_id: Optional[str], conv_id: str, title: str = "New chat"
    ) -> Dict[str, Any]:
        import time as _time

        meta_key = self._conv_meta_key(user_id, conv_id)
        list_key = self._conv_list_key(user_id)
        now = _time.time()
        meta = {"title": title, "created_at": str(now), "updated_at": str(now)}
        pipe: Pipeline = self._redis.pipeline()
        pipe.hset(meta_key, mapping=meta)
        pipe.zadd(list_key, {conv_id: now})
        if self._ttl > 0:
            pipe.expire(meta_key, self._ttl)
            pipe.expire(list_key, self._ttl)
        pipe.execute()
        return {"id": conv_id, **meta}

    def touch_conversation(self, user_id: Optional[str], conv_id: str) -> None:
        import time as _time

        meta_key = self._conv_meta_key(user_id, conv_id)
        list_key = self._conv_list_key(user_id)
        conv_key = self._key(user_id, conv_id)
        state_key = self._state_key(user_id, conv_id)
        now = _time.time()
        pipe: Pipeline = self._redis.pipeline()
        pipe.hset(meta_key, "updated_at", str(now))
        pipe.zadd(list_key, {conv_id: now})
        # Reset TTL on all keys so conversation lives 7 more days from now
        if self._ttl > 0:
            pipe.expire(conv_key, self._ttl)
            pipe.expire(meta_key, self._ttl)
            pipe.expire(list_key, self._ttl)
            pipe.expire(state_key, self._ttl)
        pipe.execute()

    def update_conversation_title(
        self, user_id: Optional[str], conv_id: str, title: str
    ) -> None:
        meta_key = self._conv_meta_key(user_id, conv_id)
        self._redis.hset(meta_key, "title", title)

    def get_conversation_meta(
        self, user_id: Optional[str], conv_id: str
    ) -> Dict[str, str]:
        meta_key = self._conv_meta_key(user_id, conv_id)
        return self._redis.hgetall(meta_key)

    def list_tab_conversations(
        self, user_id: Optional[str], offset: int = 0, limit: int = 50
    ) -> List[Dict[str, Any]]:
        list_key = self._conv_list_key(user_id)

        # Refresh the list TTL whenever it is read so it doesn't expire
        # from disuse (e.g. user browses sidebar without opening any chat).
        if self._ttl > 0:
            self._redis.expire(list_key, self._ttl)

        conv_ids = self._redis.zrevrange(list_key, offset, offset + limit - 1)
        results: List[Dict[str, Any]] = []
        ghost_ids: List[str] = []   # entries whose Redis keys have fully expired

        for cid in conv_ids:
            meta_key = self._conv_meta_key(user_id, cid)
            meta = self._redis.hgetall(meta_key)

            # Ghost entry: meta has expired. Check if the conv list is also
            # gone — if so, silently clean it up from the sorted set.
            if not meta:
                conv_key = self._key(user_id, cid)
                if not self._redis.exists(conv_key):
                    ghost_ids.append(cid)
                    continue
                # Meta expired but messages still exist — reconstruct minimal meta
                meta = {"title": "Conversation", "created_at": "0", "updated_at": "0"}

            # grab last non-system message as preview
            conv_key = self._key(user_id, cid)
            last_raw = self._redis.lindex(conv_key, -1)
            preview = ""
            if last_raw:
                try:
                    last_msg = json.loads(last_raw)
                    if last_msg.get("role") != "system":
                        preview = (last_msg.get("content") or "")[:120]
                except Exception:
                    pass
            results.append(
                {
                    "id": cid,
                    "title": meta.get("title", "New chat"),
                    "created_at": meta.get("created_at"),
                    "updated_at": meta.get("updated_at"),
                    "preview": preview,
                }
            )

        # Remove ghost entries from the sorted set in one batch
        if ghost_ids:
            self._redis.zrem(list_key, *ghost_ids)

        return results

    def search_tab_conversations(
        self, user_id: Optional[str], query: str
    ) -> List[Dict[str, Any]]:
        all_convs = self.list_tab_conversations(user_id, limit=200)
        q = query.lower()
        return [
            c
            for c in all_convs
            if q in (c.get("title") or "").lower()
            or q in (c.get("preview") or "").lower()
        ]

    def delete_tab_conversation(
        self, user_id: Optional[str], conv_id: str
    ) -> None:
        self.purge(user_id, conv_id)
        meta_key = self._conv_meta_key(user_id, conv_id)
        list_key = self._conv_list_key(user_id)
        pipe: Pipeline = self._redis.pipeline()
        pipe.delete(meta_key)
        pipe.zrem(list_key, conv_id)
        pipe.execute()

    def _trim_turns(self, user_id: Optional[str], conv_id: str) -> None:
        key = self._key(user_id, conv_id)
        max_messages = max(2 * self._max_turns + 20, 50)
        length = self._redis.llen(key)
        if length and length > max_messages:
            start = length - max_messages
            self._redis.ltrim(key, start, -1)

    # ------------- scratch state (e.g., last materialized rows) -------------
    def set_state(self, user_id: Optional[str], conv_id: str, k: str, v: Any) -> None:
        skey = self._state_key(user_id, conv_id)
        self._redis.hset(skey, k, json.dumps(v, default=str))
        if self._ttl > 0:
            self._redis.expire(skey, self._ttl)

    def get_state(self, user_id: Optional[str], conv_id: str, k: str) -> Optional[Any]:
        skey = self._state_key(user_id, conv_id)
        raw = self._redis.hget(skey, k)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except Exception:
            return None
