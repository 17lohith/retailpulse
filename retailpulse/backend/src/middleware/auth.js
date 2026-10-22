import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/index.js';

export const signToken = (u) => jwt.sign({ sub: String(u._id), tid: u.tenantId, role: u.role }, config.jwtSecret, { expiresIn: config.jwtExpires });

/** Authenticates the Bearer token and injects req.user + req.tenantId. tenantId ALWAYS comes from the token, never from the request. */
export async function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'auth_required', message: 'Please sign in.' });
  try {
    const p = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(p.sub).lean();
    if (!user || !user.active) return res.status(401).json({ error: 'invalid_user', message: 'Account not found or disabled.' });
    req.user = { id: String(user._id), email: user.email, name: user.name, role: user.role, tenantId: user.tenantId };
    req.tenantId = user.tenantId;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token', message: 'Session expired. Please sign in again.' });
  }
}

const RANK = { staff: 1, manager: 2, owner: 3 };
export const requireRole = (min) => (req, res, next) =>
  RANK[req.user?.role] >= RANK[min] ? next() : res.status(403).json({ error: 'forbidden', message: `This needs ${min} access.` });

/** Staff must not see cost / margin information. */
export function stripCost(req, doc) {
  if (req.user?.role !== 'staff' || !doc) return doc;
  const strip = (o) => { if (o && typeof o === 'object') { delete o.costPaise; delete o.unitCostPaise; delete o.estCostPaise; delete o.cashTiedPaise; } return o; };
  return Array.isArray(doc) ? doc.map(strip) : strip(doc);
}
