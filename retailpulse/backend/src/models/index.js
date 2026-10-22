import mongoose from 'mongoose';
const { Schema, model, models } = mongoose;
const opts = (coll, extra = {}) => ({ collection: coll, versionKey: false, ...extra });
const def = (name, schema, coll) => models[name] || model(name, schema, coll);

// ---- tenancy & identity
export const Tenant = def('Tenant', new Schema({
  _id: String, name: { type: String, required: true }, kind: String, plan: { type: String, default: 'starter' },
  simulated: Boolean, asOfDate: String, currency: { type: String, default: 'INR' }, timezone: { type: String, default: 'Asia/Kolkata' },
  settings: { type: Schema.Types.Mixed, default: {} }, createdAt: { type: Date, default: Date.now },
}, opts('tenants')), 'tenants');

export const Store = def('Store', new Schema({
  _id: String, storeId: String, tenantId: { type: String, index: true }, name: String, city: String, simulated: Boolean,
}, opts('stores')), 'stores');

export const User = def('User', new Schema({
  tenantId: { type: String, index: true, required: true }, email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: String, passwordHash: { type: String, required: true }, role: { type: String, enum: ['owner', 'manager', 'staff'], default: 'staff' },
  active: { type: Boolean, default: true }, failedLogins: { type: Number, default: 0 }, lockedUntil: Date, createdAt: { type: Date, default: Date.now },
}, opts('users')), 'users');

// ---- catalogue & inventory (collections shared with the Python loaders -> strict:false keeps unknown fields)
export const Product = def('Product', new Schema({
  tenantId: { type: String, required: true }, sku: { type: String, required: true }, name: { type: String, required: true },
  brand: String, family: String, subcategory: String, barcode: String, mrpPaise: { type: Number, min: 0 }, costPaise: { type: Number, min: 0 },
  packSize: { type: Number, default: 1, min: 1 }, shelfLifeDays: Number, trackingPolicy: { type: String, enum: ['strict', 'estimate', 'off'], default: 'off' },
  supplierKey: String, aliases: [String], active: { type: Boolean, default: true }, simulated: Boolean,
}, opts('products', { strict: false })).index({ tenantId: 1, sku: 1 }, { unique: true }), 'products');

export const Supplier = def('Supplier', new Schema({
  tenantId: { type: String, required: true }, supplierKey: { type: String, required: true }, name: { type: String, required: true },
  leadTimeDays: { type: Number, default: 2, min: 0 }, reviewPeriodDays: { type: Number, default: 3, min: 1 }, phone: String, simulated: Boolean,
}, opts('suppliers', { strict: false })).index({ tenantId: 1, supplierKey: 1 }, { unique: true }), 'suppliers');

export const Batch = def('Batch', new Schema({
  tenantId: String, storeId: String, sku: String, batchId: String, poId: String, qty: Number, remaining: Number, costPaise: Number,
  receivedDate: String, mfgDate: String, expiryDate: String, expirySource: String, confirmed: Boolean, confirmedAt: Date, status: String, simulated: Boolean,
}, opts('batches', { strict: false })), 'batches');

export const PurchaseOrder = def('PurchaseOrder', new Schema({
  tenantId: String, storeId: String, poId: String, supplierKey: String, orderDate: String, expectedDate: String, receivedDate: String,
  status: { type: String, default: 'DRAFT' }, lines: [Schema.Types.Mixed], notes: String, simulated: Boolean,
}, opts('purchase_orders', { strict: false })), 'purchase_orders');

export const StockAdjustment = def('StockAdjustment', new Schema({}, opts('stock_adjustments', { strict: false })), 'stock_adjustments');
export const InventoryState = def('InventoryState', new Schema({}, opts('inventory_state', { strict: false })).index({ tenantId: 1, storeId: 1, sku: 1 }, { unique: true }), 'inventory_state');
export const Sale = def('Sale', new Schema({}, opts('sales', { strict: false })), 'sales');

// ---- analytics outputs written by the Python engine
export const Forecast = def('Forecast', new Schema({}, opts('forecasts', { strict: false })), 'forecasts');
export const Recommendation = def('Recommendation', new Schema({}, opts('recommendations', { strict: false })), 'recommendations');
export const InventoryInsight = def('InventoryInsight', new Schema({}, opts('inventory_insights', { strict: false })), 'inventory_insights');
export const ForecastRun = def('ForecastRun', new Schema({}, opts('forecast_runs', { strict: false })), 'forecast_runs');

// ---- ingestion
export const ImportJob = def('ImportJob', new Schema({
  tenantId: { type: String, index: true }, userId: String, type: { type: String, enum: ['sales', 'products', 'stock', 'purchases'] },
  storeId: String, source: String, filename: String, sizeBytes: Number, sha256: String, filePath: String, gridfsId: Schema.Types.ObjectId,
  status: { type: String, default: 'uploaded' }, analysis: Schema.Types.Mixed, mapping: Schema.Types.Mixed, report: Schema.Types.Mixed,
  commitResult: Schema.Types.Mixed, error: String, createdAt: { type: Date, default: Date.now }, updatedAt: Date,
}, opts('import_jobs')), 'import_jobs');
export const ImportError = def('ImportError', new Schema({
  importId: { type: String, index: true }, tenantId: String, rowNumber: Number, reason: String, raw: Schema.Types.Mixed,
}, opts('import_errors')), 'import_errors');
export const ImportOverwrite = def('ImportOverwrite', new Schema({}, opts('import_overwrites', { strict: false })), 'import_overwrites');
export const ColumnMapping = def('ColumnMapping', new Schema({
  tenantId: String, type: String, source: String, mapping: Schema.Types.Mixed, dateFormat: String, updatedAt: Date,
}, opts('column_mappings')), 'column_mappings');

// ---- workflow
export const BatchConfirmation = def('BatchConfirmation', new Schema({
  tenantId: String, batchId: String, sku: String, storeId: String, answer: String, remaining: Number, userId: String, trigger: String,
  createdAt: { type: Date, default: Date.now },
}, opts('batch_confirmations')), 'batch_confirmations');
export const StockCount = def('StockCount', new Schema({
  tenantId: String, storeId: String, userId: String, lines: [Schema.Types.Mixed], createdAt: { type: Date, default: Date.now },
}, opts('stock_counts')), 'stock_counts');
export const Job = def('Job', new Schema({}, opts('jobs', { strict: false })), 'jobs');
export const AuditLog = def('AuditLog', new Schema({
  tenantId: { type: String, index: true }, userId: String, userEmail: String, action: String, entity: String, entityId: String,
  detail: Schema.Types.Mixed, at: { type: Date, default: Date.now },
}, opts('audit_log')), 'audit_log');
