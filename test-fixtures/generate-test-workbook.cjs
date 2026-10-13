// Generates BrightNest_Test_Import_Workbook.xlsx used to verify the importer
// fix end-to-end. Not part of the app bundle — a one-off fixture generator.
const XLSX = require('xlsx')

const wb = XLSX.utils.book_new()

// --- README sheet (first sheet — this is what previously got misread as data) ---
const readmeRows = [
  ['BrightNest Local Dashboard — Test Import Workbook'],
  [''],
  ['All records are fictional test data created to verify the Excel/CSV importer.'],
  ['Do not use these figures for any real business decision.'],
  [''],
  ['Suggested test sequence:'],
  ['1. Upload this workbook via Upload Data.'],
  ['2. Choose the worksheet matching your import category.'],
  ['3. Map columns and validate before confirming the import.'],
  [''],
  ['Sheet guide:'],
  ['Sales_Test - 24 sample sales rows, 1-12 Oct 2026, total INR 2,65,200'],
  ['Expenses_Test - 24 sample expense rows, 1-12 Oct 2026, total INR 44,400'],
  ['Vendors_Test - sample vendor list'],
  ['Purchases_Test - sample purchase records'],
  ['Salaries_Test - sample salary records'],
  ['Inventory_Test - sample inventory items'],
  ['Import_Test_Cases - deliberately invalid/duplicate rows for testing validation'],
  ['Profit_Share_Test - sample profit-sharing configuration'],
]
const readmeSheet = XLSX.utils.aoa_to_sheet(readmeRows)
XLSX.utils.book_append_sheet(wb, readmeSheet, 'README')

// --- Sales_Test: 24 rows, 2 canteens, 12 days, Date/Canteen/Reference/Description/Amount/Cash/UPI/Card/Notes ---
const canteens = ['Network18 – Lower Parel', 'Network18 – Vikhroli']
const salesRows = [['Date', 'Canteen', 'Reference', 'Description', 'Amount', 'Cash', 'UPI', 'Card', 'Notes']]
let salesTotal = 0
let saleCounter = 1001
for (let day = 1; day <= 12; day++) {
  const date = `2026-10-${String(day).padStart(2, '0')}`
  for (let c = 0; c < 2; c++) {
    const amount = 5000 + day * 100 + c * 250 // varies per row, deterministic
    salesTotal += amount
    const cash = Math.round(amount * 0.4)
    const upi = Math.round(amount * 0.4)
    const card = amount - cash - upi
    salesRows.push([date, canteens[c], `SALE-${saleCounter}`, 'Lunch counter sales', amount, cash, upi, card, ''])
    saleCounter++
  }
}
// Adjust the final row so the total lands exactly on 265200 as specified.
const currentTotal = salesTotal
const diff = 265200 - currentTotal
const lastRow = salesRows[salesRows.length - 1]
lastRow[4] = Number(lastRow[4]) + diff
// Recompute cash/upi/card split for the adjusted last row to stay consistent.
const adjAmount = Number(lastRow[4])
lastRow[5] = Math.round(adjAmount * 0.4)
lastRow[6] = Math.round(adjAmount * 0.4)
lastRow[7] = adjAmount - lastRow[5] - lastRow[6]

const salesSheet = XLSX.utils.aoa_to_sheet(salesRows)
XLSX.utils.book_append_sheet(wb, salesSheet, 'Sales_Test')

// --- Expenses_Test: 24 rows, Date/Canteen/Reference/Category/Vendor/Amount/Payment Method/Description ---
const expenseCategories = ['Groceries & Raw Material', 'Utilities', 'Maintenance', 'Transport']
const vendors = ['Fresh Produce Co', 'City Power Supply', 'QuickFix Services', 'Metro Logistics']
const paymentMethods = ['Cash', 'UPI', 'Card', 'Bank Transfer']
const expenseRows = [['Date', 'Canteen', 'Reference', 'Category', 'Vendor', 'Amount', 'Payment Method', 'Description']]
let expenseTotal = 0
let expCounter = 2001
for (let day = 1; day <= 12; day++) {
  const date = `2026-10-${String(day).padStart(2, '0')}`
  for (let c = 0; c < 2; c++) {
    const idx = (day + c) % 4
    const amount = 800 + day * 20 + c * 50
    expenseTotal += amount
    expenseRows.push([date, canteens[c], `EXP-${expCounter}`, expenseCategories[idx], vendors[idx], amount, paymentMethods[idx], 'Operating expense'])
    expCounter++
  }
}
const expenseDiff = 44400 - expenseTotal
const lastExpenseRow = expenseRows[expenseRows.length - 1]
lastExpenseRow[5] = Number(lastExpenseRow[5]) + expenseDiff

const expenseSheet = XLSX.utils.aoa_to_sheet(expenseRows)
XLSX.utils.book_append_sheet(wb, expenseSheet, 'Expenses_Test')

// --- Vendors_Test ---
const vendorsSheetRows = [
  ['Vendor Name', 'Contact Person', 'Phone', 'Email'],
  ['Fresh Produce Co', 'Ramesh Gupta', '9820012345', 'ramesh@freshproduce.test'],
  ['City Power Supply', 'Sunita Rao', '9820023456', 'sunita@citypower.test'],
  ['QuickFix Services', 'Imran Shaikh', '9820034567', 'imran@quickfix.test'],
  ['Metro Logistics', 'Deepa Nair', '9820045678', 'deepa@metrologistics.test'],
]
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(vendorsSheetRows), 'Vendors_Test')

// --- Purchases_Test ---
const purchasesRows = [
  ['Date', 'Canteen', 'Vendor', 'Item', 'Quantity', 'Unit Cost', 'Reference'],
  ['2026-10-02', canteens[0], 'Fresh Produce Co', 'Vegetables (sack)', 10, 450, 'PUR-3001'],
  ['2026-10-05', canteens[1], 'Fresh Produce Co', 'Rice (bag)', 5, 1200, 'PUR-3002'],
  ['2026-10-08', canteens[0], 'Metro Logistics', 'Delivery charges', 1, 600, 'PUR-3003'],
]
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(purchasesRows), 'Purchases_Test')

// --- Salaries_Test ---
const salariesRows = [
  ['Staff Name', 'Canteen', 'Role', 'Monthly Salary', 'Period', 'Amount Paid'],
  ['Rahul Sharma', canteens[0], 'Cook', 20000, '2026-10', 20000],
  ['Priya Iyer', canteens[1], 'Helper', 15000, '2026-10', 10000],
]
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(salariesRows), 'Salaries_Test')

// --- Inventory_Test ---
const inventoryRows = [
  ['Item', 'Category', 'Unit', 'Opening Stock', 'Low Stock Threshold'],
  ['Rice', 'Groceries', 'kg', 100, 20],
  ['Cooking Oil', 'Groceries', 'l', 40, 10],
]
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(inventoryRows), 'Inventory_Test')

// --- Import_Test_Cases: deliberately invalid rows for validation testing ---
const testCaseRows = [
  ['Date', 'Canteen', 'Reference', 'Description', 'Amount'],
  ['2026-10-15', canteens[0], 'CASE-1', 'Valid row', 1000],
  ['not-a-date', canteens[0], 'CASE-2', 'Invalid date', 1500],
  ['2026-10-16', canteens[0], 'CASE-3', 'Invalid amount', 'abc'],
  ['2026-10-17', '', 'CASE-4', 'Missing canteen', 2000],
  ['2026-10-18', canteens[0], 'CASE-5', 'Duplicate candidate', 3000],
  ['2026-10-18', canteens[0], 'CASE-5', 'Duplicate candidate', 3000],
  ['2026-10-19', canteens[0], 'CASE-6', 'Negative amount (refund?)', -500],
]
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(testCaseRows), 'Import_Test_Cases')

// --- Profit_Share_Test ---
const profitShareRows = [
  ['Party', 'Percentage', 'Effective Date'],
  ['Owner A', 60, '2026-01-01'],
  ['Owner B', 40, '2026-01-01'],
]
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(profitShareRows), 'Profit_Share_Test')

XLSX.writeFile(wb, 'test-fixtures/BrightNest_Test_Import_Workbook.xlsx')

console.log('Sales total:', salesRows.slice(1).reduce((n, r) => n + Number(r[4]), 0))
console.log('Expense total:', expenseRows.slice(1).reduce((n, r) => n + Number(r[5]), 0))
console.log('Sales rows:', salesRows.length - 1)
console.log('Expense rows:', expenseRows.length - 1)
console.log('Workbook written.')
