"""Agent runtime: drives an LLM against the typed toolkit.

Uses the Anthropic SDK when available. For tests and offline use, any
callable with the same signature as `AnthropicLLM.__call__` can be injected
(see tests/test_agent_behavior.py for a scripted stub) — the guardrails being
tested live in the toolkit, not in the model.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Optional

from .policy import SYSTEM_PROMPT, materiality_threshold_note
from .tools import AgentToolkit, ToolContext

# An LLM callable maps (system, messages, tool_definitions) -> assistant turn:
#   {"text": str | None, "tool_calls": [{"id": str, "name": str, "input": dict}]}
LLMCallable = Callable[[str, list[dict[str, Any]], list[dict[str, Any]]], dict[str, Any]]


@dataclass
class AgentTurn:
    text: Optional[str]
    tool_calls: list[dict[str, Any]]
    tool_results: list[dict[str, Any]]


class TaxPlanningAnalystAgent:
    def __init__(
        self,
        toolkit: AgentToolkit,
        ctx: ToolContext,
        llm: LLMCallable | None = None,
        materiality_threshold: str = "10000",
        max_tool_rounds: int = 24,
    ):
        self.toolkit = toolkit
        self.ctx = ctx
        self.llm = llm or self._default_llm()
        self.system = SYSTEM_PROMPT + materiality_threshold_note(materiality_threshold)
        self.max_tool_rounds = max_tool_rounds
        self.messages: list[dict[str, Any]] = []
        self.turn_log: list[AgentTurn] = []

    @staticmethod
    def _default_llm() -> LLMCallable:
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "anthropic SDK not installed; pass an llm callable or "
                "`pip install ai-tax[agent]`") from exc

        client = anthropic.Anthropic()

        def call(system: str, messages: list[dict[str, Any]],
                 tools: list[dict[str, Any]]) -> dict[str, Any]:  # pragma: no cover
            response = client.messages.create(
                model="claude-sonnet-5", max_tokens=4096,
                system=system, messages=messages, tools=tools)
            text_parts = [b.text for b in response.content if b.type == "text"]
            calls = [{"id": b.id, "name": b.name, "input": b.input}
                     for b in response.content if b.type == "tool_use"]
            return {"text": "\n".join(text_parts) or None, "tool_calls": calls}

        return call

    def run(self, user_message: str) -> str:
        """One conversational request, looping over tool calls until the model
        answers in text. The store — not this message list — is the system of
        record; the loop is bounded and every tool call is audited."""
        self.messages.append({"role": "user", "content": user_message})
        tools = self.toolkit.anthropic_tool_definitions()
        for _ in range(self.max_tool_rounds):
            turn = self.llm(self.system, self.messages, tools)
            calls = turn.get("tool_calls") or []
            if not calls:
                text = turn.get("text") or ""
                self.messages.append({"role": "assistant", "content": text})
                self.turn_log.append(AgentTurn(text=text, tool_calls=[], tool_results=[]))
                return text
            assistant_content: list[dict[str, Any]] = []
            if turn.get("text"):
                assistant_content.append({"type": "text", "text": turn["text"]})
            results_content: list[dict[str, Any]] = []
            tool_results: list[dict[str, Any]] = []
            for call in calls:
                assistant_content.append({"type": "tool_use", "id": call["id"],
                                          "name": call["name"], "input": call["input"]})
                result = self.toolkit.dispatch(self.ctx, call["name"], call["input"])
                tool_results.append(result)
                results_content.append({
                    "type": "tool_result", "tool_use_id": call["id"],
                    "content": json.dumps(result, default=str)})
            self.messages.append({"role": "assistant", "content": assistant_content})
            self.messages.append({"role": "user", "content": results_content})
            self.turn_log.append(AgentTurn(text=turn.get("text"), tool_calls=calls,
                                           tool_results=tool_results))
        return ("Tool-call budget exhausted before completion; the partial work is "
                "recorded in the case store and audit log.")
