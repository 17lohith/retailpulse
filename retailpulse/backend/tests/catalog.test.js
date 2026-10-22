import { api, setup, teardown, wipe, newShop } from './helpers.js';
beforeAll(async () => { await setup(); await wipe(); });
afterAll(teardown);

describe('products and suppliers CRUD', () => {
  test('create, read, update, delete a product', async () => {
    const s = await newShop();
    const c = await api().post('/api/catalog/products').set(s.auth).send({ sku: 'T1', name: 'Test Tea 250 g', mrpPaise: 12000, costPaise: 9000, family: 'BEVERAGES' }).expect(201);
    expect(c.body.sku).toBe('T1');
    expect((await api().get('/api/catalog/products/T1').set(s.auth).expect(200)).body.product.mrpPaise).toBe(12000);
    await api().patch('/api/catalog/products/T1').set(s.auth).send({ mrpPaise: 12500 }).expect(200);
    expect((await api().get('/api/catalog/products').set(s.auth).query({ q: 'tea' })).body.total).toBe(1);
    await api().delete('/api/catalog/products/T1').set(s.auth).expect(200);
    await api().get('/api/catalog/products/T1').set(s.auth).expect(404);
  });
  test('validation errors name the field', async () => {
    const s = await newShop();
    const r = await api().post('/api/catalog/products').set(s.auth).send({ name: 'x', mrpPaise: -5 }).expect(400);
    expect(r.body.fields.map((f) => f.field)).toEqual(expect.arrayContaining(['name', 'mrpPaise']));
  });
  test('duplicate SKU is rejected', async () => {
    const s = await newShop(); const p = { sku: 'D1', name: 'Dup Item', mrpPaise: 100 };
    await api().post('/api/catalog/products').set(s.auth).send(p).expect(201); await api().post('/api/catalog/products').set(s.auth).send(p).expect(409);
  });
  test('a product with sales history cannot be deleted, only deactivated', async () => {
    const s = await newShop(); await api().post('/api/catalog/products').set(s.auth).send({ sku: 'H1', name: 'History Item', mrpPaise: 100 }).expect(201);
    await api().post('/api/sales/quick-entry').set(s.auth).send({ storeId: s.stores[0], date: '2026-09-01', lines: [{ sku: 'H1', qty: 3 }] }).expect(201);
    const r = await api().delete('/api/catalog/products/H1').set(s.auth).expect(409); expect(r.body.error).toBe('in_use');
    await api().patch('/api/catalog/products/H1').set(s.auth).send({ active: false }).expect(200);
  });
  test('suppliers CRUD and in-use protection', async () => {
    const s = await newShop();
    await api().post('/api/catalog/suppliers').set(s.auth).send({ supplierKey: 'sup1', name: 'Metro Wholesale', leadTimeDays: 3 }).expect(201);
    await api().patch('/api/catalog/suppliers/sup1').set(s.auth).send({ leadTimeDays: 4 }).expect(200);
    await api().post('/api/catalog/products').set(s.auth).send({ sku: 'S1', name: 'Supplied Item', mrpPaise: 100, supplierKey: 'sup1' }).expect(201);
    await api().delete('/api/catalog/suppliers/sup1').set(s.auth).expect(409);
    await api().delete('/api/catalog/products/S1').set(s.auth).expect(200); await api().delete('/api/catalog/suppliers/sup1').set(s.auth).expect(200);
  });
  test('quick sale entry rejects unknown items and future dates', async () => {
    const s = await newShop();
    await api().post('/api/sales/quick-entry').set(s.auth).send({ storeId: s.stores[0], date: '2026-09-01', lines: [{ sku: 'NOPE', qty: 1 }] }).expect(400);
    await api().post('/api/sales/quick-entry').set(s.auth).send({ storeId: s.stores[0], date: '2099-01-01', lines: [{ sku: 'NOPE', qty: 1 }] }).expect(400);
  });
});
