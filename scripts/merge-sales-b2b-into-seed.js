#!/usr/bin/env node
/**
 * Merge Sales ZEENTRAVEL B2B sheet into prisma/data/kitchen-seed.json
 *
 * Usage:
 *   node scripts/merge-sales-b2b-into-seed.js "/path/to/Sales ZEENTRAVEL.xlsx"
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const salesPath = process.argv[2];
const seedPath = path.join(__dirname, '..', 'prisma', 'data', 'kitchen-seed.json');
if (!salesPath || !fs.existsSync(salesPath)) {
  console.error('Usage: node scripts/merge-sales-b2b-into-seed.js <Sales.xlsx>');
  process.exit(1);
}
if (!fs.existsSync(seedPath)) {
  console.error('Missing kitchen-seed.json — run export-kitchen-xlsx.py first');
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const wb = XLSX.readFile(salesPath, { cellDates: true });
const sheetName = wb.SheetNames.find((n) => /B2B/i.test(n));
if (!sheetName) {
  console.error('No B2B sheet found');
  process.exit(1);
}
const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
  header: 1,
  defval: null,
  raw: false,
});

let headerIdx = -1;
for (let i = 0; i < Math.min(40, matrix.length); i++) {
  const joined = (matrix[i] || []).map((c) => (c == null ? '' : String(c))).join(' ');
  if (/Company Name/i.test(joined) && /phone/i.test(joined)) {
    headerIdx = i;
    break;
  }
}
if (headerIdx < 0) {
  console.error('B2B header row not found');
  process.exit(1);
}

const headers = (matrix[headerIdx] || []).map((c) =>
  c == null ? '' : String(c).replace(/\n/g, ' ').trim(),
);
const nameCol = headers.findIndex((h) => /Company Name|اسم الشركه/i.test(h));
const phoneCol = headers.findIndex((h) => /phone/i.test(h));
const emailCol = headers.findIndex((h) => /Email|ايميل/i.test(h));
const countryCol = headers.findIndex((h) => /الدوله|country/i.test(h));
const teamCol = headers.findIndex((h) => /team/i.test(h));

function clean(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/\s+/g, ' ');
  if (!t || ['n/a', '#n/a', 'coming soon'].includes(t.toLowerCase())) return null;
  return t;
}
function cleanPhone(s) {
  const t = clean(s);
  if (!t) return null;
  const digits = t.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `+${digits}`;
}
function normName(s) {
  const t = clean(s);
  if (!t || t.length < 2) return null;
  if (/Company Name|اسم الشركه|تنسيق جدول/i.test(t)) return null;
  return t;
}

const map = new Map();
for (let i = headerIdx + 1; i < matrix.length; i++) {
  const row = matrix[i] || [];
  const name = normName(row[nameCol]);
  if (!name) continue;
  const city = clean(row[countryCol]);
  let email = clean(row[emailCol]);
  if (email?.startsWith('mailto:')) email = email.slice(7);
  const team = clean(row[teamCol]);
  const key = `${(city || 'unknown').toLowerCase()}|${name.toLowerCase()}`;
  map.set(key, {
    name,
    type: 'b2b',
    city,
    phone: cleanPhone(row[phoneCol]),
    email,
    notes: team ? `Team: ${team}` : null,
  });
}

seed.b2b = [...map.values()];
seed.sources = {
  kitchen: seed.source,
  sales: path.basename(salesPath),
  b2bSheet: sheetName,
};
seed.source = `${path.basename(String(seed.sources.kitchen || 'kitchen'))} + ${path.basename(salesPath)}`;
fs.writeFileSync(seedPath, JSON.stringify(seed, null, 2));
console.log({ b2b: seed.b2b.length, wrote: seedPath });
