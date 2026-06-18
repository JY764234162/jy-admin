"""Tests for message_helpers utilities."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from services.agent_graph.message_helpers import format_current_datetime_context


def test_format_current_datetime_context_contains_today():
    """format_current_datetime_context should include current date and time hint."""
    from datetime import datetime

    context = format_current_datetime_context()
    now = datetime.now()

    assert "当前时间" in context
    assert str(now.year) in context
    assert str(now.month) in context
    assert str(now.day) in context
    assert "回答涉及时效性的问题" in context
    assert "不要依赖自身训练数据中的知识截止时间" in context


def test_format_current_datetime_context_contains_weekday():
    """format_current_datetime_context should include Chinese weekday."""
    weekdays = {"周一", "周二", "周三", "周四", "周五", "周六", "周日"}
    context = format_current_datetime_context()
    assert any(day in context for day in weekdays)
