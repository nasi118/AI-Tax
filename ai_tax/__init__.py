"""AI-Tax: deterministic tax calculation engine with a constrained planning agent.

Layering (see docs/ARCHITECTURE.md):
  1. rulesets      - immutable, versioned tax parameters (never in prompts)
  2. engine        - deterministic calculation authority
  3. store/scenarios - case, base-version lifecycle, scenario overrides
  4. agent         - orchestration/explanation layer over typed tools
  5. excel_audit   - permanent audit packages
"""

ENGINE_VERSION = "engine-0.1.0"
SCHEMA_VERSION = "schema-0.1.0"
