import mongoose from 'mongoose';
import { api, setup, teardown, wipe, newShop, mkProducts, addUser } from './helpers.js';
beforeAll(async () => { await setup(); await wipe(); });
afterAll(teardown);

const day = (n = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const col = (n) => mongoose.connection.collection(n);
async function shopWithStock() {
  const s = await newShop('Flow Mart');
  await api().post('/api/catalog/suppliers').set(s.auth).send({ supplierKey: 'dairy', name: 'Daily Dairy', leadTimeDays: 1 }).expect(201);
  await mkProducts(s, [{ sku: 'MILK1', name: 'Amul Milk 500 ml', trackingPolicy: 'strict', shelfLifeDays: 7, supplierKey: 'dairy', packSize: 12 },
    { sku: 'BISC1', name: 'Parle-G 200 g', trackingPolicy: 'estimate', shelfLifeDays: 180, supplierKey: 'dairy', packSize: 6 }]);
  const store = s.stores[0];
  await col('inventory_state').insertMany([{ tenantId: s.tenantId, storeId: store, sku: 'MILK1', onHand: 6, onOrder: 0 }, { tenantId: s.tenantId, storeId: store, sku: 'BISC1', onHand: 20, onOrder: 0 }]);
  const mk = (sku, qty, urgency) => ({ tenantId: s.tenantId, storeId: store, sku, status: 'suggested', suggestedQty: qty, finalQty: qty, supplierKey: 'dairy', supplierName: 'Daily Dairy', urgency, unitCostPaise: 2500, estCostPaise: 2500 * qty,
    reason: { text: 'Sells about 10/day · 6 in stock', inputs: {} }, orderByDate: day(0) });
  const r = await col('recommendations').insertMany([mk('MILK1', 36, 'now'), mk('BISC1', 12, 'soon')]);
  return { s, store, recIds: Object.values(r.insertedIds).map(String) };
}

describe('reorder -> purchase order -> receiving', () => {
  test('recommendations are grouped by supplier with plain-language reasons', async () => {
    const { s } = await shopWithStock();
    const r = await api().get('/api/purchasing/recommendations').set(s.auth).expect(200);
    expect(r.body.groups).toHaveLength(1); expect(r.body.groups[0].lines).toHaveLength(2); expect(r.body.groups[0].lines[0].reason.text).toMatch(/Sells about/);
    expect(r.body.groups[0].lines[0].urgency).toBe('now');
  });
  test('approve, edit, skip; staff cannot decide', async () => {
    const { s, recIds } = await shopWithStock(); const staff = await addUser(s, 'staff');
    await api().post(`/api/purchasing/recommendations/${recIds[0]}/approve`).set(staff).expect(403);
    const a = await api().post(`/api/purchasing/recommendations/${recIds[0]}/approve`).set(s.auth).expect(200); expect(a.body.status).toBe('approved');
    const e = await api().post(`/api/purchasing/recommendations/${recIds[1]}/edit`).set(s.auth).send({ finalQty: 18 }).expect(200); expect(e.body.finalQty).toBe(18);
    await api().post(`/api/purchasing/recommendations/${recIds[1]}/skip`).set(s.auth).send({ reason: 'overstocked' }).expect(200);
    await api().post(`/api/purchasing/recommendations/${recIds[1]}/skip`).set(s.auth).send({ reason: 'made-up' }).expect(400);
  });
  test('full flow: approve -> PO (shareable text, onOrder up) -> receive (batches, onHand up, onOrder down, pending expiry for strict items)', async () => {
    const { s, store, recIds } = await shopWithStock();
    for (const id of recIds) await api().post(`/api/purchasing/recommendations/${id}/approve`).set(s.auth).expect(200);
    const po = await api().post('/api/purchasing/orders/from-recommendations').set(s.auth).send({ storeId: store, supplierKey: 'dairy', recIds }).expect(201);
    expect(po.body.shareText).toMatch(/PURCHASE ORDER PO-/); expect(po.body.po.lines).toHaveLength(2);
    expect((await col('inventory_state').findOne({ tenantId: s.tenantId, sku: 'MILK1' })).onOrder).toBe(36);
    const poId = po.body.po.poId;
    const rec = await api().post(`/api/purchasing/orders/${poId}/receive`).set(s.auth).send({ invoiceNo: 'INV-9', lines: [
      { sku: 'MILK1', receivedQty: 30, damagedQty: 2 },                              // strict item without an expiry date -> pending
      { sku: 'BISC1', receivedQty: 12, expiryDate: day(120), costPaise: 2600 }] }).expect(200);
    expect(rec.body.status).toBe('RECEIVED'); expect(rec.body.pendingExpiry).toBe(1);
    const milk = rec.body.variance.find((v) => v.sku === 'MILK1'); expect(milk).toMatchObject({ ordered: 36, received: 30, short: 6, damaged: 2 });
    expect(rec.body.variance.find((v) => v.sku === 'BISC1').costChangePaise).toBe(100);
    const st = await col('inventory_state').findOne({ tenantId: s.tenantId, sku: 'MILK1' }); expect(st.onHand).toBe(6 + 28); expect(st.onOrder).toBe(0);
    expect((await api().get('/api/inventory/pending-expiry').set(s.auth)).body.total).toBe(1);
    await api().post(`/api/purchasing/orders/${poId}/receive`).set(s.auth).send({ lines: [{ sku: 'MILK1', receivedQty: 1 }] }).expect(409);   // already closed
    const batch = (await api().get('/api/inventory/pending-expiry').set(s.auth)).body.items[0];
    await api().patch(`/api/inventory/batches/${batch.batchId}/expiry`).set(s.auth).send({ expiryDate: day(6) }).expect(200);
    expect((await api().get('/api/inventory/pending-expiry').set(s.auth)).body.total).toBe(0);
  });
  test('cancelling an open order releases the on-order quantity', async () => {
    const { s, store, recIds } = await shopWithStock(); await api().post(`/api/purchasing/recommendations/${recIds[0]}/approve`).set(s.auth);
    const po = await api().post('/api/purchasing/orders/from-recommendations').set(s.auth).send({ storeId: store, supplierKey: 'dairy', recIds: [recIds[0]] }).expect(201);
    await api().post(`/api/purchasing/orders/${po.body.po.poId}/cancel`).set(s.auth).expect(200);
    expect((await col('inventory_state').findOne({ tenantId: s.tenantId, sku: 'MILK1' })).onOrder).toBe(0);
  });
  test('cannot order what was not approved', async () => {
    const { s, store, recIds } = await shopWithStock();
    const r = await api().post('/api/purchasing/orders/from-recommendations').set(s.auth).send({ storeId: store, supplierKey: 'dairy', recIds }).expect(400); expect(r.body.error).toBe('nothing_approved');
  });
});

describe('batches: notify and ask the owner (D-018)', () => {
  async function twoBatches() {
    const { s, store } = await shopWithStock();
    await col('batches').insertMany([
      { tenantId: s.tenantId, storeId: store, sku: 'MILK1', batchId: 'OLD', qty: 24, remaining: 11, costPaise: 2500, receivedDate: day(-6), expiryDate: day(2), expirySource: 'entered' },
      { tenantId: s.tenantId, storeId: store, sku: 'MILK1', batchId: 'NEW', qty: 36, remaining: 36, costPaise: 2500, receivedDate: day(0), expiryDate: day(8), expirySource: 'entered' }]);
    return { s, store };
  }
  test('prompts: expiry-soon and older-batch questions are generated, capped, and valued', async () => {
    const { s } = await twoBatches(); const r = await api().get('/api/inventory/prompts').set(s.auth).expect(200);
    const types = r.body.items.map((p) => p.type); expect(types).toEqual(expect.arrayContaining(['expiry_soon', 'older_batch']));
    expect(r.body.items.find((p) => p.type === 'older_batch').question).toMatch(/How many are left/);
    expect((await api().get('/api/inventory/prompts').query({ limit: 1 }).set(s.auth)).body.shown).toBe(1);
  });
  test('answering "finished" zeros the batch, corrects on-hand, and removes the prompt', async () => {
    const { s } = await twoBatches(); const before = (await col('inventory_state').findOne({ tenantId: s.tenantId, sku: 'MILK1' })).onHand;
    await api().post('/api/inventory/batches/OLD/confirm').set(s.auth).send({ answer: 'finished' }).expect(200);
    expect((await col('batches').findOne({ batchId: 'OLD', tenantId: s.tenantId })).remaining).toBe(0);
    expect((await col('inventory_state').findOne({ tenantId: s.tenantId, sku: 'MILK1' })).onHand).toBe(before - 11);
    const r = await api().get('/api/inventory/prompts').set(s.auth); expect(r.body.items.find((p) => p.batchId === 'OLD')).toBeUndefined();
    expect(await col('batch_confirmations').countDocuments({ tenantId: s.tenantId, batchId: 'OLD' })).toBe(1);
  });
  test('"remaining N" sets the count; more than recorded is refused; discard logs a write-off', async () => {
    const { s } = await twoBatches();
    await api().post('/api/inventory/batches/OLD/confirm').set(s.auth).send({ answer: 'remaining', remaining: 99 }).expect(400);
    await api().post('/api/inventory/batches/OLD/confirm').set(s.auth).send({ answer: 'remaining', remaining: 4 }).expect(200);
    expect((await col('batches').findOne({ batchId: 'OLD', tenantId: s.tenantId })).remaining).toBe(4);
    await api().post('/api/inventory/batches/OLD/confirm').set(s.auth).send({ answer: 'discarded' }).expect(200);
    expect(await col('stock_adjustments').countDocuments({ tenantId: s.tenantId, type: 'EXPIRY_WRITEOFF' })).toBe(1);
  });
  test('an expired batch still on record is asked about first', async () => {
    const { s, store } = await shopWithStock();
    await col('batches').insertOne({ tenantId: s.tenantId, storeId: store, sku: 'MILK1', batchId: 'GONE', qty: 10, remaining: 3, costPaise: 2500, receivedDate: day(-12), expiryDate: day(-2), expirySource: 'entered' });
    const r = await api().get('/api/inventory/prompts').set(s.auth); expect(r.body.items[0].type).toBe('expired_unresolved');
  });
  test('stock count records variance, sets on-hand and reduces the earliest-expiring batch first', async () => {
    const { s, store } = await twoBatches();
    const r = await api().post('/api/inventory/stock-counts').set(s.auth).send({ storeId: store, lines: [{ sku: 'MILK1', counted: 40 }] }).expect(201);
    const l = r.body.lines[0]; expect(l.counted).toBe(40); expect(l.variance).toBe(40 - 6); expect((await col('inventory_state').findOne({ tenantId: s.tenantId, sku: 'MILK1' })).onHand).toBe(40);
    const r2 = await api().post('/api/inventory/stock-counts').set(s.auth).send({ storeId: store, lines: [{ sku: 'MILK1', counted: 30 }] }).expect(201);
    expect(r2.body.shrinkUnits).toBe(10);
    const old = await col('batches').findOne({ batchId: 'OLD', tenantId: s.tenantId }); expect(old.remaining).toBe(1);                // FEFO: older batch reduced first
  });
});

describe('dashboard, data quality, data rights, learning queue', () => {
  test('Today screen works for a brand-new shop and explains what is missing', async () => {
    const s = await newShop(); const r = await api().get('/api/today').set(s.auth).expect(200);
    expect(r.body.readiness.features.find((f) => f.name === 'Demand forecasts').ready).toBe(false); expect(r.body.orders.count).toBe(0);
  });
  test('data-quality page lists fixable issues in plain words', async () => {
    const { s } = await shopWithStock(); await col('products').updateOne({ tenantId: s.tenantId, sku: 'BISC1' }, { $unset: { costPaise: 1 } });
    const r = await api().get('/api/admin/data-quality').set(s.auth).expect(200);
    expect(r.body.issues.find((i) => i.id === 'no_cost').count).toBe(1); expect(r.body.issues.find((i) => i.id === 'no_cost').text).toMatch(/cost price/);
  });
  test('learning job is queued once, not duplicated', async () => {
    const s = await newShop(); const a = await api().post('/api/admin/pipeline/run').set(s.auth).expect(202); const b = await api().post('/api/admin/pipeline/run').set(s.auth).expect(202);
    expect(String(b.body.jobId)).toBe(String(a.body.jobId)); expect(await col('jobs').countDocuments({ tenantId: s.tenantId })).toBe(1);
  });
  test('export contains the shop data but never password hashes; delete needs the exact confirmation and removes everything', async () => {
    const { s } = await shopWithStock();
    const ex = await api().get('/api/admin/export').query({ collections: 'products,users' }).set(s.auth).expect(200);
    expect(ex.text).toMatch(/MILK1/); expect(ex.text).not.toMatch(/passwordHash/);
    const tenant = (await api().get('/api/admin/settings').set(s.auth)).body;
    await api().delete('/api/admin/tenant').set(s.auth).send({ confirm: 'delete' }).expect(400);
    await api().delete('/api/admin/tenant').set(s.auth).send({ confirm: `DELETE ${tenant.name}` }).expect(200);
    expect(await col('products').countDocuments({ tenantId: s.tenantId })).toBe(0); expect(await col('users').countDocuments({ tenantId: s.tenantId })).toBe(0);
    await api().get('/api/catalog/products').set(s.auth).expect(401);
  });
  test('demo (simulated) shops cannot be deleted', async () => {
    const s = await newShop(); await col('tenants').updateOne({ _id: s.tenantId }, { $set: { simulated: true } });
    await api().delete('/api/admin/tenant').set(s.auth).send({ confirm: 'x' }).expect(403);
  });
});
