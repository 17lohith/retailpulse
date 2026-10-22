import { InventoryState, StockAdjustment } from '../models/index.js';

export async function adjustOnHand(tenantId, storeId, sku, delta, extra = {}) {
  await InventoryState.updateOne({ tenantId, storeId, sku }, { $inc: { onHand: delta, ...(extra.onOrder ? { onOrder: extra.onOrder } : {}) },
    $setOnInsert: { tenantId, storeId, sku, ...(extra.onOrder ? {} : { onOrder: 0 }) } }, { upsert: true });
}
export const logMovement = (req, doc) => StockAdjustment.create({ tenantId: req.tenantId, userId: req.user?.id, date: doc.date, ...doc });
