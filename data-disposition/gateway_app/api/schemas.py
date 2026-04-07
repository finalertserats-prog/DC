# gateway_app/api/schemas.py
"""Pydantic models for request/response validation and input sanitization."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from typing import Any, Dict, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field, ValidationError as PydanticValidationError, field_validator, model_validator

from gateway_app.config.settings import settings
from gateway_app.services.exceptions import ValidationError
from gateway_app.services.telemetry import event

# ----------------------------
# Limits (read from settings)
# ----------------------------

@lru_cache(maxsize=1)
def limits() -> dict[str, int]:
    """
    Cache once per process by default (fast & predictable).
    In tests, call `limits.cache_clear()` after changing env/settings.
    """
    return {
        "MAX_USER_MESSAGE_LENGTH": int(settings.MAX_USER_MESSAGE_LENGTH),
        "MAX_TOOL_NAME_LENGTH": int(settings.MAX_TOOL_NAME_LENGTH),
        "MAX_TOOL_ARGUMENTS_SIZE": int(settings.MAX_TOOL_ARGUMENTS_SIZE),
        "MAX_REQUEST_BODY_SIZE": int(settings.MAX_REQUEST_BODY_SIZE),
    }

# ----------------------------
# Malicious pattern detection
# ----------------------------

_MALICIOUS_PATTERNS = [
    re.compile(r"<script[^>]*>", re.IGNORECASE),
    re.compile(r"javascript:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),
    re.compile(r"eval\s*\(", re.IGNORECASE),
    re.compile(r"exec\s*\(", re.IGNORECASE),
    re.compile(r"\.\./", re.IGNORECASE),
    re.compile(r"file://", re.IGNORECASE),
    re.compile(r"data:text/html", re.IGNORECASE),
]

def sanitize_text(text: str, max_length: Optional[int] = None) -> str:
    if not isinstance(text, str):
        raise ValidationError("Input must be a string.", user_message="Invalid input format.")
    text = text.replace("\x00", "").strip()
    if max_length is not None and len(text) > max_length:
        text = text[:max_length].rstrip()
    return text

def detect_malicious_content(text: str) -> bool:
    if not isinstance(text, str) or not text:
        return False
    return any(p.search(text) for p in _MALICIOUS_PATTERNS)

# ----------------------------
# Profanity / toxicity (best-effort)
# ----------------------------

_PROFANITY_READY = False
_BETTER_PROFANITY = None
_PROFANITY_PREDICT = None

def _init_profanity_libs() -> None:
    global _PROFANITY_READY, _BETTER_PROFANITY, _PROFANITY_PREDICT
    if _PROFANITY_READY:
        return

    try:
        from better_profanity import profanity as better_profanity  # type: ignore[import-not-found]
        better_profanity.load_censor_words()
        _BETTER_PROFANITY = better_profanity
    except Exception:
        _BETTER_PROFANITY = None

    try:
        from profanity_check import predict as profanity_predict  # type: ignore[import-not-found]
        _PROFANITY_PREDICT = profanity_predict
    except Exception:
        _PROFANITY_PREDICT = None

    _PROFANITY_READY = True

def _contains_profanity(text: str) -> bool:
    _init_profanity_libs()
    if not isinstance(text, str) or not text or _BETTER_PROFANITY is None:
        return False
    try:
        return bool(_BETTER_PROFANITY.contains_profanity(text))
    except Exception:
        return False

def _is_toxic(text: str) -> bool:
    _init_profanity_libs()
    if not isinstance(text, str) or not text or _PROFANITY_PREDICT is None:
        return False
    try:
        result = _PROFANITY_PREDICT([text])
        return bool(result and int(result[0]) == 1)
    except Exception:
        return False

def detect_prohibited_content(text: str) -> bool:
    if not isinstance(text, str) or not text:
        return False
    # Only use profanity check for technical data. 
    # Toxicity ML checks (_is_toxic) are too prone to false positives on numeric results.
    return _contains_profanity(text)

# ----------------------------
# User message validation
# ----------------------------

class UserMessageInput(BaseModel):
    # Keep schema constraints modest/stable; enforce the true env-driven limit in the validator.
    text: str = Field(..., min_length=1)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        max_len = limits()["MAX_USER_MESSAGE_LENGTH"]

        if detect_malicious_content(v):
            preview = sanitize_text(v, max_length=200)
            event("safety.flagged_prompt", {"reason": "malicious_content", "source": "user_message", "preview": preview})
            raise ValidationError(
                "Message contains potentially malicious content.",
                user_message=(
                    "This prompt has been flagged for containing potentially malicious or exploit-like content "
                    "(for example, scripts or attack payloads) and has been recorded. "
                    "The assistant cannot process this request. Please remove any harmful content and try again."
                ),
            )

        sanitized = sanitize_text(v, max_length=max_len)
        if not sanitized:
            raise ValidationError(
                "Message cannot be empty after sanitization.",
                user_message="Your message appears to be empty. Please provide a valid message.",
            )

        if detect_prohibited_content(sanitized):
            event("safety.flagged_prompt", {"reason": "profanity_or_toxicity", "source": "user_message", "preview": sanitized[:200]})
            raise ValidationError(
                "Message contains disallowed or unsafe content.",
                user_message=(
                    "This prompt has been flagged for containing profane, abusive, or otherwise unsafe content "
                    "and has been recorded. The assistant cannot help with this type of request. "
                    "Please rephrase it in a safe and respectful way."
                ),
            )

        return sanitized

# ----------------------------
# Tool call validation
# ----------------------------

_TOOL_NAME_RE = re.compile(r"^[a-zA-Z0-9_-]+(__[a-zA-Z0-9_-]+)*$")

class ToolArgumentInput(BaseModel):
    name: str = Field(..., min_length=1)
    arguments: Dict[str, Any] = Field(default_factory=dict)

    @field_validator("name")
    @classmethod
    def validate_tool_name(cls, v: str) -> str:
        max_len = limits()["MAX_TOOL_NAME_LENGTH"]

        if detect_malicious_content(v):
            raise ValidationError("Tool name contains potentially malicious content.", user_message="Invalid tool name provided.")

        sanitized = sanitize_text(v, max_length=max_len)
        if not _TOOL_NAME_RE.match(sanitized):
            raise ValidationError(f"Tool name '{sanitized}' has invalid format.", user_message="Invalid tool name format.")

        if detect_prohibited_content(sanitized):
            raise ValidationError("Tool name contains disallowed or unsafe content.", user_message="Invalid tool name provided.")

        return sanitized

    @field_validator("arguments")
    @classmethod
    def validate_arguments(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        max_bytes = limits()["MAX_TOOL_ARGUMENTS_SIZE"]

        if not isinstance(v, dict):
            raise ValidationError("Tool arguments must be a dictionary.", user_message="Invalid tool arguments format.")

        try:
            args_json = json.dumps(v, default=str)
        except (TypeError, ValueError) as e:
            raise ValidationError(
                f"Tool arguments cannot be serialized: {str(e)}",
                user_message="Invalid tool arguments format.",
            ) from e

        if len(args_json.encode("utf-8")) > max_bytes:
            raise ValidationError(
                f"Tool arguments exceed maximum size of {max_bytes} bytes.",
                user_message="Tool arguments are too large. Please reduce the input size.",
            )

        return cls._sanitize_dict(v)

    @classmethod
    def _sanitize_dict(cls, d: Dict[str, Any]) -> Dict[str, Any]:
        out: Dict[str, Any] = {}
        for key, value in d.items():
            if not isinstance(key, str):
                raise ValidationError("Tool argument keys must be strings.", user_message="Invalid tool arguments format.")
            if detect_malicious_content(key) or detect_prohibited_content(key):
                raise ValidationError("Tool argument key is not allowed.", user_message="Invalid tool arguments provided.")
            out[key] = cls._sanitize_value(value)
        return out

    @classmethod
    def _sanitize_list(cls, lst: list) -> list:
        return [cls._sanitize_value(x) for x in lst]

    @classmethod
    def _sanitize_value(cls, value: Any) -> Any:
        if isinstance(value, str):
            if detect_malicious_content(value) or detect_prohibited_content(value):
                raise ValidationError("Tool argument value is not allowed.", user_message="Invalid tool arguments provided.")
            return sanitize_text(value)
        if isinstance(value, (int, float, bool, type(None))):
            return value
        if isinstance(value, list):
            return cls._sanitize_list(value)
        if isinstance(value, dict):
            return cls._sanitize_dict(value)
        return sanitize_text(str(value))

# ----------------------------
# Activity validation (structural)
# ----------------------------

class ActivityValidation(BaseModel):
    type: str = Field(..., min_length=1)
    text: Optional[str] = None
    from_property: Optional[Dict[str, Any]] = None
    conversation: Optional[Dict[str, Any]] = None

    model_config = ConfigDict(populate_by_name=True, extra="allow")

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        allowed = {"message", "conversationUpdate", "typing", "endOfConversation", "installationUpdate"}
        if v not in allowed:
            raise ValidationError(f"Invalid activity type: {v}", user_message="Invalid request type.")
        return v

    @field_validator("text")
    @classmethod
    def validate_text_if_present(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        sanitized = sanitize_text(v, max_length=limits()["MAX_USER_MESSAGE_LENGTH"])
        if not sanitized:
            raise ValidationError("Message cannot be empty after sanitization.", user_message="Message content is required.")
        return sanitized

    @model_validator(mode="after")
    def validate_message_activity(self) -> "ActivityValidation":
        if self.type == "message" and not self.text:
            extras = getattr(self, "model_extra", None) or {}
            attachments = extras.get("attachments")
            has_attachments = isinstance(attachments, list) and len(attachments) > 0
            if not has_attachments:
                raise ValidationError("Message activity must have text or attachments.", user_message="Message content is required.")
        return self

# ----------------------------
# Public helpers
# ----------------------------

def validate_activity(activity_data: Dict[str, Any]) -> ActivityValidation:
    try:
        if "from" in activity_data and "from_property" not in activity_data:
            activity_data = dict(activity_data)
            activity_data["from_property"] = activity_data.pop("from")
        return ActivityValidation(**activity_data)
    except PydanticValidationError as e:
        errors = e.errors()
        if errors:
            first = errors[0]
            loc = first.get("loc", [])
            msg = first.get("msg", "Invalid input")
            field_str = ".".join(str(x) for x in loc) if loc else "input"
            raise ValidationError(
                f"Validation error in {field_str}: {msg}",
                user_message=f"Invalid {field_str}. Please check your input and try again.",
            ) from e
        raise ValidationError("Invalid activity structure.", user_message="Invalid request format.") from e

def validate_user_message(text: str) -> str:
    try:
        return UserMessageInput(text=text).text
    except PydanticValidationError as e:
        errors = e.errors()
        if errors:
            first = errors[0]
            loc = first.get("loc", [])
            msg = first.get("msg", "Invalid input")
            field_str = ".".join(str(x) for x in loc) if loc else "input"
            raise ValidationError(
                f"Validation error in {field_str}: {msg}",
                user_message=f"Invalid {field_str}. Please check your input and try again.",
            ) from e
        raise ValidationError("Invalid message format.", user_message="Your message format is invalid. Please try again.") from e

def validate_tool_call(tool_name: str, arguments: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    try:
        tool_input = ToolArgumentInput(name=tool_name, arguments=arguments)
        return tool_input.name, tool_input.arguments
    except PydanticValidationError as e:
        errors = e.errors()
        if errors:
            first = errors[0]
            loc = first.get("loc", [])
            msg = first.get("msg", "Invalid input")
            field_str = ".".join(str(x) for x in loc) if loc else "input"
            raise ValidationError(
                f"Validation error in {field_str}: {msg}",
                user_message=f"Invalid tool {field_str}. Please check your input and try again.",
            ) from e
        raise ValidationError("Invalid tool call format.", user_message="Invalid tool call format. Please try again.") from e

def enforce_output_safety(text: str) -> str:
    # Disable local output filtering for technical/engineering data
    # Upstream LLM provider (OpenAI/Azure) already enforces safety.
    # Local checks (better-profanity, etc.) are too prone to false positives on project names.
    return text
