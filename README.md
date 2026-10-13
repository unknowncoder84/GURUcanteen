# BrightNest Food Solutions — local business dashboard

BrightNest is a local-first business dashboard for Network18 canteens. It stores every record in **IndexedDB inside your browser profile on this computer**. No Supabase, Firebase, API key, login provider, cloud backend, analytics, or telemetry is used, and no business data is ever transmitted anywhere.

## Required software

- Node.js 20 or later
- pnpm (the project is pinned to `pnpm@12.3.4` via `packageManager` in `package.json`)

## Windows setup

Open Command Prompt or PowerShell in the project folder and run:

```powershell
pnpm install
pnpm dev
```

Open **http://localhost:3000** in your browser.

For a production-style build instead of the dev server:

```powershell
pnpm run build
pnpm run start
```

## Everyday workflows

- **Overview** (`/`) — Business-wide totals (sales, expenses, profit, margin), filtered by canteen and date range.
  - **Dashboard view switcher**: Combined Overview, a specific canteen, Comparison View (both canteens side by side using the same date range), and a link to Profit & Sharing. The selected view is remembered between visits (stored harmlessly in your browser's local storage, never mixed with financial records).
  - **Global filter bar**: canteen, date range (Today/Yesterday/This week/Last week/This month/Last month/This financial year/Custom), and a search box that matches description, reference, vendor, staff, category, and the originating import filename across your full stored dataset. Less-common filters (category, payment method, vendor, staff, import batch) live behind an **Advanced filters** disclosure so the main view stays uncluttered. A **Clear all filters** action and a live result count/filtered total are always shown.
  - **Create PDF report** button opens a configuration panel where you choose the period, canteen scope (combined / one canteen / compare both), exactly which sections to include, and layout options (compact/detailed, tables on/off, charts on/off, notes, portrait/landscape). Sections without enough data are shown but disabled and labelled "Unavailable" rather than producing misleading figures. The PDF is generated entirely locally with real figures from your filtered data — never a screenshot.
  - Figures are computed live from your stored records; an empty database shows an empty state with an option to load a clearly labelled demo dataset.
- **Canteens** (`/canteens`) — Add, edit, search, activate/deactivate canteens. Two canteens are seeded on first run: Network18 – Lower Parel and Network18 – Vikhroli. Renaming a canteen never changes its ID, so historical transactions always stay linked. Deactivating a canteen blocks new transactions against it but keeps all history intact.
- **Sales Register** (`/sales`) / **Expense Register** (`/expenses`) — Add, edit, delete (with confirmation), search (including vendor name and originating import filename), filter by canteen/date/payment method/category/vendor/import batch, and export CSV/Excel.
- **Purchases** (`/purchases`) and **Vendors** (`/vendors`) — Record purchases against vendors, track outstanding balances, record full or partial vendor payments (with overpayment protection unless explicitly marked as an advance), and export CSV.
- **Collections** (`/collections`) — Record expected vs actual collections by payment method and see discrepancies. Kept as a distinct record type from Sales so nothing is double-counted.
- **Staff & Salaries** (`/staff`) — Basic staff register with monthly salary, partial salary payments, and outstanding balance tracking. This is not payroll-compliance software.
- **Inventory** (`/inventory`) — Basic stock register. Closing stock is derived from recorded movements (received/consumed/adjustment), with low-stock warnings and negative-stock protection. Inventory cost is not included in the profit calculation.
- **Upload Data** (`/upload`) — Import a complete `.csv`, `.xls`, or `.xlsx` file:
  1. Pick a canteen and category. Only categories with an implemented data model and import handler are offered: **Sales, Expenses, Purchases**. Collections, vendor payments, staff/salaries, and inventory do not have an import handler yet and are intentionally not offered here, so data is never silently accepted into a category it can't be correctly stored under.
  2. **Choose worksheet.** Excel workbooks are never assumed to have the right data on the first sheet — every worksheet is listed with its approximate row count, and sheets that look like a README/instructions sheet (by name or by being mostly single-cell prose) are clearly flagged so you don't accidentally try to import documentation as transactions. A worksheet is suggested based on the selected category (e.g. "Sales" suggests a sheet named like `Sales_Test`) but you can always pick a different one.
  3. **Header row detection.** The real column-header row is detected automatically by looking for a row of short, label-like cells (matching known terms like Date, Canteen, Amount, Reference) rather than assuming row 1 is always the header — this is what previously caused README title/paragraph text to be misread as column headers. If detection isn't confident, you're asked to confirm or pick the header row manually before continuing.
  4. Preview the file (first 20 rows shown, but **the entire file is read and will be imported** — there is no row limit; a 5,000-row file is read and validated in full).
  5. Map spreadsheet columns to fields. The field list changes per category (e.g. sales exposes Cash/UPI/Card split amounts and an optional Canteen column; expenses exposes Category and Vendor). Common headers are auto-suggested using exact-match-first scoring (so "Expense Category" maps to Category, not Amount), always editable. If a row includes its own Canteen column, that name is resolved against your existing canteens and used instead of the pre-selected default canteen for that row — rows naming a canteen that doesn't exist are rejected rather than guessed.
  6. Review per-row validation results (errors are rejected, never silently defaulted; possible duplicates are flagged, not auto-merged; negative amounts are rejected by default but can be flagged for refund/adjustment review instead) and optionally download rejected rows as CSV.
  7. Confirm — this importer uses **partial import**: valid rows are saved even when other rows in the same file are rejected. The accepted rows are saved in a single database transaction, and the import is recorded in history (filename, import ID, accepted/rejected/duplicate counts) for later reversal and for filtering sales/expenses by import batch.
  8. See the import results summary (rows saved) with a link to import history.
- **Profit & Sharing** (`/profit-sharing`) — Configure profit-sharing parties explicitly (name, percentage, effective date, notes, active flag). Nothing is assumed: an equal split is never auto-applied, and no distribution is calculated until active percentages sum to exactly 100%, in which case the page shows "No profit-sharing agreement configured." The distribution calculation shows recognised sales, recognised operating expenses, operating profit, amount eligible for distribution, each party's percentage and calculated amount, and any paise-level rounding remainder (allocated deterministically so the parts always sum exactly to the distributable amount). This is explicitly labelled a provisional estimate — nothing here transfers money, creates payment records, or modifies historical accounting records.
- **Reports & Exports** (`/reports`) — Daily/monthly sales and expenses, profit summary, canteen comparison, payment-method summary, vendor/salary outstanding balances, reconciliation, inventory, and import history (with safe import reversal). Export any report as CSV or Excel, use **Create PDF report** for the same configurable PDF builder as the Overview page, or **Print / Save as PDF** for a print-friendly layout via your browser's print dialog.
- **Settings** (`/settings`) — Business name, storage information, full JSON backup/restore (with a preview and merge-or-replace choice before restoring), CSV export of key tables, demo data load/clear, and a strongly-confirmed full database reset.

## Backing up your data

Click **Download full backup (JSON)** on the Settings page regularly and save the file outside the browser (a cloud drive, USB stick, or another folder). This file contains every record, ID, relationship, import history entry, audit log entry, and setting.

**Important:** clearing your browser's site data for this app will permanently erase everything stored in IndexedDB. This app does not sync between computers, browsers, or users — it is strictly single-browser, single-computer local storage, and it is not encrypted or tamper-proof.

## Financial calculation rules (documented, not audited accounting)

- **Recognised sales** = sum of non-reversed sales records in the selected range.
- **Operating expenses** = sum of non-reversed expense records in range, excluding rows flagged as settling an already-recognised purchase liability (so a vendor payment is never counted twice).
- **Operating profit** = Recognised sales − Operating expenses.
- **Profit margin** = Operating profit ÷ Recognised sales × 100, shown as "—" when sales are zero (never divided by zero).
- Collections are never automatically treated as additional sales. Vendor payments that merely settle an existing purchase are never counted as a second expense. Purchases and inventory are not double-counted.
- All dates use the Asia/Kolkata business calendar day. All money is stored as integer paise internally to avoid floating-point rounding errors, and displayed using Indian digit grouping (e.g. ₹1,23,456.78).

This is an **operational estimate**, not an audited profit & loss statement. Full accrual accounting, inventory-based cost of goods sold, and shared cost allocation are not implemented.

## Profit-sharing calculation rules

- A distribution is only computed once you explicitly add at least one active sharing party and the active parties' percentages sum to exactly 100%. There is no default, hardcoded, or assumed split.
- Amount eligible for distribution = max(0, operating profit) for the selected canteen/period — a provisional estimate, not an audited or legally approved distribution.
- Each party's amount = eligible amount × their percentage, computed in integer paise. Any leftover paise from rounding is allocated one paise at a time to the parties with the largest fractional remainder (ties broken by configuration order), so the displayed shares always sum exactly to the eligible amount — never short or over by a paise.
- Editing or deleting a sharing party never changes any historical sales, expense, or purchase record.

## Known limitations

- Single browser, single computer. No multi-user or multi-device sync of any kind.
- IndexedDB is not encrypted and not tamper-proof.
- Reconciliation, inventory, and salary figures are only as complete as the records you enter — there is no automatic bank-feed or POS integration.
- Inventory cost is not factored into the profit calculation.
- The import pipeline supports Sales, Expenses, and Purchases categories only. Collections, vendor payments, staff/salaries, and inventory import handlers are not implemented yet, so those categories are intentionally not offered in the Upload Data category selector rather than silently accepting data they can't correctly store.
- The PDF report builder reuses the same operating-profit figure as the rest of the app (not full accrual accounting); any section that doesn't have enough data is labelled "Unavailable" instead of showing a fabricated number.
- The dashboard view preference (Combined/Canteen/Comparison) is remembered in your browser's local storage for convenience. This is a UI preference only — all financial records always live in IndexedDB, and clearing local storage never deletes financial data (and vice versa, clearing IndexedDB never touches this preference).

## Running tests

```powershell
pnpm run test
```

This runs the Vitest suite (142 tests) covering canteen ID persistence, sales/expense CRUD, financial calculations (including the zero-sales margin case and combined-vs-per-canteen totals), vendor and salary balance math and double-counting prevention, date parsing/validation including the new filter presets, money parsing/formatting, full-text search across stored records, the full-file import validation and column-mapping pipeline (invalid rows, duplicates, mixed date formats, per-category field sets, canteen-by-name resolution, cash/UPI/card split amounts), worksheet listing and header-row detection against a real multi-sheet `.xlsx` fixture, import commit/reversal against a real IndexedDB (via `fake-indexeddb`), backup/restore (merge and replace strategies, including backward compatibility with older backup files), profit-sharing percentage validation and deterministic rounding, PDF report section availability and generation, and UI preference persistence.

A real test workbook (`test-fixtures/BrightNest_Test_Import_Workbook.xlsx`) is included and regenerated by `node test-fixtures/generate-test-workbook.cjs`. It reproduces the exact structure that originally broke the importer — a README sheet first, followed by `Sales_Test`, `Expenses_Test`, `Vendors_Test`, `Purchases_Test`, `Salaries_Test`, `Inventory_Test`, `Import_Test_Cases`, and `Profit_Share_Test` — and `lib/import/parseFile.test.ts` / `lib/import/endToEndWorkbook.test.ts` exercise the full read → map → validate → commit pipeline against it, including the specified totals (Sales ₹2,65,200, Expenses ₹44,400, operating profit ₹2,20,800 for 1–12 October 2026).
#   G U R U c a n t e e n  
 