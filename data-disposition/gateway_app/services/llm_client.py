# gateway_app/services/llm_client.py
from __future__ import annotations

from typing import List, Dict, Any, Optional, AsyncGenerator

from openai import AsyncOpenAI, OpenAI
from openai import APIError, APITimeoutError, OpenAIError, RateLimitError

from ..config.settings import settings
from .circuit_breaker import CircuitBreakerError, get_llm_circuit_breaker
from .exceptions import LLMError, LLMRateLimitError, LLMServiceError, LLMTimeoutError

_DEFAULT_TIMEOUT = float(settings.LLM_TIMEOUT_SECS)


def _raise_llm_error(exc: BaseException) -> None:
    if isinstance(exc, RateLimitError):
        raise LLMRateLimitError(
            "LLM rate limit exceeded.",
            user_message="The language model is temporarily busy. Please wait a moment and try again.",
            cause=exc,
        ) from exc

    if isinstance(exc, APITimeoutError):
        raise LLMTimeoutError(
            "LLM request timed out.",
            user_message="The language model took too long to respond. Please retry shortly.",
            cause=exc,
        ) from exc

    if isinstance(exc, APIError):
        status = getattr(exc, "status_code", None)
        user_msg = "The language model returned an error. Please try again."
        if status in {500, 502, 503}:
            user_msg = "The language model service is currently unavailable. Please try again later."
        raise LLMServiceError("LLM provider returned an error.", user_message=user_msg, cause=exc) from exc

    if isinstance(exc, OpenAIError):
        raise LLMServiceError(
            "LLM provider returned an error.",
            user_message="The language model encountered an error. Please retry.",
            cause=exc,
        ) from exc

    raise LLMError(
        "Unexpected LLM exception.",
        user_message="An unexpected error occurred while contacting the language model.",
        cause=exc,
    ) from exc


class LLMClient:
    """
    Thin wrapper around OpenAI SDK with:
    - circuit breaker
    - consistent error mapping
    - streaming generator for chat.completions
    """

    def __init__(self):
        common = {
            "api_key": settings.LLM_API_KEY,
            "base_url": str(settings.LLM_BASE_URL) if settings.LLM_BASE_URL else None,
            "timeout": _DEFAULT_TIMEOUT,
        }
        common = {k: v for k, v in common.items() if v is not None}

        self._model = settings.LLM_MODEL
        self.client = OpenAI(**common)
        self.async_client = AsyncOpenAI(**common)

    @property
    def model_name(self) -> str:
        return self._model

    def chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[str] = None,
        temperature: float = 1,
    ) -> Dict[str, Any]:
        kwargs: Dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": float(temperature),
            "max_completion_tokens": int(settings.LLM_MAX_OUTPUT_TOKENS),
        }
        if tools:
            kwargs["tools"] = tools
            if tool_choice is not None:
                kwargs["tool_choice"] = tool_choice

        circuit = get_llm_circuit_breaker()

        def _call() -> Dict[str, Any]:
            return self.client.chat.completions.create(**kwargs).model_dump()

        try:
            result = circuit.call(_call)
            if isinstance(result, dict) and result.get("error"):
                raise LLMServiceError(
                    result.get("message", "LLM service is temporarily unavailable."),
                    user_message=result.get(
                        "message",
                        "The language model service is currently unavailable. Please try again later.",
                    ),
                )
            return result
        except CircuitBreakerError as exc:
            raise LLMServiceError(
                "LLM service is temporarily unavailable (circuit breaker open).",
                user_message="The language model service is currently unavailable. Please try again later.",
            ) from exc
        except (LLMError, LLMServiceError):
            raise
        except Exception as exc:  # noqa: BLE001
            _raise_llm_error(exc)
            raise  # pragma: no cover

    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[str] = None,
        temperature: float = 1,
    ) -> AsyncGenerator[str, None]:
        kwargs: Dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": float(temperature),
            "stream": True,
            "max_completion_tokens": int(settings.LLM_MAX_OUTPUT_TOKENS),
        }
        if tools:
            kwargs["tools"] = tools
            if tool_choice is not None:
                kwargs["tool_choice"] = tool_choice

        circuit = get_llm_circuit_breaker()

        async def _create_stream():
            return await self.async_client.chat.completions.create(**kwargs)

        try:
            result = await circuit.call_async(_create_stream)
            if isinstance(result, dict) and result.get("error"):
                raise LLMServiceError(
                    result.get("message", "LLM service is temporarily unavailable."),
                    user_message=result.get(
                        "message",
                        "The language model service is currently unavailable. Please try again later.",
                    ),
                )
            stream = result
        except CircuitBreakerError as exc:
            raise LLMServiceError(
                "LLM service is temporarily unavailable (circuit breaker open).",
                user_message="The language model service is currently unavailable. Please try again later.",
            ) from exc
        except (LLMError, LLMServiceError):
            raise
        except Exception as exc:  # noqa: BLE001
            _raise_llm_error(exc)
            raise

        try:
            async for chunk in stream:
                delta = getattr(chunk.choices[0], "delta", None)
                part = getattr(delta, "content", None) if delta else None
                if part:
                    yield part
        except Exception as exc:  # noqa: BLE001
            _raise_llm_error(exc)
            raise
