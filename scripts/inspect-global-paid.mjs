import XLSX from 'xlsx';
import fs from 'fs';

const dir = 'docs/accounting_sample/매출액 data/02. 네이버_글로벌 유료수익';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'));
console.log('Files:', files);

const file = files.find(f => f.includes('INVOICE'));
if (!file) { console.log('No file found'); process.exit(); }

const wb = XLSX.readFile(dir + '/' + file);
console.log('Sheets:', wb.SheetNames);

const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('invoice')) || wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

console.log('\n=== Header (row 5-6) ===');
data.slice(4, 7).forEach((r, i) => console.log('Row', i + 5, ':', JSON.stringify(r).substring(0, 250)));

// Find Prior Period Adjustment rows
console.log('\n=== Rows containing Prior/소급/Adjustment ===');
data.forEach((r, i) => {
  const str = JSON.stringify(r || []);
  if (str.includes('Prior') || str.includes('소급') || str.includes('djustment')) {
    console.log('Row', i + 1, ':', str.substring(0, 250));
  }
});

// Show last 20 rows
console.log('\n=== Last 20 rows ===');
const start = Math.max(0, data.length - 20);
data.slice(start).forEach((r, i) => console.log('Row', start + i + 1, ':', JSON.stringify(r).substring(0, 250)));

// Calculate totals
let regularTotal = 0;
let adjustmentTotal = 0;
for (let i = 6; i < data.length; i++) {
  const row = data[i];
  if (!row || !row[1]) continue;
  const name = String(row[1]).trim();
  const payment = Number(row[8]) || 0;
  if (name === 'Prior Period Adjustment') {
    adjustmentTotal += payment;
  } else if (name) {
    regularTotal += payment;
  }
}
console.log('\n=== Totals ===');
console.log('Regular items:', regularTotal.toLocaleString());
console.log('Prior Period Adjustment:', adjustmentTotal.toLocaleString());
console.log('Combined:', (regularTotal + adjustmentTotal).toLocaleString());

// Check Prior Period Adjustment_상세 sheet
const adjSheetName = wb.SheetNames.find(n => n.includes('Prior Period Adjustment'));
if (adjSheetName) {
  console.log('\n=== ' + adjSheetName + ' ===');
  const adjWs = wb.Sheets[adjSheetName];
  const adjData = XLSX.utils.sheet_to_json(adjWs, { header: 1 });
  adjData.slice(0, 20).forEach((r, i) => console.log('Row', i + 1, ':', JSON.stringify(r).substring(0, 250)));
}
