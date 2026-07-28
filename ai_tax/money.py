"""Currency-safe decimal arithmetic and explicit tax rounding.

All monetary values in the system are `decimal.Decimal`. Floats are rejected
at construction time so binary-float drift can never enter a calculation.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

ZERO = Decimal("0")


def d(value) -> Decimal:
    """Build a Decimal safely. Floats are refused: pass str/int/Decimal."""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, bool):
        raise TypeError("bool is not a monetary value")
    if isinstance(value, int):
        return Decimal(value)
    if isinstance(value, str):
        return Decimal(value)
    if isinstance(value, float):
        raise TypeError(
            f"float {value!r} rejected: monetary values must be str, int, or Decimal"
        )
    raise TypeError(f"cannot convert {type(value).__name__} to Decimal")


def round_whole_dollar(value: Decimal) -> Decimal:
    """IRS whole-dollar rounding: half-up to 0 decimal places."""
    return value.quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def round_cents(value: Decimal) -> Decimal:
    """Round to cents, half-up."""
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def clamp_floor_zero(value: Decimal) -> Decimal:
    """Return max(value, 0) — the 'but not less than zero' rule on many lines."""
    return value if value > ZERO else ZERO
