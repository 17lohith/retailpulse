import { api, setup, teardown, wipe, newShop, mkProducts, waitFor, addUser } from './helpers.js';
import { cleanSales, messySales, utf8Rupee, billTotals, ambiguousDates, pdfBytes, xlsBytes, stockFile, productsFile, salesXlsx } from './fixtures.js';
import mongoose from 'mongoose';
beforeAll(async () => { await setup(); await wipe(); });
afterAll(teardown);

const upload = (s, buf, name, type = 'sales') => api().post('/api/imports').set(s.auth).field('type', type).field('storeId', s.stores[0]).attach('file', buf, name);
async function run(s, buf, name, { type = 'sales', options = {}, resolutions } = {}) {
  const up = await upload(s, buf, name, type).expect(201); const id = up.body._id;
  const sug = up.body.analysis.suggested; const fields = Object.fromEntries(Object.entries(sug).map(([k, v]) => [k, v.column]));
  await api().post(`/api/imports/${id}/mapping`).set(s.auth).send({ fields, dateFormat: up.body.analysis.dateFormat?.format || 'dmy', options }).expect(202);
  const prev = await waitFor(s, id, ['preview_ready']);
  if (resolutions) await api().post(`/api/imports/${id}/resolve`).set(s.auth).send({ resolutions }).expect(200);
  return { id, up: up.body, prev };
}
const commit = async (s, id) => { await api().post(`/api/imports/${id}/commit`).set(s.auth).expect(202); return waitFor(s, id, ['committed']); };
const salesCount = (s) => mongoose.connection.collection('sales').countDocuments({ tenantId: s.tenantId });

describe('import pipeline - sales', () => {
  test('clean CSV: auto-detects columns, previews, commits, row counts reconcile', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }, { sku: 'BISC1', name: 'Parle-G 200 g' }]);
    const { id, up, prev } = await run(s, cleanSales(), 'sales.csv');
    expect(up.analysis.suggested.date.confidence).toBe(1); expect(up.analysis.missingRequired).toEqual([]);
    expect(prev.report.rowsTotal).toBe(4); expect(prev.report.rowsOk).toBe(4); expect(prev.report.reconciles).toBe(true); expect(prev.report.dates).toEqual({ min: '2026-09-01', max: '2026-09-02' });
    const done = await commit(s, id); expect(done.commitResult.inserted).toBe(4);
    expect(await salesCount(s)).toBe(4);
  });
  test('messy file: finds the real header row, skips totals, rejects bad rows with reasons, rows reconcile', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }, { sku: 'BISC1', name: 'Parle-G 200 g' }]);
    const { up, prev } = await run(s, messySales(), 'messy.csv');
    expect(up.analysis.headerRow).toBeGreaterThanOrEqual(2);  // blank lines are not rows
    const r = prev.report; expect(r.reconciles).toBe(true); expect(r.rowsTotal).toBe(r.rowsOk + r.rowsRejected + r.rowsSkipped);
    expect(r.rejectedByReason.invalid_date).toBe(2);  // 31/02 and the blank date expect(r.rejectedByReason.invalid_quantity).toBe(1); expect(r.rejectedByReason.missing_item_name).toBe(0 + (r.rejectedByReason.missing_item_name || 0));
    expect(r.skippedByReason.total_or_footer_row).toBe(1); expect(r.skippedByReason.zero_quantity).toBe(1); expect(r.returns).toBe(1);
    expect(r.unmatched.map((u) => u.name)).toContain('Mystery Biscuit XL');
    expect(r.outlierCount).toBeGreaterThanOrEqual(0);
    const csv = await api().get(`/api/imports/${prev._id}/errors.csv`).set(s.auth).expect(200); expect(csv.text).toMatch(/invalid_date/);
  });
  test('Indian number formats and rupee symbols are parsed; Latin-1 is decoded', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }, { sku: 'BISC1', name: 'Parle-G 200 g' }]);
    const { id } = await run(s, messySales(), 'messy.csv'); await commit(s, id);
    const milk = await mongoose.connection.collection('sales').findOne({ tenantId: s.tenantId, sku: 'MILK1', date: '2026-09-01' });
    expect(milk.qty).toBe(1000); expect(milk.revenuePaise).toBe(3000000);
  });
  test('UTF-8 BOM, rupee sign and lakh-style digit grouping parse correctly', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }]);
    const { id } = await run(s, utf8Rupee(), 'u.csv'); await commit(s, id);
    const d = await mongoose.connection.collection('sales').findOne({ tenantId: s.tenantId, sku: 'MILK1' }); expect(d.qty).toBe(100000); expect(d.revenuePaise).toBe(123456750);
  });
  test('unit-price files (no amount column) get revenue = quantity x price; one item code with several descriptions becomes ONE item', async () => {
    const s = await newShop();
    const buf = Buffer.from('Invoice,StockCode,Description,Quantity,InvoiceDate,Price\n1,85048,15CM CHRISTMAS GLASS BALL,12,2009-12-01 07:45:00,6.95\n2,85048,CHRISTMAS GLASS BALL 20 LIGHTS,3,2009-12-01 09:10:00,6.95\nC3,85048,15CM CHRISTMAS GLASS BALL,-1,2009-12-02 10:00:00,6.95\n4,22111,SCOTTIE DOG HOT WATER BOTTLE,2,2009-12-02 11:00:00,4.25\n');
    const { id, up, prev } = await run(s, buf, 'retail.csv', { options: { autoCreateUnmatched: true } });
    expect(up.analysis.suggested.price.name).toBe('Price'); expect(up.analysis.suggested.itemCode.name).toBe('StockCode'); expect(prev.report.unmatchedItems).toBe(2);   // 85048 + 22111, not 3
    await commit(s, id);
    expect(await mongoose.connection.collection('products').countDocuments({ tenantId: s.tenantId })).toBe(2);
    const d = await mongoose.connection.collection('sales').findOne({ tenantId: s.tenantId, sku: '85048', date: '2009-12-01' }); expect(d.qty).toBe(15); expect(d.revenuePaise).toBe(Math.round(15 * 6.95 * 100));
    expect((await mongoose.connection.collection('sales').findOne({ tenantId: s.tenantId, sku: '85048', date: '2009-12-02' })).qty).toBe(0);   // a return nets the day to 0, never negative
  });
  test('service lines (postage, bank charges, manual adjustments) are skipped and reported, not imported as products', async () => {
    const s = await newShop();
    const buf = Buffer.from('Date,Item Name,Item Code,Quantity,Price\n01/09/2026,Tea 250 g,T1,2,50\n01/09/2026,POSTAGE,POST,1,18\n01/09/2026,Bank Charges,BANK CHARGES,1,15\n01/09/2026,Manual,M,1,100\n');
    const { id, prev } = await run(s, buf, 'svc.csv', { options: { autoCreateUnmatched: true } });
    expect(prev.report.skippedByReason.non_product_line).toBe(3); expect(prev.report.rowsOk).toBe(1); expect(prev.report.reconciles).toBe(true);
    await commit(s, id); expect(await mongoose.connection.collection('products').countDocuments({ tenantId: s.tenantId })).toBe(1);
  });
  test('unmatched items are proposed, never auto-merged; owner can create or skip', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }]);
    const buf = Buffer.from('Date,Item Name,Quantity\n01/09/2026,Amul Taaza Milk 500ml,5\n01/09/2026,Brand New Soap,3\n');
    const { id, prev } = await run(s, buf, 'u.csv');
    expect(prev.report.unmatchedItems).toBe(2); const near = prev.report.unmatched.find((u) => u.name.startsWith('Amul')); expect(near.proposals[0].sku).toBe('MILK1');
    await api().post(`/api/imports/${id}/resolve`).set(s.auth).send({ resolutions: [{ key: near.key, action: 'link', sku: 'MILK1' }, { key: 'raw:brand new soap', action: 'create' }] }).expect(200);
    const done = await commit(s, id); expect(done.commitResult.productsCreated).toBe(1);
    expect(await mongoose.connection.collection('sales').countDocuments({ tenantId: s.tenantId, sku: 'MILK1' })).toBe(1);
  });
  test('re-uploading the same file is idempotent (no duplicates) and the duplicate is flagged', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }, { sku: 'BISC1', name: 'Parle-G 200 g' }]);
    const a = await run(s, cleanSales(), 'a.csv'); await commit(s, a.id);
    const b = await run(s, cleanSales(), 'b.csv'); expect(b.up.analysis.warnings.join(' ')).toMatch(/already imported/); await commit(s, b.id);
    expect(await salesCount(s)).toBe(4);
  });
  test('overlapping re-upload with corrected numbers replaces, and Undo restores the earlier values', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }, { sku: 'BISC1', name: 'Parle-G 200 g' }]);
    const a = await run(s, cleanSales(), 'a.csv'); await commit(s, a.id);
    const fixed = Buffer.from('Date,Item Name,Item Code,Quantity,Sale Amount\n01/09/2026,Amul Milk 500 ml,MILK1,99,2970\n05/09/2026,Parle-G 200 g,BISC1,1,20\n');
    const b = await run(s, fixed, 'b.csv'); await commit(s, b.id);
    const col = mongoose.connection.collection('sales');
    expect((await col.findOne({ tenantId: s.tenantId, sku: 'MILK1', date: '2026-09-01' })).qty).toBe(99); expect(await salesCount(s)).toBe(5);
    await api().post(`/api/imports/${b.id}/undo`).set(s.auth).expect(200);
    expect((await col.findOne({ tenantId: s.tenantId, sku: 'MILK1', date: '2026-09-01' })).qty).toBe(10); expect(await salesCount(s)).toBe(4);
  });
  test('bill-total report (no item column) gets a plain-language warning', async () => {
    const s = await newShop(); const up = await upload(s, billTotals(), 'bills.csv').expect(201);
    expect(up.body.status).toBe('mapping_needed'); expect(up.body.analysis.warnings.join(' ')).toMatch(/ITEM-WISE/);
  });
  test('ambiguous day/month dates are flagged for confirmation', async () => {
    const s = await newShop(); const up = await upload(s, ambiguousDates(), 'amb.csv').expect(201);
    expect(up.body.analysis.dateFormat.ambiguous).toBe(true); expect(up.body.analysis.warnings.join(' ')).toMatch(/confirm/);
  });
  test('PDF and legacy .xls are refused with a helpful message', async () => {
    const s = await newShop();
    const pdf = await upload(s, pdfBytes(), 'report.pdf').expect(400); expect(pdf.body.error).toBe('pdf_not_supported');
    const xls = await upload(s, xlsBytes(), 'report.xls').expect(400); expect(xls.body.error).toBe('old_excel');
  });
  test('XLSX with a title row and real dates is read', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }, { sku: 'BISC1', name: 'Parle-G 200 g' }]);
    const { id, prev } = await run(s, await salesXlsx(), 'sales.xlsx'); expect(prev.report.rowsOk).toBe(2); expect(prev.report.dates.min).toBe('2026-09-01'); await commit(s, id);
  });
  test('staff cannot upload; mapping is saved and reused', async () => {
    const s = await newShop(); const staff = await addUser(s, 'staff'); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml' }, { sku: 'BISC1', name: 'Parle-G 200 g' }]);
    await api().post('/api/imports').set(staff).field('type', 'sales').field('storeId', s.stores[0]).attach('file', cleanSales(), 'x.csv').expect(403);
    const a = await run(s, cleanSales(), 'a.csv'); await commit(s, a.id);
    const up2 = await upload(s, cleanSales(), 'again.csv').expect(201); expect(up2.body.analysis.usedSavedMapping).toBe(true);
  });
});

describe('import pipeline - items, stock', () => {
  test('item list creates and updates products; undo restores', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml', mrpPaise: 3000 }]);
    const { id, prev } = await run(s, productsFile(), 'items.csv', { type: 'products' }); expect(prev.report.create).toBe(1); expect(prev.report.update).toBe(1);
    await commit(s, id); expect((await api().get('/api/catalog/products/MILK1').set(s.auth)).body.product.mrpPaise).toBe(3100);
    expect((await api().get('/api/catalog/products').set(s.auth)).body.total).toBe(2);
    await api().post(`/api/imports/${id}/undo`).set(s.auth).expect(200);
    expect((await api().get('/api/catalog/products/MILK1').set(s.auth)).body.product.mrpPaise).toBe(3000); expect((await api().get('/api/catalog/products').set(s.auth)).body.total).toBe(1);
  });
  test('stock file sets on-hand; strict-tracked items get a pending-expiry batch', async () => {
    const s = await newShop(); await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml', trackingPolicy: 'strict', shelfLifeDays: 7 }, { sku: 'BISC1', name: 'Parle-G 200 g' }]);
    const { id } = await run(s, stockFile(), 'stock.csv', { type: 'stock' }); await commit(s, id);
    const st = await mongoose.connection.collection('inventory_state').findOne({ tenantId: s.tenantId, sku: 'MILK1' }); expect(st.onHand).toBe(36);
    const pend = await api().get('/api/inventory/pending-expiry').set(s.auth).expect(200); expect(pend.body.total).toBe(1);
  });
});
