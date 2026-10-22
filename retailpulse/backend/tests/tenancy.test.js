import { api, setup, teardown, wipe, newShop, mkProducts } from './helpers.js';
import { cleanSales } from './fixtures.js';
beforeAll(async () => { await setup(); await wipe(); });
afterAll(teardown);

describe('tenant isolation', () => {
  test("shop B cannot read, change or delete shop A's data", async () => {
    const a = await newShop('Shop A'); const b = await newShop('Shop B');
    await mkProducts(a, [{ sku: 'SECRET1', name: 'Secret Product A' }]);
    expect((await api().get('/api/catalog/products').set(b.auth)).body.total).toBe(0);
    await api().get('/api/catalog/products/SECRET1').set(b.auth).expect(404);
    await api().patch('/api/catalog/products/SECRET1').set(b.auth).send({ name: 'hacked' }).expect(404);
    await api().delete('/api/catalog/products/SECRET1').set(b.auth).expect(404);
    expect((await api().get('/api/catalog/products/SECRET1').set(a.auth)).body.product.name).toBe('Secret Product A');
  });
  test("a store id from another shop is refused", async () => {
    const a = await newShop('Shop A'); const b = await newShop('Shop B');
    await api().get('/api/sales/summary').query({ storeId: a.stores[0] }).set(b.auth).expect(404);
    await api().post('/api/imports').set(b.auth).field('type', 'sales').field('storeId', a.stores[0]).attach('file', cleanSales(), 'x.csv').expect(404);
  });
  test("imports of shop A are invisible to shop B", async () => {
    const a = await newShop('Shop A'); const b = await newShop('Shop B');
    const up = await api().post('/api/imports').set(a.auth).field('type', 'sales').field('storeId', a.stores[0]).attach('file', cleanSales(), 's.csv').expect(201);
    await api().get(`/api/imports/${up.body._id}`).set(b.auth).expect(404);
    expect((await api().get('/api/imports').set(b.auth)).body.items).toHaveLength(0);
  });
  test('tenant id in the request body is ignored', async () => {
    const a = await newShop('Shop A'); const b = await newShop('Shop B');
    await api().post('/api/catalog/products').set(a.auth).send({ sku: 'X1', name: 'Injected', mrpPaise: 1, tenantId: b.tenantId }).expect(201);
    expect((await api().get('/api/catalog/products').set(b.auth)).body.total).toBe(0);
    expect((await api().get('/api/catalog/products').set(a.auth)).body.total).toBe(1);
  });
});
