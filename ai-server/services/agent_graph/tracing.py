"""LangSmith tracing helper for agent_graph nodes.

Provides a centralized way to build RunnableConfig with LangSmith callbacks,
and a lightweight trace_node decorator for structured logging.
"""

import functools
import logging
import os
from typing import Any, Callable

from langchain_core.callbacks.manager import CallbackManager
from langchain_core.runnables import RunnableConfig

logger = logging.getLogger(__name__)

# Prefer project-level config if available, otherwise fall back to os.environ
try:
    from config import (
        LANGSMITH_API_KEY,
        LANGSMITH_ENDPOINT,
        LANGSMITH_PROJECT,
        LANGSMITH_TRACING,
    )
except Exception:
    LANGSMITH_TRACING = os.getenv("LANGSMITH_TRACING", "false").lower() == "true"
    LANGSMITH_API_KEY = os.getenv("LANGSMITH_API_KEY", "")
    LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "jy-admin")
    LANGSMITH_ENDPOINT = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")


def _is_tracing_enabled() -> bool:
    """Check whether LangSmith/LangChain tracing is enabled and API key is present."""
    tracing_env = (
        os.getenv("LANGSMITH_TRACING", "false").lower() == "true"
        or os.getenv("LANGCHAIN_TRACING_V2", "false").lower() == "true"
    )
    return (LANGSMITH_TRACING or tracing_env) and bool(LANGSMITH_API_KEY)


def get_runnable_config(parent_config: RunnableConfig | None = None) -> RunnableConfig:
    """Return a RunnableConfig with LangSmith tracer when enabled.

    如果提供了 parent_config（通常来自 LangGraph 的流式/调用上下文），会保留其 callbacks
    并追加 LangSmith tracer，确保流式 token 与 tracing 不互相覆盖。

    Args:
        parent_config: 父 RunnableConfig，保留其 callbacks 和其他字段。

    Returns:
        RunnableConfig with merged callbacks list.
    """
    callbacks: list = []
    if parent_config and parent_config.get("callbacks"):
        parent_callbacks = parent_config["callbacks"]
        if isinstance(parent_callbacks, list):
            callbacks.extend(parent_callbacks)
        else:
            # CallbackManager 或 BaseCallbackManager：提取 handlers 避免 TypeError
            callbacks.extend(getattr(parent_callbacks, "handlers", []) or [])

    if _is_tracing_enabled():
        try:
            # langchain >= 0.3 exposes LangChainTracer in langchain_core.tracers
            from langchain_core.tracers import LangChainTracer

            tracer = LangChainTracer(
                project_name=LANGSMITH_PROJECT,
                client=None,  # uses default client with env key
            )
            callbacks.append(tracer)
            logger.debug("LangSmith tracer enabled for project '%s'", LANGSMITH_PROJECT)
        except Exception as exc:
            logger.warning("Failed to initialize LangSmith tracer: %s", exc)

    config = RunnableConfig(callbacks=callbacks)
    if parent_config:
        for key, value in parent_config.items():
            if key != "callbacks":
                config[key] = value
    return config


def trace_node(name: str) -> Callable:
    """Decorator / context-manager helper that logs node entry/exit with structured data.

    Usage as decorator:
        @trace_node("supervisor_node")
        def supervisor_node(state: AgentState) -> dict:
            ...

    Usage as context manager (inside a function):
        with trace_node("my_node"):
            ...
    """

    class _TraceNodeContext:
        def __enter__(self) -> "_TraceNodeContext":
            logger.info("[NODE_START] %s", name, extra={"node": name, "event": "start"})
            return self

        def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
            if exc_val:
                logger.error(
                    "[NODE_ERROR] %s: %s",
                    name,
                    exc_val,
                    extra={"node": name, "event": "error", "error": str(exc_val)},
                )
            else:
                logger.info("[NODE_END] %s", name, extra={"node": name, "event": "end"})

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            with _TraceNodeContext():
                return func(*args, **kwargs)

        return wrapper

    # Allow both @trace_node("name") and with trace_node("name"):
    # When called as decorator, return decorator; when used as context manager, return context object.
    # To support both, we return a small wrapper that detects call style.
    class _TraceNodeWrapper:
        def __call__(self, func: Callable) -> Callable:
            return decorator(func)

        def __enter__(self) -> _TraceNodeContext:
            return _TraceNodeContext().__enter__()

        def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
            _TraceNodeContext().__exit__(exc_type, exc_val, exc_tb)

    return _TraceNodeWrapper()
