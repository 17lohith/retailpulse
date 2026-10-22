import { parseDate, inferDateFormat, parseNumber } from './parse.js';

export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const S = (...a) => a;
export const TYPES = {
  sales: { label: 'Sales (item-wise)', fields: {
    date: { req: true, syn: S('date', 'saledate', 'billdate', 'invoicedate', 'txndate', 'transactiondate', 'dated', 'day', 'orderdate', 'voucherdate') },
    item: { req: true, syn: S('itemname', 'item', 'product', 'productname', 'particulars', 'description', 'itemdescription', 'goods', 'article', 'name') },
    qty: { req: true, syn: S('quantity', 'qty', 'qtysold', 'soldqty', 'quantitysold', 'units', 'nos', 'pcs', 'salesqty') },
    amount: { syn: S('saleamount', 'amount', 'netamount', 'totalamount', 'total', 'value', 'netsales', 'sales', 'revenue') },
    itemCode: { syn: S('itemcode', 'code', 'sku', 'itemno', 'productcode', 'plu', 'barcode') },
    category: { syn: S('category', 'itemgroup', 'group', 'department', 'family', 'class', 'categoryname') },
    bill: { syn: S('billno', 'bill', 'invoiceno', 'invoice', 'voucherno', 'receiptno') } } },
  products: { label: 'Item list', fields: {
    name: { req: true, syn: S('itemname', 'item', 'product', 'productname', 'name', 'description', 'particulars') },
    itemCode: { syn: S('itemcode', 'code', 'sku', 'itemno', 'productcode') }, barcode: { syn: S('barcode', 'ean', 'upc') },
    category: { syn: S('category', 'itemgroup', 'group', 'department', 'family') }, brand: { syn: S('brand', 'make', 'manufacturer', 'company') },
    mrp: { syn: S('mrp', 'saleprice', 'sellingprice', 'price', 'rate', 'salerate') }, cost: { syn: S('costprice', 'cost', 'purchaseprice', 'purchaserate', 'buyprice') },
    pack: { syn: S('pack', 'packsize', 'caseqty', 'casesize') }, shelfLife: { syn: S('shelflife', 'shelflifedays', 'life') } } },
  stock: { label: 'Current stock', fields: {
    item: { req: true, syn: S('itemname', 'item', 'product', 'productname', 'particulars', 'name', 'description') },
    qty: { req: true, syn: S('closingstock', 'currentstock', 'stock', 'balance', 'onhand', 'quantity', 'qty', 'stockqty') },
    itemCode: { syn: S('itemcode', 'code', 'sku', 'barcode') } } },
  purchases: { label: 'Purchases / deliveries', fields: {
    date: { req: true, syn: S('date', 'purchasedate', 'billdate', 'invoicedate', 'receiveddate', 'grndate') },
    item: { req: true, syn: S('itemname', 'item', 'product', 'productname', 'particulars', 'name', 'description') },
    qty: { req: true, syn: S('quantity', 'qty', 'purchaseqty', 'receivedqty', 'units') },
    rate: { syn: S('rate', 'costprice', 'purchaserate', 'price', 'unitcost') }, supplier: { syn: S('supplier', 'vendor', 'party', 'partyname') },
    invoice: { syn: S('invoiceno', 'billno', 'purchasebillno', 'refno', 'grnno') }, batch: { syn: S('batchno', 'batch', 'lot') },
    expiry: { syn: S('expiry', 'expirydate', 'expdate', 'exp', 'bestbefore') }, itemCode: { syn: S('itemcode', 'code', 'sku', 'barcode') } } },
};

export function findHeaderRow(rows, type) {
  const syns = new Set(Object.values(TYPES[type].fields).flatMap((f) => f.syn));
  let best = { idx: -1, score: 0 };
  rows.slice(0, 30).forEach((r, i) => { const score = r.filter((c) => syns.has(norm(c))).length; if (score > best.score) best = { idx: i, score }; });
  if (best.score >= 2) return best.idx;
  const i = rows.slice(0, 30).findIndex((r) => r.filter((c) => typeof c === 'string' && c.trim()).length >= 3);
  return i >= 0 ? i : 0;
}

export function suggestMapping(header, dataRows, type) {
  const def = TYPES[type].fields; const cols = header.map((h, i) => ({ index: i, name: String(h ?? '').trim(), n: norm(h) })); const used = new Set(); const out = {};
  const colVals = (i) => dataRows.map((r) => r[i]).filter((v) => v !== null && v !== undefined && v !== '');
  for (const pass of ['exact', 'contains', 'sniff']) {
    for (const [field, d] of Object.entries(def)) {
      if (out[field]) continue; let hit = null, conf = 0;
      for (const c of cols) {
        if (used.has(c.index) || !c.n) continue;
        if (pass === 'exact' && d.syn.includes(c.n)) { hit = c; conf = 1; break; }
        if (pass === 'contains' && d.syn.some((s) => s.length >= 4 && (c.n.includes(s) || s.includes(c.n)) && c.n.length >= 3)) { hit = c; conf = 0.7; break; }
      }
      if (!hit && pass === 'sniff' && (field === 'date' || field === 'qty')) {
        for (const c of cols) {
          if (used.has(c.index)) continue; const v = colVals(c.index).slice(0, 200); if (v.length < 5) continue;
          if (field === 'date' && v.filter((x) => parseDate(x, inferDateFormat(v).format)).length / v.length > 0.9) { hit = c; conf = 0.5; break; }
          if (field === 'qty' && v.filter((x) => parseNumber(x) !== null && Number.isInteger(parseNumber(x))).length / v.length > 0.95) { hit = c; conf = 0.4; break; }
        }
      }
      if (hit) { out[field] = { column: hit.index, name: hit.name, confidence: conf }; used.add(hit.index); }
    }
  }
  return out;
}
