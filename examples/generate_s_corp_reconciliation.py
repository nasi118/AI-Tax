#!/usr/bin/env python3
"""Generate a sample S-Corp reconciliation workbook.

This example demonstrates the three-rollforward methodology:
1. Schedule L: Book Equity Rollforward
2. Schedule M-1: Book-to-Tax Reconciliation
3. Schedule M-2: AAA Rollforward

Usage:
  python examples/generate_s_corp_reconciliation.py
"""

from pathlib import Path
import sys

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from ai_tax.s_corp_reconciliation import generate_s_corp_reconciliation_workbook

if __name__ == "__main__":
    out_dir = Path(__file__).parent / "output"
    out_dir.mkdir(exist_ok=True)

    print("Generating S-Corp Reconciliation Workbook...")
    out_path = generate_s_corp_reconciliation_workbook(
        case_id="SAMPLE-SCORP",
        tax_year=2025,
        out_dir=out_dir
    )
    print(f"✓ Workbook generated: {out_path}")
    print(f"  Sheets: Cover, Book Equity Rollforward, M-1 Book-to-Tax, M-2 AAA Rollforward, Instructions, Common Errors")
