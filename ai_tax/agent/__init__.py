"""Tax Planning Analyst Agent: orchestration and explanation layer.

The agent never calculates tax. It gathers structured assumptions, invokes the
deterministic engine through typed tools, creates scenarios, reconciles
results, explains changes using engine-produced values, and routes uncertain
or high-risk cases to human review. Guardrails live in code (tools.py), not
only in the prompt (policy.py).
"""
