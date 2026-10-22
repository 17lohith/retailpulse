import mongoose from 'mongoose';
export async function ensureIndexes() {
  const c = (n) => mongoose.connection.collection(n);
  await Promise.all([
    c('sales').createIndex({ tenantId: 1, date: 1 }), c('sales').createIndex({ tenantId: 1, storeId: 1, date: 1, sku: 1 }), c('sales').createIndex({ tenantId: 1, sku: 1, date: 1 }), c('sales').createIndex({ tenantId: 1, importId: 1 }, { sparse: true }),
    c('products').createIndex({ tenantId: 1, sku: 1 }, { unique: true }), c('products').createIndex({ tenantId: 1, family: 1 }),
    c('batches').createIndex({ tenantId: 1, storeId: 1, sku: 1, expiryDate: 1 }), c('batches').createIndex({ tenantId: 1, status: 1 }), c('batches').createIndex({ tenantId: 1, batchId: 1 }),
    c('inventory_state').createIndex({ tenantId: 1, storeId: 1, sku: 1 }, { unique: true }), c('inventory_insights').createIndex({ tenantId: 1, storeId: 1, daysOfCover: 1 }),
    c('recommendations').createIndex({ tenantId: 1, status: 1, urgency: 1 }), c('purchase_orders').createIndex({ tenantId: 1, poId: 1 }),
    c('audit_log').createIndex({ tenantId: 1, at: -1 }), c('jobs').createIndex({ status: 1, createdAt: 1 }), c('import_errors').createIndex({ importId: 1 }),
    c('mr_results').createIndex({ job: 1, key: 1 }),
  ]);
}
