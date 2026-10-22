// File reading + value parsing for owner-uploaded billing exports (CSV / XLSX). Stream-based, encoding-aware.
import fs from 'node:fs';
import iconv from 'iconv-lite';
import chardet from 'chardet';
import { parse as csvParse } from 'csv-parse';
import ExcelJS from 'exceljs';
import { HttpError } from '../middleware/common.js';

export function detectKind(filename, buf) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'xls' || (buf[0] === 0xd0 && buf[1] === 0xcf)) throw new HttpError(400, 'old_excel', 'This is an old Excel file (.xls). Open it in Excel and use Save As -> "Excel Workbook (.xlsx)" or "CSV", then upload again.');
  if (ext === 'pdf' || buf.slice(0, 4).toString() === '%PDF') throw new HttpError(400, 'pdf_not_supported', 'PDF files cannot be read reliably. In your billing software, export the report as Excel or CSV instead.');
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
    throw new HttpError(400, 'unsupported', 'Please upload a .csv or .xlsx file.');
  }
  if (['csv', 'txt', 'tsv'].includes(ext)) return 'csv';
  throw new HttpError(400, 'unsupported', 'Please upload a .csv or .xlsx file.');
}

/** Async generator of rows (arrays of cell values). */
export async function* readRows(filePath, kind, { limit = Infinity } = {}) {
  let n = 0;
  if (kind === 'xlsx') {
    const wb = new ExcelJS.stream.xlsx.WorkbookReader(filePath, { worksheets: 'emit', sharedStrings: 'cache', styles: 'ignore', hyperlinks: 'ignore' });
    for await (const ws of wb) {
      for await (const row of ws) {
        const vals = []; row.eachCell({ includeEmpty: true }, (c, i) => { let v = c.value; if (v && typeof v === 'object') v = v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : v); vals[i - 1] = v instanceof Date ? v.toISOString().slice(0, 10) : v; });
        yield vals; if (++n >= limit) return;
      }
      return; // first sheet only
    }
    return;
  }
  const fd = fs.openSync(filePath, 'r'); const head = Buffer.alloc(65536); const len = fs.readSync(fd, head, 0, 65536, 0); fs.closeSync(fd);
  const sample = head.slice(0, len); let enc = chardet.detect(sample) || 'UTF-8';
  if (/ascii/i.test(enc)) enc = 'UTF-8';
  const text = iconv.decode(sample, enc);
  const delimiter = [',', ';', '\t', '|'].map((d) => [d, (text.split('\n')[0].match(new RegExp(d === '|' ? '\\|' : d, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
  const stream = fs.createReadStream(filePath).pipe(iconv.decodeStream(/utf-?8/i.test(enc) ? 'utf8' : enc)).pipe(csvParse({ delimiter, relax_column_count: true, relax_quotes: true, skip_empty_lines: true, bom: true }));
  for await (const rec of stream) { yield rec; if (++n >= limit) { stream.destroy(); return; } }
}

// ---- value parsers ---------------------------------------------------------------------------------------------------
export function parseNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/rs\.?|inr/gi, '').replace(/\s+/g, '');
  if (!/\d/.test(s)) return null;
  s = s.replace(/[^0-9.,()\-]/g, '');                                            // currency symbols (incl. mangled ones like '?')
  let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (/^\d{1,3}(,\d{2,3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');          // 1,23,456.78  or 1,234,567
  else if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');                          // decimal comma
  else s = s.replace(/,/g, '');
  const n = Number(s); return Number.isFinite(n) ? (neg ? -n : n) : null;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');
const valid = (y, m, d) => { const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d; };

/** Look at a whole column to decide dd/mm vs mm/dd. Returns {format, ambiguous}. */
export function inferDateFormat(values) {
  let dmy = 0, mdy = 0, ymd = 0, serial = 0, month = 0, total = 0, both = 0;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue; total++;
    if (typeof v === 'number' && v > 20000 && v < 80000) { serial++; continue; }
    const s = String(v).trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) { ymd++; continue; }
    if (/[a-z]{3}/i.test(s) && /\d/.test(s)) { month++; continue; }
    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (!m) continue;
    const a = +m[1], b = +m[2]; if (a > 12 && b <= 12) dmy++; else if (b > 12 && a <= 12) mdy++; else both++;
  }
  if (serial / total > 0.8) return { format: 'excel-serial', ambiguous: false };
  if (ymd / total > 0.8) return { format: 'ymd', ambiguous: false };
  if (month / total > 0.8) return { format: 'dmon', ambiguous: false };
  if (dmy && mdy) return { format: dmy >= mdy ? 'dmy' : 'mdy', ambiguous: true };
  if (mdy) return { format: 'mdy', ambiguous: false };
  if (dmy) return { format: 'dmy', ambiguous: false };
  return { format: 'dmy', ambiguous: both > 0 && total > 0, assumed: true };       // India default
}
export function parseDate(v, format) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return valid(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
  if ((m = s.match(/^(\d{1,2})[\s\-\/]([a-z]{3})[a-z]*[\s\-\/,]*(\d{2,4})/i))) { const mo = MONTHS[m[2].toLowerCase()]; let y = +m[3]; if (y < 100) y += 2000; return mo && valid(y, mo, +m[1]) ? `${y}-${pad(mo)}-${pad(m[1])}` : null; }
  if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/))) {
    let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000; const [d, mo] = format === 'mdy' ? [b, a] : [a, b];
    return valid(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  return null;
}
/** expiry like "08/24", "Aug-2026", "2026-08-31", "31/08/2026" */
export function parseExpiry(v, format) {
  if (v === null || v === undefined || v === '') return null; const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{1,2})[\/\-](\d{2}|\d{4})$/))) { let y = +m[2]; if (y < 100) y += 2000; const mo = +m[1]; if (mo < 1 || mo > 12) return null; const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return `${y}-${pad(mo)}-${pad(last)}`; }
  return parseDate(v, format);
}
