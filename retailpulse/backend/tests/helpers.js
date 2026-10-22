import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app.js';
import { connectDb } from '../src/db.js';

export const app = createApp();
export const api = () => request(app);
export async function setup() { await connectDb(); }
export async function teardown() { await mongoose.disconnect(); }
export async function wipe() {
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  const { ensureIndexes } = await import('../src/indexes.js'); await ensureIndexes();
}
let n = 0;
export async function newShop(name = 'Test Mart', stores = 1) {
  n += 1;
  const r = await api().post('/api/auth/register').send({ shopName: `${name} ${n}`, name: 'Owner', email: `owner${n}-${Date.now()}@test.local`, password: 'Passw0rd!x', stores });
  if (r.status !== 201) throw new Error('register failed ' + JSON.stringify(r.body));
  const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${r.body.token}`);
  return { token: r.body.token, tenantId: r.body.user.tenantId, stores: me.body.stores.map((s) => s._id), auth: { Authorization: `Bearer ${r.body.token}` } };
}
export async function addUser(shop, role) {
  n += 1; const email = `${role}${n}-${Date.now()}@test.local`;
  await api().post('/api/auth/users').set(shop.auth).send({ email, name: role, password: 'Passw0rd!x', role }).expect(201);
  const l = await api().post('/api/auth/login').send({ email, password: 'Passw0rd!x' }).expect(200);
  return { Authorization: `Bearer ${l.body.token}` };
}
export async function waitFor(shop, id, states, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const r = await api().get(`/api/imports/${id}`).set(shop.auth);
    if (states.includes(r.body.status)) return r.body;
    if (r.body.status === 'failed' || Date.now() - t0 > ms) throw new Error(`import ${id} ended ${r.body.status}: ${r.body.error}`);
    await new Promise((ok) => setTimeout(ok, 100));
  }
}
export const mkProducts = (shop, items) => Promise.all(items.map((p) => api().post('/api/catalog/products').set(shop.auth).send({ mrpPaise: 5000, costPaise: 4000, packSize: 1, ...p }).expect(201)));
