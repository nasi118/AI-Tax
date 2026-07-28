from decimal import Decimal

import pytest

from ai_tax.money import d, round_whole_dollar
from ai_tax.rulesets import DEFAULT_REGISTRY, RulesetError
from ai_tax.schemas import FilingStatus


def test_floats_rejected():
    with pytest.raises(TypeError):
        d(1.5)
    assert d("1.50") == Decimal("1.50")
    assert d(3) == Decimal("3")


def test_whole_dollar_rounding_half_up():
    assert round_whole_dollar(d("2.50")) == 3
    assert round_whole_dollar(d("2.49")) == 2
    assert round_whole_dollar(d("-2.50")) == -3


def test_registry_serves_released_versions():
    rs = DEFAULT_REGISTRY.get("us-federal-2025-v1")
    assert rs.status == "enacted"
    assert rs.amount("standard_deduction", FilingStatus.SINGLE) == 15750
    assert rs.source_references


def test_unknown_and_missing_rulesets_rejected():
    with pytest.raises(RulesetError):
        DEFAULT_REGISTRY.get("us-federal-1999-v1")
    with pytest.raises(RulesetError):
        DEFAULT_REGISTRY.latest_for_year(2050)


def test_cross_year_pinning_rejected():
    with pytest.raises(RulesetError, match="never be mixed"):
        DEFAULT_REGISTRY.validate_pins({2026: "us-federal-2025-v1"})


def test_provisional_rulesets_labeled_with_policy():
    rs = DEFAULT_REGISTRY.get("us-federal-2027-v1")
    assert rs.is_provisional
    policy = rs.provisional_policy
    assert policy["source_year"] == 2025
    assert policy["projection_method"] == "inflation_linked"
    assert "PROVISIONAL" in policy["uncertainty_warning"]


def test_ruleset_parameters_read_only():
    rs = DEFAULT_REGISTRY.get("us-federal-2025-v1")
    with pytest.raises(TypeError):
        rs._params["standard_deduction"] = {}


def test_salt_cap_sunset_in_2030():
    assert DEFAULT_REGISTRY.get("us-federal-2029-v1").amount(
        "salt_cap", FilingStatus.SINGLE) > 40000
    assert DEFAULT_REGISTRY.get("us-federal-2030-v1").amount(
        "salt_cap", FilingStatus.SINGLE) == 10000
