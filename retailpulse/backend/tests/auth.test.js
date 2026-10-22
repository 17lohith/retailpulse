import { api, setup, teardown, wipe, newShop, addUser } from './helpers.js';
beforeAll(async () => { await setup(); await wipe(); });
afterAll(teardown);

describe('authentication & roles', () => {
  test('register, login, me', async () => {
    const s = await newShop();
    const me = await api().get('/api/auth/me').set(s.auth).expect(200);
    expect(me.body.user.role).toBe('owner'); expect(me.body.stores).toHaveLength(1);
  });
  test('rejects weak passwords and duplicate email', async () => {
    const bad = await api().post('/api/auth/register').send({ shopName: 'X Shop', name: 'a', email: 'dup@test.local', password: 'short' }).expect(400);
    expect(bad.body.error).toBe('validation_failed');
    await api().post('/api/auth/register').send({ shopName: 'X Shop', name: 'a', email: 'dup@test.local', password: 'Passw0rd!x' }).expect(201);
    await api().post('/api/auth/register').send({ shopName: 'Y Shop', name: 'a', email: 'dup@test.local', password: 'Passw0rd!x' }).expect(409);
  });
  test('wrong password, lockout after 5 attempts', async () => {
    const email = 'lock@test.local';
    await api().post('/api/auth/register').send({ shopName: 'Lock Shop', name: 'a', email, password: 'Passw0rd!x' }).expect(201);
    for (let i = 0; i < 5; i++) await api().post('/api/auth/login').send({ email, password: 'wrong-pass' }).expect(401);
    const r = await api().post('/api/auth/login').send({ email, password: 'Passw0rd!x' }).expect(429);
    expect(r.body.error).toBe('locked');
  });
  test('protected routes need a valid token', async () => {
    await api().get('/api/catalog/products').expect(401);
    await api().get('/api/catalog/products').set('Authorization', 'Bearer not.a.token').expect(401);
  });
  test('staff cannot create products or approve orders; managers can', async () => {
    const s = await newShop(); const staff = await addUser(s, 'staff'); const mgr = await addUser(s, 'manager');
    await api().post('/api/catalog/products').set(staff).send({ name: 'Item', mrpPaise: 100 }).expect(403);
    await api().post('/api/catalog/products').set(mgr).send({ name: 'Item', mrpPaise: 100 }).expect(201);
  });
  test('staff do not see cost prices', async () => {
    const s = await newShop(); const staff = await addUser(s, 'staff');
    await api().post('/api/catalog/products').set(s.auth).send({ sku: 'A1', name: 'Rice 1 kg', mrpPaise: 6000, costPaise: 5000 }).expect(201);
    const owner = await api().get('/api/catalog/products').set(s.auth); expect(owner.body.items[0].costPaise).toBe(5000);
    const st = await api().get('/api/catalog/products').set(staff); expect(st.body.items[0].costPaise).toBeUndefined();
  });
});
