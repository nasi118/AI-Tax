"""S-Corp Schedule L / M-1 / M-2 / AAA reconciliation workbook generator.

Implements the three-rollforward methodology:
1. Book equity rollforward (Schedule L)
2. M-1 book-to-tax reconciliation
3. AAA rollforward (Schedule M-2)

Key principles:
- Schedule L reflects accrual books (if that's the company's accounting method)
- M-1 reconciles book income to tax income (AR/AP timing, depreciation, etc.)
- M-2 rolls AAA forward from tax items only, never from balance sheet timing differences
- AR/AP changes belong in M-1, never in M-2
- AAA, stock basis, and retained earnings are three separate accounts that do not reconcile to each other
"""

from __future__ import annotations

from pathlib import Path
from decimal import Decimal
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.utils import get_column_letter


class SCorporationReconciliationBuilder:
    """Build an S-corp reconciliation workbook with three separate rollforwards."""

    def __init__(self, case_id: str, tax_year: int):
        self.case_id = case_id
        self.tax_year = tax_year
        self.wb = Workbook()

        # Style definitions
        self.HEADER_FILL = PatternFill("solid", start_color="4472C4")
        self.HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
        self.SECTION_FILL = PatternFill("solid", start_color="D9E1F2")
        self.SECTION_FONT = Font(bold=True, size=10)
        self.SUBTOTAL_FILL = PatternFill("solid", start_color="E7E6E6")
        self.SUBTOTAL_FONT = Font(bold=True)
        self.TOTAL_FILL = PatternFill("solid", start_color="92D050")
        self.TOTAL_FONT = Font(bold=True, color="FFFFFF")
        self.HIGHLIGHT_FILL = PatternFill("solid", start_color="FFC7CE")
        self.LIGHT_FILL = PatternFill("solid", start_color="F2F2F2")

        self.BORDER = Border(
            left=Side(style='thin'),
            right=Side(style='thin'),
            top=Side(style='thin'),
            bottom=Side(style='thin')
        )

    def build(self, out_path: Path) -> Path:
        """Generate the complete reconciliation workbook."""
        self.wb.remove(self.wb.active)
        self._cover_sheet()
        self._book_equity_rollforward()
        self._m1_reconciliation()
        self._aaa_rollforward()
        self._instructions()
        self._common_errors()

        out_path.parent.mkdir(parents=True, exist_ok=True)
        self.wb.save(out_path)
        return out_path

    def _header(self, ws, row: int, headers: list[str]) -> None:
        """Write a styled header row."""
        for col, text in enumerate(headers, start=1):
            cell = ws.cell(row=row, column=col, value=text)
            cell.font = self.HEADER_FONT
            cell.fill = self.HEADER_FILL
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = self.BORDER

    def _section_header(self, ws, row: int, text: str, columns: int = 3) -> None:
        """Write a section header spanning multiple columns."""
        cell = ws.cell(row=row, column=1, value=text)
        cell.font = self.SECTION_FONT
        cell.fill = self.SECTION_FILL
        cell.border = self.BORDER
        for col in range(2, columns + 1):
            c = ws.cell(row=row, column=col)
            c.fill = self.SECTION_FILL
            c.border = self.BORDER
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=columns)

    def _cover_sheet(self) -> None:
        """Create a cover sheet with instructions and overview."""
        ws = self.wb.create_sheet("Cover")
        ws["A1"] = "S-Corporation Schedule L / M-1 / M-2 / AAA Reconciliation"
        ws["A1"].font = Font(bold=True, size=14)

        rows = [
            ("Case", self.case_id),
            ("Tax Year", self.tax_year),
            ("", ""),
            ("Purpose", "Validate that Schedule L (Balance Sheet), Schedule M-1 (Book/Tax Reconciliation), "
                       "and Schedule M-2 (AAA Rollforward) are properly constructed and reconcile correctly."),
            ("", ""),
            ("Key Principles", ""),
            ("• Schedule L", "Reflects the company's actual books (accrual if that's the method used)"),
            ("• Schedule M-1", "Reconciles book net income to taxable income (AR/AP timing, depreciation, meals, etc.)"),
            ("• Schedule M-2", "Rolls forward AAA from TAX ITEMS ONLY, never from balance sheet timing differences"),
            ("• AR/AP Changes", "Belong in M-1 (book-to-tax), never in M-2 as separate line items"),
            ("• Three Accounts", "Retained Earnings (book), AAA (corporate tax), and Shareholder Basis (shareholder-level) "
                              "do NOT reconcile to each other"),
            ("", ""),
            ("Workbook Contents", ""),
            ("1. Book Equity Rollforward", "Beginning RE + Book NI - Distributions = Ending RE (Schedule L)"),
            ("2. M-1 Reconciliation", "Book NI ± Timing Adjustments ± Permanent Differences = Taxable Income (K-1 L18)"),
            ("3. AAA Rollforward", "Beginning AAA + Taxable Items - Losses/Deductions - Nondeductibles - Distributions = Ending AAA"),
            ("4. Instructions", "Detailed methodology and common errors"),
            ("5. Common Errors", "Red flags and how to fix them"),
        ]

        for i, (k, v) in enumerate(rows, start=3):
            k_cell = ws.cell(row=i, column=1, value=k)
            v_cell = ws.cell(row=i, column=2, value=v)
            if k and not k.startswith("•"):
                k_cell.font = Font(bold=True)
            v_cell.alignment = Alignment(wrap_text=True, vertical="top")

        ws.column_dimensions["A"].width = 22
        ws.column_dimensions["B"].width = 120
        for row in range(3, len(rows) + 3):
            ws.row_dimensions[row].height = None

    def _book_equity_rollforward(self) -> None:
        """Create Schedule L / Book Equity Rollforward sheet."""
        ws = self.wb.create_sheet("Book Equity Rollforward")

        ws["A1"] = "Schedule L: Book Equity Rollforward"
        ws["A1"].font = Font(bold=True, size=12)
        ws["A2"] = f"Tax Year {self.tax_year}"

        row = 4

        # Header
        self._header(ws, row, ["Description", "Amount", "Source"])
        row += 1

        # Template data
        lines = [
            ("Beginning retained earnings / stockholders' equity", 1500000, "Prior year Schedule L"),
            ("", None, ""),
            ("Add: Book net income (loss)", 350000, "From company's financial statements"),
            ("Less: Distributions / dividends paid", -75000, "From capital account or declaration records"),
            ("Add/(Less): Book adjustments (if any)", 0, "e.g., capital contributions, revaluations"),
            ("", None, ""),
            ("Ending retained earnings / equity (Schedule L, Bal. Sheet)", 1775000, "Must equal Schedule L balance sheet"),
        ]

        for desc, amount, source in lines:
            if desc == "":
                row += 1
                continue

            desc_cell = ws.cell(row=row, column=1, value=desc)
            desc_cell.border = self.BORDER

            if "Ending retained earnings" in desc:
                desc_cell.font = self.TOTAL_FONT
                desc_cell.fill = self.TOTAL_FILL
            elif "Add:" in desc or "Less:" in desc:
                desc_cell.font = self.SUBTOTAL_FONT

            if amount is not None:
                amt_cell = ws.cell(row=row, column=2, value=amount)
                amt_cell.number_format = '#,##0'
                amt_cell.border = self.BORDER
                amt_cell.alignment = Alignment(horizontal="right")

                if "Ending retained earnings" in desc:
                    amt_cell.font = self.TOTAL_FONT
                    amt_cell.fill = self.TOTAL_FILL

            src_cell = ws.cell(row=row, column=3, value=source)
            src_cell.border = self.BORDER
            src_cell.font = Font(italic=True, size=9)
            src_cell.alignment = Alignment(wrap_text=True)

            row += 1

        ws.column_dimensions["A"].width = 55
        ws.column_dimensions["B"].width = 18
        ws.column_dimensions["C"].width = 50

    def _m1_reconciliation(self) -> None:
        """Create Schedule M-1 Book-to-Tax Reconciliation sheet."""
        ws = self.wb.create_sheet("M-1 Book-to-Tax")

        ws["A1"] = "Schedule M-1: Book Income to Taxable Income Reconciliation"
        ws["A1"].font = Font(bold=True, size=12)
        ws["A2"] = f"Tax Year {self.tax_year}"
        ws["A3"] = "(Where different accounting methods used for books and tax return)"
        ws["A3"].font = Font(italic=True, size=10)

        row = 5

        # Header
        self._header(ws, row, ["Description", "Book Amount", "Adjustment", "Tax Amount", "Notes"])
        row += 1

        # Book net income
        self._section_header(ws, row, "Book Starting Point", columns=5)
        row += 1

        lines_1 = [
            ("Book net income (from financial statements)", 350000, None, None, "From company books"),
        ]

        for desc, book_amt, adj, tax_amt, notes in lines_1:
            ws.cell(row=row, column=1, value=desc).border = self.BORDER
            ws.cell(row=row, column=2, value=book_amt).number_format = '#,##0'
            ws.cell(row=row, column=2).border = self.BORDER
            ws.cell(row=row, column=2).alignment = Alignment(horizontal="right")
            ws.cell(row=row, column=5, value=notes).border = self.BORDER
            ws.cell(row=row, column=5).font = Font(italic=True, size=9)
            row += 1

        row += 1
        self._section_header(ws, row, "Timing Adjustments (Book Method vs. Tax Method)", columns=5)
        row += 1

        # Timing adjustments
        lines_2 = [
            ("Accounts receivable increase", -100000, 100000, None, "Cash basis: not yet collected; accrual basis: included in book revenue"),
            ("Accounts payable increase", 60000, -60000, None, "Cash basis: not yet paid; accrual basis: included in book deductions"),
            ("Inventory change", 25000, -25000, None, "If company uses different inventory methods for book vs. tax"),
        ]

        for desc, book_amt, adj, tax_amt, notes in lines_2:
            ws.cell(row=row, column=1, value=desc).border = self.BORDER
            if book_amt is not None:
                ws.cell(row=row, column=2, value=book_amt).number_format = '#,##0'
                ws.cell(row=row, column=2).border = self.BORDER
                ws.cell(row=row, column=2).alignment = Alignment(horizontal="right")
            if adj is not None:
                ws.cell(row=row, column=3, value=adj).number_format = '#,##0'
                ws.cell(row=row, column=3).border = self.BORDER
                ws.cell(row=row, column=3).alignment = Alignment(horizontal="right")
            ws.cell(row=row, column=5, value=notes).border = self.BORDER
            ws.cell(row=row, column=5).font = Font(italic=True, size=9)
            ws.cell(row=row, column=5).alignment = Alignment(wrap_text=True)
            row += 1

        row += 1
        self._section_header(ws, row, "Permanent Differences (Non-deductible Items)", columns=5)
        row += 1

        # Permanent differences
        lines_3 = [
            ("Meals and entertainment (50% not deductible)", 8000, -4000, None, "Book expense includes full amount; tax only allows 50%"),
            ("Life insurance premiums (not deductible)", 5000, -5000, None, "Book expense not allowed for tax"),
            ("Tax penalties and interest", 3000, -3000, None, "Not deductible for federal tax"),
        ]

        for desc, book_amt, adj, tax_amt, notes in lines_3:
            ws.cell(row=row, column=1, value=desc).border = self.BORDER
            if book_amt is not None:
                ws.cell(row=row, column=2, value=book_amt).number_format = '#,##0'
                ws.cell(row=row, column=2).border = self.BORDER
                ws.cell(row=row, column=2).alignment = Alignment(horizontal="right")
            if adj is not None:
                ws.cell(row=row, column=3, value=adj).number_format = '#,##0'
                ws.cell(row=row, column=3).border = self.BORDER
                ws.cell(row=row, column=3).alignment = Alignment(horizontal="right")
            ws.cell(row=row, column=5, value=notes).border = self.BORDER
            ws.cell(row=row, column=5).font = Font(italic=True, size=9)
            ws.cell(row=row, column=5).alignment = Alignment(wrap_text=True)
            row += 1

        row += 1
        self._section_header(ws, row, "Tax Adjustments (Depreciation, etc.)", columns=5)
        row += 1

        # Tax-specific adjustments
        lines_4 = [
            ("Book depreciation", -50000, None, None, "Book method (straight-line)"),
            ("Tax depreciation (MACRS)", None, -65000, None, "Accelerated depreciation for tax (§168)"),
            ("Net depreciation difference", None, -15000, None, "Additional tax deduction (timing benefit)"),
        ]

        for desc, book_amt, adj, tax_amt, notes in lines_4:
            ws.cell(row=row, column=1, value=desc).border = self.BORDER
            if book_amt is not None:
                ws.cell(row=row, column=2, value=book_amt).number_format = '#,##0'
                ws.cell(row=row, column=2).border = self.BORDER
                ws.cell(row=row, column=2).alignment = Alignment(horizontal="right")
            if adj is not None:
                ws.cell(row=row, column=3, value=adj).number_format = '#,##0'
                ws.cell(row=row, column=3).border = self.BORDER
                ws.cell(row=row, column=3).alignment = Alignment(horizontal="right")
            ws.cell(row=row, column=5, value=notes).border = self.BORDER
            ws.cell(row=row, column=5).font = Font(italic=True, size=9)
            row += 1

        row += 2

        # Totals
        total_row = row
        ws.cell(row=total_row, column=1, value="Taxable Income (Schedule K, Line 18)").font = self.TOTAL_FONT
        ws.cell(row=total_row, column=1).fill = self.TOTAL_FILL
        ws.cell(row=total_row, column=1).border = self.BORDER

        # Calculate totals
        book_ni = 350000
        timing_adj = 100000 - 60000 - 25000  # = 15000
        perm_adj = -4000 - 5000 - 3000  # = -12000
        tax_adj = -15000
        taxable_income = book_ni + timing_adj + perm_adj + tax_adj

        ws.cell(row=total_row, column=2, value=book_ni).number_format = '#,##0'
        ws.cell(row=total_row, column=2).fill = self.TOTAL_FILL
        ws.cell(row=total_row, column=2).border = self.BORDER
        ws.cell(row=total_row, column=2).alignment = Alignment(horizontal="right")

        ws.cell(row=total_row, column=3, value=timing_adj + perm_adj + tax_adj).number_format = '#,##0'
        ws.cell(row=total_row, column=3).fill = self.TOTAL_FILL
        ws.cell(row=total_row, column=3).border = self.BORDER
        ws.cell(row=total_row, column=3).alignment = Alignment(horizontal="right")

        ws.cell(row=total_row, column=4, value=taxable_income).number_format = '#,##0'
        ws.cell(row=total_row, column=4).fill = self.TOTAL_FILL
        ws.cell(row=total_row, column=4).border = self.BORDER
        ws.cell(row=total_row, column=4).alignment = Alignment(horizontal="right")

        ws.cell(row=total_row, column=5, value="This amount ties to K-1 Line 18").border = self.BORDER
        ws.cell(row=total_row, column=5).fill = self.TOTAL_FILL

        ws.column_dimensions["A"].width = 55
        ws.column_dimensions["B"].width = 16
        ws.column_dimensions["C"].width = 16
        ws.column_dimensions["D"].width = 16
        ws.column_dimensions["E"].width = 50

    def _aaa_rollforward(self) -> None:
        """Create Schedule M-2 AAA Rollforward sheet."""
        ws = self.wb.create_sheet("M-2 AAA Rollforward")

        ws["A1"] = "Schedule M-2: Accumulated Adjustments Account (AAA) Rollforward"
        ws["A1"].font = Font(bold=True, size=12)
        ws["A2"] = f"Tax Year {self.tax_year}"
        ws["A3"] = "(Using TAX ITEMS ONLY; NOT starting from book retained earnings)"
        ws["A3"].font = Font(italic=True, size=10)

        row = 5

        # Header
        self._header(ws, row, ["Description", "Amount", "Source / Calculation"])
        row += 1

        # Beginning AAA
        self._section_header(ws, row, "Beginning AAA", columns=3)
        row += 1

        beg_aaa = 1200000
        lines = [
            ("Beginning AAA (from prior year Schedule M-2)", beg_aaa, "Prior year ending AAA"),
        ]

        for desc, amount, source in lines:
            ws.cell(row=row, column=1, value=desc).border = self.BORDER
            ws.cell(row=row, column=2, value=amount).number_format = '#,##0'
            ws.cell(row=row, column=2).border = self.BORDER
            ws.cell(row=row, column=2).alignment = Alignment(horizontal="right")
            ws.cell(row=row, column=3, value=source).border = self.BORDER
            ws.cell(row=row, column=3).font = Font(italic=True, size=9)
            row += 1

        row += 1
        self._section_header(ws, row, "Taxable Income Items (AAA Increases)", columns=3)
        row += 1

        # Taxable income increases
        ti_lines = [
            ("Ordinary taxable income (from Schedule K, Line 18)", 338000, "M-1 reconciliation result"),
            ("Tax-exempt income", 0, "N/A for this example"),
        ]

        ti_total = 338000

        for desc, amount, source in ti_lines:
            ws.cell(row=row, column=1, value=desc).border = self.BORDER
            ws.cell(row=row, column=2, value=amount).number_format = '#,##0'
            ws.cell(row=row, column=2).border = self.BORDER
            ws.cell(row=row, column=2).alignment = Alignment(horizontal="right")
            ws.cell(row=row, column=3, value=source).border = self.BORDER
            ws.cell(row=row, column=3).font = Font(italic=True, size=9)
            row += 1

        row += 1
        self._section_header(ws, row, "Deductible Items (AAA Decreases)", columns=3)
        row += 1

        # Deductible decreases
        ded_lines = [
            ("Ordinary business losses", -5000, "From Schedule K, Form 1120-S"),
            ("Deductible loss items (capital losses, etc.)", -2000, "Separately stated deductions"),
            ("Nondeductible expenses (life insurance, meals ≥50% disallowed, penalties)", -12000, "Permanent book-to-tax differences"),
        ]

        ded_total = -5000 - 2000 - 12000

        for desc, amount, source in ded_lines:
            ws.cell(row=row, column=1, value=desc).border = self.BORDER
            ws.cell(row=row, column=2, value=amount).number_format = '#,##0'
            ws.cell(row=row, column=2).border = self.BORDER
            ws.cell(row=row, column=2).alignment = Alignment(horizontal="right")
            ws.cell(row=row, column=3, value=source).border = self.BORDER
            ws.cell(row=row, column=3).font = Font(italic=True, size=9)
            row += 1

        row += 1
        self._section_header(ws, row, "Distributions (AAA Decreases)", columns=3)
        row += 1

        dist_total = -75000
        lines_dist = [
            ("Cash distributions paid to shareholders", dist_total, "From Schedule M-2 Line 4 or capital records"),
        ]

        for desc, amount, source in lines_dist:
            ws.cell(row=row, column=1, value=desc).border = self.BORDER
            ws.cell(row=row, column=2, value=amount).number_format = '#,##0'
            ws.cell(row=row, column=2).border = self.BORDER
            ws.cell(row=row, column=2).alignment = Alignment(horizontal="right")
            ws.cell(row=row, column=3, value=source).border = self.BORDER
            ws.cell(row=row, column=3).font = Font(italic=True, size=9)
            row += 1

        row += 2

        # Ending AAA
        ending_aaa = beg_aaa + ti_total + ded_total + dist_total

        total_row = row
        ws.cell(row=total_row, column=1, value="Ending AAA (Schedule M-2, Line 3)").font = self.TOTAL_FONT
        ws.cell(row=total_row, column=1).fill = self.TOTAL_FILL
        ws.cell(row=total_row, column=1).border = self.BORDER

        ws.cell(row=total_row, column=2, value=ending_aaa).number_format = '#,##0'
        ws.cell(row=total_row, column=2).fill = self.TOTAL_FILL
        ws.cell(row=total_row, column=2).border = self.BORDER
        ws.cell(row=total_row, column=2).alignment = Alignment(horizontal="right")
        ws.cell(row=total_row, column=2).font = self.TOTAL_FONT

        ws.cell(row=total_row, column=3, value="Roll to next year M-2, Line 1").border = self.BORDER
        ws.cell(row=total_row, column=3).fill = self.TOTAL_FILL
        ws.cell(row=total_row, column=3).font = Font(italic=True, size=9)

        row += 2

        # Add important note
        note_row = row
        ws.cell(row=note_row, column=1, value="⚠ CRITICAL: Do NOT roll AR/AP changes as separate line items in AAA")
        ws.cell(row=note_row, column=1).fill = self.HIGHLIGHT_FILL
        ws.cell(row=note_row, column=1).font = Font(bold=True, color="C00000")
        ws.merge_cells(start_row=note_row, start_column=1, end_row=note_row, end_column=3)

        row += 1
        ws.cell(row=row, column=1,
                value="AR/AP timing differences impact AAA ONLY through their effect on the tax return's "
                      "taxable income or deductions (captured in the M-1 reconciliation and then in Ordinary Taxable Income above). "
                      "They should never appear as separate 'other increases' or 'other decreases' in M-2.")
        ws.cell(row=row, column=1).alignment = Alignment(wrap_text=True)
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=3)

        ws.column_dimensions["A"].width = 65
        ws.column_dimensions["B"].width = 18
        ws.column_dimensions["C"].width = 55

    def _instructions(self) -> None:
        """Create detailed instructions sheet."""
        ws = self.wb.create_sheet("Instructions")

        ws["A1"] = "Detailed Reconciliation Methodology"
        ws["A1"].font = Font(bold=True, size=12)

        row = 3
        sections = [
            ("Overview", [
                "This workbook validates the three key tax accounts that must roll forward correctly for an S-corporation tax return:",
                "  1. Schedule L: Book Equity (balance sheet retained earnings)",
                "  2. Schedule M-1: Book Income to Taxable Income Reconciliation",
                "  3. Schedule M-2: AAA (Accumulated Adjustments Account) Rollforward",
                "",
                "These three accounts are SEPARATE and do NOT reconcile to each other.",
            ]),
            ("Schedule L: Book Equity Rollforward", [
                "• Purpose: Reconcile the company's book retained earnings from beginning to ending period",
                "• Method: Beginning RE + Book NI - Distributions ± Other Book Adjustments = Ending RE",
                "• Source: The company's actual financial statements and records",
                "• Must Match: Schedule L balance sheet (capital accounts or retained earnings line)",
                "• Reflects: The company's actual accounting method (accrual, cash, or hybrid)",
                "",
                "Example:",
                "  Beginning RE:        $1,500,000",
                "  Book NI:              +$350,000",
                "  Distributions:         -$75,000",
                "  Ending RE:            $1,775,000",
            ]),
            ("Schedule M-1: Book-to-Tax Reconciliation", [
                "• Purpose: Convert book net income (per company books) to taxable income (per tax return)",
                "• Method: Start with Book NI, then add/subtract all differences between book method and tax method",
                "",
                "Typical Adjustments:",
                "",
                "TIMING ADJUSTMENTS (reverse in future years):",
                "  • Accounts Receivable increase: If books use accrual but tax return uses cash, "
                "    AR increase is book revenue but not tax revenue (subtract from taxable income)",
                "  • Accounts Payable increase: If books use accrual but tax return uses cash, "
                "    AP increase is book expense but not tax deduction (add to taxable income)",
                "  • Depreciation differences: Book uses one method (e.g., straight-line), tax uses MACRS",
                "",
                "PERMANENT ADJUSTMENTS (never reverse):",
                "  • Meals & entertainment: Book includes full amount, tax only allows 50% (subtract)",
                "  • Life insurance premiums: Not deductible for tax (subtract)",
                "  • Fines, penalties, interest: Not deductible for tax (subtract)",
                "  • Tax-exempt interest: Not includable in taxable income (subtract)",
                "",
                "CRITICAL RULE:",
                "  Schedule K, Line 18 (taxable income) MUST equal the bottom line of this reconciliation.",
                "  If you cannot make M-1 tie to K-1 L18, you have an error in the reconciliation.",
            ]),
            ("Schedule M-2: AAA Rollforward", [
                "• Purpose: Track Accumulated Adjustments Account (the corporate-level pool of "
                "  post-1986 undistributed taxable income available for tax-free distributions)",
                "",
                "• Method: Begin AAA + Taxable Income - Losses/Deductions - Nondeductible Expenses - Distributions = Ending AAA",
                "",
                "KEY PRINCIPLE: Use ONLY tax items; do NOT start with book retained earnings",
                "",
                "AAA INCREASES (from Schedule K taxable items):",
                "  • Ordinary taxable income from M-1 reconciliation",
                "  • Separately stated income items (capital gains, etc.)",
                "  • Tax-exempt income (e.g., municipal bond interest)",
                "",
                "AAA DECREASES:",
                "  • Ordinary losses",
                "  • Separately stated deductible losses",
                "  • Nondeductible expenses (meals disallowed, penalties, etc.) — these reduce AAA",
                "  • Distributions to shareholders",
                "",
                "DO NOT INCLUDE in AAA:",
                "  • Book retained earnings or book equity",
                "  • AR/AP timing differences as separate line items (they affect AAA only via M-1 taxable income)",
                "  • Balance sheet changes that are not tax items",
                "",
                "Why AAA ≠ Stock Basis:",
                "  • AAA is corporate-level; basis is per-shareholder",
                "  • Basis includes capital contributions; AAA generally does not",
                "  • Each shareholder may have different basis",
                "  • Basis is computed using Form 7203 when applicable",
            ]),
            ("The Three Accounts Do NOT Reconcile to Each Other", [
                "This is a common error. Practitioners sometimes try to force:",
                "  • Schedule L ending RE = Schedule M-2 ending AAA = shareholder stock basis",
                "",
                "This is WRONG. These three accounts are independent:",
                "",
                "RETAINED EARNINGS (Book account)",
                "  • Reflects accrual financial statements",
                "  • Includes all book income and expenses",
                "  • Is affected by book policy choices (depreciation method, inventory method, etc.)",
                "  • Example ending: $1,775,000",
                "",
                "AAA (Corporate tax account)",
                "  • Reflects post-1986 taxable income only",
                "  • Does NOT include book retained earnings from prior to 1986 or S-corp election",
                "  • Uses tax method calculations (MACRS depreciation, etc.)",
                "  • Example ending: $1,461,000 (different from RE due to timing differences, nondeductible expenses)",
                "",
                "SHAREHOLDER STOCK BASIS (Shareholder-level account)",
                "  • Different for each shareholder",
                "  • Includes capital contributions, which AAA does not",
                "  • Computed per §1367 using Form 7203",
                "  • Cannot be negative in the way AAA can",
                "  • Example per shareholder: $800,000 (different again)",
            ]),
        ]

        for section_title, bullets in sections:
            ws.cell(row=row, column=1, value=section_title).font = Font(bold=True, size=11)
            row += 1
            for bullet in bullets:
                ws.cell(row=row, column=1, value=bullet).alignment = Alignment(wrap_text=True)
                ws.row_dimensions[row].height = None
                row += 1
            row += 1

        ws.column_dimensions["A"].width = 95

    def _common_errors(self) -> None:
        """Create common errors and red flags sheet."""
        ws = self.wb.create_sheet("Common Errors")

        ws["A1"] = "Common Errors in S-Corp Reconciliation & Red Flags"
        ws["A1"].font = Font(bold=True, size=12)

        row = 3

        errors = [
            ("AR/AP in M-2 as Separate Line Items", [
                "RED FLAG: 'Other increases/decreases in M-2 for 'Increase in AR' or 'Decrease in AP'",
                "",
                "WHY IT'S WRONG:",
                "  • Accounts receivable and payable are balance sheet (book) items",
                "  • They create timing differences between book and tax methods",
                "  • These timing differences belong in Schedule M-1, not M-2",
                "  • M-2 should only reflect tax items, not book balance sheet changes",
                "",
                "HOW TO FIX:",
                "  1. Remove any AR/AP line items from Schedule M-2",
                "  2. Ensure the AR and AP changes are captured in Schedule M-1 "
                "     as adjustments between book net income and taxable income",
                "  3. Schedule K, Line 18 should reflect the post-M-1 taxable income",
                "  4. Then, AAA rolls forward using only that taxable income (not AR/AP separately)",
            ]),
            ("Using Book Retained Earnings as the Starting Point for AAA", [
                "RED FLAG: 'Beginning AAA = Prior Year Schedule L Ending Retained Earnings'",
                "",
                "WHY IT'S WRONG:",
                "  • Book RE includes accrual expenses and revenues",
                "  • AAA is based on taxable income, not book income",
                "  • If the company switched from C to S status, or has pre-86 account balances, "
                "    book RE is not AAA",
                "  • This causes AAA to appear inflated or understated",
                "",
                "HOW TO FIX:",
                "  1. Use the prior year Schedule M-2 ending AAA (line 3)",
                "  2. Roll AAA forward based on current-year tax items only",
                "  3. Book RE and AAA will diverge over time due to timing differences "
                "     and nondeductible expenses",
            ]),
            ("Forcing AAA to Match Stock Basis or Retained Earnings", [
                "RED FLAG: Adjustments in M-2 'other accounts' designed to make AAA = "
                "          ending book RE or shareholder basis",
                "",
                "WHY IT'S WRONG:",
                "  • These accounts are computationally independent",
                "  • Shareholders may have different basis (different purchase prices or contributions)",
                "  • Basis includes capital contributions that AAA does not",
                "  • Nondeductible expenses reduce AAA but not book RE",
                "  • There is no IRS requirement that they be equal",
                "",
                "HOW TO FIX:",
                "  • Compute each account independently",
                "  • Do not force artificial adjustments to create a match",
            ]),
            ("Not Reconciling M-1 Line 8 to Schedule K, Line 18", [
                "RED FLAG: Schedule K, line 18 (taxable income) does not equal "
                "          the bottom line of Schedule M-1",
                "",
                "WHY IT'S WRONG:",
                "  • This is an explicit IRS requirement",
                "  • Indicates errors in the M-1 reconciliation",
                "  • May mean AR/AP or other items are being double-counted",
                "",
                "HOW TO FIX:",
                "  1. Recalculate M-1 from scratch",
                "  2. Verify each line item (AR change, AP change, depreciation, nondeductibles)",
                "  3. Ensure no item is captured both in M-1 and separately in M-2",
                "  4. Reconcile to the actual tax return line items and Forms 1040, K-1, etc.",
            ]),
            ("Timing Adjustments Not Reversing in Future Years", [
                "RED FLAG: AR/AP adjustments made in one year but not reversed "
                "          when collected/paid in future years",
                "",
                "WHY IT'S WRONG:",
                "  • Timing adjustments must reverse",
                "  • An AR increase of $100k in Year 1 means a $100k decrease in Year 2 when collected",
                "  • Failure to reverse creates a permanent under/overstatement of taxable income",
                "",
                "HOW TO FIX:",
                "  • Set up a multi-year M-1 template",
                "  • Track all timing adjustments",
                "  • Verify reversals in subsequent years",
                "  • Use the 'Assumptions by Year' or similar tracking sheet in audit package",
            ]),
            ("Omitting Nondeductible Expenses from M-2", [
                "RED FLAG: Meals, penalties, life insurance, etc., appear "
                "          in M-1 as reductions to taxable income but NOT in M-2",
                "",
                "WHY IT'S WRONG:",
                "  • Nondeductible expenses reduce AAA",
                "  • They are not taxable income, so they do not increase AAA",
                "  • Omitting them overstates ending AAA",
                "",
                "HOW TO FIX:",
                "  • Identify all nondeductible expenses (50% of meals, fines, penalties, "
                "    life insurance, political contributions, club dues, etc.)",
                "  • Include them as AAA decreases in Schedule M-2",
                "  • Total nondeductible expenses should tie between M-1 and M-2 roles",
            ]),
        ]

        for error_title, details in errors:
            # Error title with red background
            title_cell = ws.cell(row=row, column=1, value=error_title)
            title_cell.font = Font(bold=True, color="FFFFFF", size=11)
            title_cell.fill = PatternFill("solid", start_color="C00000")
            title_cell.border = self.BORDER
            row += 1

            # Details
            for detail in details:
                detail_cell = ws.cell(row=row, column=1, value=detail)
                detail_cell.alignment = Alignment(wrap_text=True)
                if detail.startswith("RED FLAG"):
                    detail_cell.font = Font(bold=True, italic=True)
                    detail_cell.fill = self.HIGHLIGHT_FILL
                ws.row_dimensions[row].height = None
                row += 1

            row += 1

        ws.column_dimensions["A"].width = 95


def generate_s_corp_reconciliation_workbook(
    case_id: str, tax_year: int, out_dir: Path
) -> Path:
    """Generate a complete S-corp reconciliation workbook."""
    builder = SCorporationReconciliationBuilder(case_id, tax_year)
    out_path = out_dir / f"S-Corp_Reconciliation_{case_id}_{tax_year}.xlsx"
    return builder.build(out_path)
