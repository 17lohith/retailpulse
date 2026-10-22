import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z, wrap, validate, HttpError, audit } from '../middleware/common.js';
import { requireAuth, requireRole, signToken } from '../middleware/auth.js';
import { Tenant, Store, User } from '../models/index.js';

const r = Router();
const pw = z.string().min(8, 'Use at least 8 characters').max(100);

r.post('/register', validate(z.object({
  shopName: z.string().min(2).max(80), name: z.string().min(1).max(80), email: z.string().email(), password: pw,
  kind: z.enum(['kirana', 'supermarket', 'small-chain']).default('supermarket'), stores: z.number().int().min(1).max(50).default(1),
})), wrap(async (req, res) => {
  const b = req.body;
  if (await User.exists({ email: b.email.toLowerCase() })) throw new HttpError(409, 'email_taken', 'An account with this email already exists.');
  const tid = 't-' + crypto.randomBytes(5).toString('hex');
  await Tenant.create({ _id: tid, name: b.shopName, kind: b.kind, plan: 'starter', settings: { expiryAlertDays: { strict: 5, estimate: 30 }, lowStockBuffer: 1 } });
  await Store.insertMany(Array.from({ length: b.stores }, (_, i) => ({ _id: `${tid}-S${i + 1}`, storeId: `${tid}-S${i + 1}`, tenantId: tid, name: b.stores === 1 ? b.shopName : `${b.shopName} - Branch ${i + 1}` })));
  const u = await User.create({ tenantId: tid, email: b.email, name: b.name, role: 'owner', passwordHash: await bcrypt.hash(b.password, 10) });
  req.tenantId = tid; req.user = { id: String(u._id), email: u.email };
  audit(req, 'register', 'tenant', tid);
  res.status(201).json({ token: signToken(u), user: { id: u._id, email: u.email, name: u.name, role: u.role, tenantId: tid } });
}));

r.post('/login', validate(z.object({ email: z.string().email(), password: z.string().min(1) })), wrap(async (req, res) => {
  const u = await User.findOne({ email: req.body.email.toLowerCase() });
  const bad = () => new HttpError(401, 'bad_credentials', 'Email or password is not correct.');
  if (!u || !u.active) throw bad();
  if (u.lockedUntil && u.lockedUntil > new Date()) throw new HttpError(429, 'locked', 'Too many wrong attempts. Try again in a few minutes.');
  if (!(await bcrypt.compare(req.body.password, u.passwordHash))) {
    u.failedLogins += 1; if (u.failedLogins >= 5) { u.lockedUntil = new Date(Date.now() + 10 * 60 * 1000); u.failedLogins = 0; }
    await u.save(); throw bad();
  }
  u.failedLogins = 0; u.lockedUntil = undefined; await u.save();
  req.tenantId = u.tenantId; req.user = { id: String(u._id), email: u.email }; audit(req, 'login', 'user', u._id);
  res.json({ token: signToken(u), user: { id: u._id, email: u.email, name: u.name, role: u.role, tenantId: u.tenantId } });
}));

r.get('/me', requireAuth, wrap(async (req, res) => {
  const [t, stores] = await Promise.all([Tenant.findById(req.tenantId).lean(), Store.find({ tenantId: req.tenantId }).lean()]);
  res.json({ user: req.user, tenant: t, stores });
}));

// ---- user management (owner)
r.get('/users', requireAuth, requireRole('owner'), wrap(async (req, res) =>
  res.json(await User.find({ tenantId: req.tenantId }).select('-passwordHash -failedLogins').lean())));
r.post('/users', requireAuth, requireRole('owner'), validate(z.object({
  email: z.string().email(), name: z.string().min(1), password: pw, role: z.enum(['manager', 'staff']) })), wrap(async (req, res) => {
  if (await User.exists({ email: req.body.email.toLowerCase() })) throw new HttpError(409, 'email_taken', 'That email is already used.');
  const u = await User.create({ ...req.body, tenantId: req.tenantId, passwordHash: await bcrypt.hash(req.body.password, 10) });
  audit(req, 'create_user', 'user', u._id, { role: u.role });
  res.status(201).json({ id: u._id, email: u.email, role: u.role });
}));
r.patch('/users/:id', requireAuth, requireRole('owner'), validate(z.object({ active: z.boolean().optional(), role: z.enum(['manager', 'staff']).optional() })), wrap(async (req, res) => {
  const u = await User.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId, role: { $ne: 'owner' } }, req.body, { new: true }).select('-passwordHash');
  if (!u) throw new HttpError(404, 'not_found', 'User not found.');
  audit(req, 'update_user', 'user', u._id, req.body); res.json(u);
}));
export default r;
