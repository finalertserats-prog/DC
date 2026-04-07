# gateway_app/services/exceptions.py
"""Shared exception types for the Friday Gateway."""
from __future__ import annotations

from typing import Optional, List, Dict, Any


class GatewayException(Exception):
    """Base exception for all gateway errors."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        recovery_suggestion: Optional[str] = None,
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.user_message = user_message or message
        self.cause = cause
        self.recovery_suggestion = recovery_suggestion
        self.error_code = error_code or self.__class__.__name__
        self.details = details or {}

    def to_dict(self) -> Dict[str, Any]:
        """Convert exception to dictionary for API responses."""
        return {
            "error": self.error_code,
            "message": self.user_message,
            "details": self.details,
            "recovery_suggestion": self.recovery_suggestion,
        }


class ValidationError(GatewayException):
    """Raised when a request payload or parameters are invalid."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        field: Optional[str] = None,
        **kwargs,
    ):
        recovery = "Please check your input and try again."
        if field:
            recovery = f"Please check the '{field}' field and try again."
        
        details = kwargs.pop("details", {})
        if field:
            details["field"] = field
        
        super().__init__(
            message,
            user_message=user_message or "Invalid input provided.",
            cause=cause,
            recovery_suggestion=recovery,
            details=details,
            **kwargs,
        )


class ToolExecutionError(GatewayException):
    """Raised when a tool invocation fails."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        tool_name: Optional[str] = None,
        recovery_suggestion: Optional[str] = None,
        **kwargs,
    ):
        if recovery_suggestion is None:
            recovery_suggestion = "Please try again or contact support if the issue persists."
            if tool_name:
                recovery_suggestion = f"Please try again. If the issue with '{tool_name}' persists, contact support."
        
        details = kwargs.pop("details", {})
        if tool_name:
            details["tool_name"] = tool_name
        
        super().__init__(
            message,
            user_message=user_message or "Tool execution failed.",
            cause=cause,
            recovery_suggestion=recovery_suggestion,
            details=details,
            **kwargs,
        )


class LLMError(GatewayException):
    """Generic failure while communicating with the LLM provider."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        recovery_suggestion: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(
            message,
            user_message=user_message or "An error occurred while processing your request.",
            cause=cause,
            recovery_suggestion=recovery_suggestion or "Please try again. If the issue persists, contact support.",
            **kwargs,
        )


class LLMRateLimitError(LLMError):
    """Raised when the LLM provider reports a rate-limit condition."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        retry_after: Optional[float] = None,
        recovery_suggestion: Optional[str] = None,
        **kwargs,
    ):
        if recovery_suggestion is None:
            recovery_suggestion = "The service is temporarily busy. Please wait a moment and try again."
            if retry_after:
                recovery_suggestion = f"The service is temporarily busy. Please wait {int(retry_after)} seconds and try again."
        
        details = kwargs.pop("details", {})
        if retry_after:
            details["retry_after_seconds"] = retry_after
        
        super().__init__(
            message,
            user_message=user_message or "The language model is temporarily busy. Please wait a moment and try again.",
            cause=cause,
            recovery_suggestion=recovery_suggestion,
            details=details,
            **kwargs,
        )


class LLMTimeoutError(LLMError):
    """Raised when an LLM request times out."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        timeout_seconds: Optional[float] = None,
        recovery_suggestion: Optional[str] = None,
        **kwargs,
    ):
        if recovery_suggestion is None:
            recovery_suggestion = "The request took too long to process. Please try again with a simpler request."
            if timeout_seconds:
                recovery_suggestion = f"The request exceeded the {timeout_seconds}s timeout. Please try again with a simpler request."
        
        details = kwargs.pop("details", {})
        if timeout_seconds:
            details["timeout_seconds"] = timeout_seconds
        
        super().__init__(
            message,
            user_message=user_message or "The language model took too long to respond. Please retry shortly.",
            cause=cause,
            recovery_suggestion=recovery_suggestion,
            details=details,
            **kwargs,
        )


class LLMServiceError(LLMError):
    """Raised for non-retryable LLM failures."""
    def __init__(
        self,
        message: str,
        *,
        user_message: Optional[str] = None,
        cause: Optional[BaseException] = None,
        recovery_suggestion: Optional[str] = None,
        **kwargs,
    ):
        super().__init__(
            message,
            user_message=user_message or "The language model service is currently unavailable. Please try again later.",
            cause=cause,
            recovery_suggestion=recovery_suggestion or "The service may be experiencing issues. Please try again in a few minutes.",
            **kwargs,
        )
