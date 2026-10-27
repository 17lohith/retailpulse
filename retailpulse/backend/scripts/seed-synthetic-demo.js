import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import bcrypt from 'bcryptjs';
import { connectDb, disconnectDb } from '../src/db.js';
import {
  Tenant, Store, User, Supplier, Product, Batch,
  InventoryState, Sale, Recommendation, InventoryInsight,
  ForecastRun, Forecast
} from '../src/models/index.js';

const PASSWORD = process.env.DEMO_PASSWORD || 'Demo@1234';
const AS_OF_DATE = '2026-10-27';

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SUPPLIERS_DEF = [
  { supplierKey: 'wholesale', name: 'Sri Balaji Wholesale Staples & Groceries', leadTimeDays: 3, reviewPeriodDays: 4, phone: '+91 98450 11223' },
  { supplierKey: 'dairy', name: 'Amul & Nandini Fresh Dairy Supply', leadTimeDays: 1, reviewPeriodDays: 1, phone: '+91 98450 22334' },
  { supplierKey: 'produce', name: 'Direct Farm Produce Co-op', leadTimeDays: 1, reviewPeriodDays: 2, phone: '+91 98450 33445' },
  { supplierKey: 'bakery', name: 'Britannia & Daily Fresh Breads', leadTimeDays: 1, reviewPeriodDays: 1, phone: '+91 98450 44556' },
  { supplierKey: 'beverage', name: 'South India Beverages & Juices', leadTimeDays: 2, reviewPeriodDays: 3, phone: '+91 98450 55667' },
  { supplierKey: 'frozen', name: 'FrostBite Cold Chain & Frozen Foods', leadTimeDays: 2, reviewPeriodDays: 3, phone: '+91 98450 66778' },
  { supplierKey: 'meat', name: 'Royal Poultry & Fresh Meats', leadTimeDays: 1, reviewPeriodDays: 2, phone: '+91 98450 77889' },
  { supplierKey: 'home', name: 'Metro FMCG & Home Care Distributors', leadTimeDays: 2, reviewPeriodDays: 4, phone: '+91 98450 88990' },
];

const TENANTS_DEF = [
  {
    _id: 'demo-a',
    name: 'Sri Lakshmi Provision Store',
    kind: 'kirana',
    plan: 'demo',
    simulated: true,
    asOfDate: AS_OF_DATE,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    settings: { expiryAlertDays: { strict: 5, estimate: 30 }, lowStockBuffer: 1 },
    stores: [
      { _id: 'demo-a-S1', storeId: 'demo-a-S1', name: 'Sri Lakshmi Provision Store', city: 'Bengaluru' },
    ],
  },
  {
    _id: 'demo-b',
    name: 'GreenMart Supermarkets',
    kind: 'small-chain',
    plan: 'demo',
    simulated: true,
    asOfDate: AS_OF_DATE,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    settings: { expiryAlertDays: { strict: 5, estimate: 30 }, lowStockBuffer: 1 },
    stores: [
      { _id: 'demo-b-S1', storeId: 'demo-b-S1', name: 'GreenMart - Indiranagar', city: 'Bengaluru' },
      { _id: 'demo-b-S2', storeId: 'demo-b-S2', name: 'GreenMart - Koramangala', city: 'Bengaluru' },
      { _id: 'demo-b-S3', storeId: 'demo-b-S3', name: 'GreenMart - Whitefield', city: 'Bengaluru' },
    ],
  },
  {
    _id: 'demo-c',
    name: 'Annapurna Fresh & Provisions',
    kind: 'supermarket',
    plan: 'demo',
    simulated: true,
    asOfDate: AS_OF_DATE,
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    settings: { expiryAlertDays: { strict: 5, estimate: 30 }, lowStockBuffer: 1 },
    stores: [
      { _id: 'demo-c-S1', storeId: 'demo-c-S1', name: 'Annapurna Fresh - Jayanagar', city: 'Bengaluru' },
    ],
  },
];

async function loadProductsCatalog() {
  const filePaths = [
    path.resolve(process.cwd(), 'scripts/products_all.jsonl'),
    path.resolve(process.cwd(), '../hadoop/streaming/products_all.jsonl'),
    path.resolve(process.cwd(), 'retailpulse/hadoop/streaming/products_all.jsonl'),
    '/home/ubuntu/retailpulse/retailpulse/hadoop/streaming/products_all.jsonl'
  ];
  let chosen = null;
  for (const fp of filePaths) {
    if (fs.existsSync(fp)) { chosen = fp; break; }
  }
  if (!chosen) throw new Error('Cannot find products_all.jsonl');
  
  const products = [];
  const rl = readline.createInterface({ input: fs.createReadStream(chosen), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) products.push(JSON.parse(line));
  }
  return products;
}

async function main() {
  console.log('Connecting to database...');
  await connectDb();
  console.log('Connected! Loading product catalog...');
  const catalog = await loadProductsCatalog();
  console.log(`Loaded ${catalog.length} catalog items.`);

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const tDef of TENANTS_DEF) {
    const tId = tDef._id;
    console.log(`\n--- Seeding ${tDef.name} (${tId}) ---`);

    // 1. Tenant
    await Tenant.replaceOne({ _id: tId }, {
      _id: tId, name: tDef.name, kind: tDef.kind, plan: tDef.plan,
      simulated: true, asOfDate: tDef.asOfDate, currency: tDef.currency,
      timezone: tDef.timezone, settings: tDef.settings, createdAt: new Date()
    }, { upsert: true });

    // 2. Stores
    await Store.deleteMany({ tenantId: tId });
    await Store.insertMany(tDef.stores.map(s => ({ ...s, tenantId: tId, simulated: true })));

    // 3. Users
    for (const role of ['owner', 'manager', 'staff']) {
      const email = `${role}@${tId}.retailpulse.test`;
      await User.deleteMany({ email });
      await User.create({
        tenantId: tId, email, name: `${tDef.name} ${role.toUpperCase()}`,
        role, passwordHash, active: true
      });
      console.log(`  User: ${email} (Password: ${PASSWORD})`);
    }

    // 4. Suppliers
    await Supplier.deleteMany({ tenantId: tId });
    await Supplier.insertMany(SUPPLIERS_DEF.map(s => ({ ...s, tenantId: tId, simulated: true })));

    // 5. Products selection
    let prods = [];
    if (tId === 'demo-a') {
      prods = catalog.filter(p => p.tenantId === 'demo-a');
    } else if (tId === 'demo-b') {
      prods = catalog.filter(p => p.tenantId === 'demo-b');
    } else {
      // demo-c: take 800 items and assign unique SKUs for demo-c
      prods = catalog.slice(0, 800).map((p, i) => ({
        ...p,
        tenantId: 'demo-c',
        sku: `SKU-C-${String(i + 1).padStart(5, '0')}`
      }));
    }

    await Product.deleteMany({ tenantId: tId });
    await Product.insertMany(prods.map(p => ({
      tenantId: tId,
      sku: p.sku,
      name: p.name,
      brand: p.brand || 'Quality Choice',
      family: p.family || 'GROCERY I',
      subcategory: p.subcategory || 'Groceries',
      barcode: p.barcode || String(Math.floor(100000000000 + Math.random() * 900000000000)),
      mrpPaise: p.mrpPaise || 12000,
      costPaise: p.costPaise || Math.round((p.mrpPaise || 12000) * 0.75),
      packSize: p.packSize || 1,
      shelfLifeDays: p.shelfLifeDays || 180,
      trackingPolicy: p.trackingPolicy || 'estimate',
      supplierKey: p.supplierKey || 'wholesale',
      active: true,
      simulated: true
    })));
    console.log(`  Seeded ${prods.length} products.`);

    // 6. Generate Sales, Inventory, Batches, Recommendations, Insights
    await Sale.deleteMany({ tenantId: tId });
    await InventoryState.deleteMany({ tenantId: tId });
    await Batch.deleteMany({ tenantId: tId });
    await Recommendation.deleteMany({ tenantId: tId });
    await InventoryInsight.deleteMany({ tenantId: tId });
    await Forecast.deleteMany({ tenantId: tId });
    await ForecastRun.deleteMany({ tenantId: tId });

    const salesDocs = [];
    const invDocs = [];
    const batchDocs = [];
    const recDocs = [];
    const insightDocs = [];
    const forecastDocs = [];

    // Pre-calculate SKU daily demand characteristics
    const skuMeta = prods.map((p, idx) => {
      // Tier: top 15% are fast movers (demand 8..28/day), next 35% normal (2..7/day), rest slow/intermittent (0.1..1.5/day)
      let tier = 'normal';
      let baseDaily = 4.0;
      if (idx < Math.round(prods.length * 0.15)) {
        tier = 'fast';
        baseDaily = 10 + (idx % 18);
      } else if (idx > Math.round(prods.length * 0.65)) {
        tier = 'slow';
        baseDaily = 0.2 + ((idx % 10) * 0.15);
      } else {
        baseDaily = 2 + (idx % 6);
      }
      return { p, tier, baseDaily };
    });

    for (const store of tDef.stores) {
      const sId = store._id;
      console.log(`  Generating operational data for store ${sId}...`);

      // 60 days of historical sales ending at AS_OF_DATE
      for (let dayOffset = -59; dayOffset <= 0; dayOffset++) {
        const date = addDays(AS_OF_DATE, dayOffset);
        const dayOfWeek = new Date(date + 'T00:00:00Z').getUTCDay(); // 0 = Sun, 6 = Sat
        const weekendMult = (dayOfWeek === 0) ? 1.45 : (dayOfWeek === 6) ? 1.35 : 1.0;

        for (const { p, tier, baseDaily } of skuMeta) {
          // Determine if product sold on this day
          const prob = (tier === 'fast') ? 0.95 : (tier === 'normal') ? 0.70 : 0.25;
          if (Math.random() < prob) {
            const qty = Math.max(1, Math.round(baseDaily * weekendMult * (0.7 + Math.random() * 0.6)));
            salesDocs.push({
              tenantId: tId,
              storeId: sId,
              date,
              sku: p.sku,
              qty,
              pricePaise: p.mrpPaise,
              revenuePaise: qty * p.mrpPaise,
              simulated: true
            });
          }
        }
      }

      // Current inventory & recommendations & batches
      skuMeta.forEach(({ p, tier, baseDaily }, idx) => {
        const leadTime = SUPPLIERS_DEF.find(s => s.supplierKey === p.supplierKey)?.leadTimeDays || 2;
        const safetyStock = Math.round(baseDaily * 2);
        const reorderPoint = Math.round(baseDaily * leadTime + safetyStock);

        // Intentionally create 10-15 stockout risk items in fast tier
        const isUrgentRisk = (tier === 'fast' && idx < 12);
        let onHand = isUrgentRisk 
          ? Math.max(1, Math.round(baseDaily * 0.4)) 
          : (tier === 'slow') ? Math.round(baseDaily * 80 + 15) : Math.round(baseDaily * (3 + (idx % 5)));

        invDocs.push({
          tenantId: tId,
          storeId: sId,
          sku: p.sku,
          onHand,
          safetyStock,
          reorderPoint,
          supplierKey: p.supplierKey,
          simulated: true
        });

        const dailyDemand = Math.round(baseDaily * 10) / 10;
        const daysOfCover = Math.round((onHand / Math.max(dailyDemand, 0.1)) * 10) / 10;
        const cashTiedPaise = onHand * (p.costPaise || Math.round(p.mrpPaise * 0.75));

        insightDocs.push({
          tenantId: tId,
          storeId: sId,
          sku: p.sku,
          dailyDemand,
          daysOfCover,
          velocity: (daysOfCover < 3) ? 'fast' : (daysOfCover > 45) ? 'slow' : 'normal',
          cashTiedPaise,
          onHand,
          simulated: true
        });

        // Recommendations for items running low
        if (onHand <= reorderPoint || isUrgentRisk) {
          const packSize = p.packSize || 1;
          const deficit = (dailyDemand * (leadTime + 3)) - onHand;
          const suggestedQty = Math.max(packSize, Math.ceil(deficit / packSize) * packSize);
          const urgency = (daysOfCover <= 1.0) ? 'now' : 'soon';
          const sup = SUPPLIERS_DEF.find(s => s.supplierKey === p.supplierKey);

          recDocs.push({
            tenantId: tId,
            storeId: sId,
            sku: p.sku,
            supplierKey: p.supplierKey,
            supplierName: sup?.name || 'Wholesale Supplier',
            suggestedQty,
            finalQty: suggestedQty,
            unitCostPaise: p.costPaise,
            estCostPaise: suggestedQty * p.costPaise,
            status: 'suggested',
            urgency,
            reason: {
              text: `Sells ~${dailyDemand}/day · ${onHand} in stock (≈ ${daysOfCover} days of cover) · supplier delivers in ${leadTime} days · order today.`
            },
            simulated: true,
            createdAt: new Date()
          });
        }

        // Batches with realistic expiry
        if (p.trackingPolicy !== 'off') {
          // 1st batch: active on hand
          const batchId1 = `BAT-${p.sku}-${sId}-01`;
          let exp1 = addDays(AS_OF_DATE, (idx % 2 === 0) ? (3 + (idx % 4)) : (25 + (idx % 30)));
          
          // Force a few batches to be expired 2 days ago to test owner questions
          if (idx === 1 || idx === 7 || idx === 15) {
            exp1 = addDays(AS_OF_DATE, -2);
          }

          batchDocs.push({
            tenantId: tId,
            storeId: sId,
            sku: p.sku,
            batchId: batchId1,
            qty: onHand,
            remaining: onHand,
            costPaise: p.costPaise,
            receivedDate: addDays(AS_OF_DATE, -20),
            expiryDate: exp1,
            expirySource: p.trackingPolicy === 'strict' ? 'strict' : 'estimated',
            status: (exp1 < AS_OF_DATE) ? 'pending_expiry' : 'active',
            simulated: true
          });
        }

        // 28-day forward forecast points for top 30 SKUs
        if (idx < 30) {
          for (let fDay = 1; fDay <= 28; fDay++) {
            const fDate = addDays(AS_OF_DATE, fDay);
            const dow = new Date(fDate + 'T00:00:00Z').getUTCDay();
            const mult = (dow === 0 || dow === 6) ? 1.35 : 1.0;
            const pred = Math.max(1, Math.round(baseDaily * mult));
            forecastDocs.push({
              tenantId: tId,
              storeId: sId,
              sku: p.sku,
              date: fDate,
              pred,
              p10: Math.max(0, Math.round(pred * 0.7)),
              p90: Math.round(pred * 1.35),
              simulated: true
            });
          }
        }
      });
    }

    // Bulk insert into collections
    console.log(`  Writing ${salesDocs.length} sales records...`);
    for (let i = 0; i < salesDocs.length; i += 5000) {
      await Sale.insertMany(salesDocs.slice(i, i + 5000), { ordered: false });
    }

    await InventoryState.insertMany(invDocs, { ordered: false });
    await Batch.insertMany(batchDocs, { ordered: false });
    await Recommendation.insertMany(recDocs, { ordered: false });
    await InventoryInsight.insertMany(insightDocs, { ordered: false });
    if (forecastDocs.length) await Forecast.insertMany(forecastDocs, { ordered: false });

    await ForecastRun.create({
      tenantId: tId,
      model: 'gbm',
      status: 'completed',
      metrics: { wape: 0.142, mae: 14.8, rmse: 24.2 },
      seriesCount: prods.length,
      createdAt: new Date()
    });

    console.log(`  Summary for ${tDef.name}:`);
    console.log(`    Sales: ${salesDocs.length}`);
    console.log(`    Inventory items: ${invDocs.length}`);
    console.log(`    Active batches: ${batchDocs.length}`);
    console.log(`    Order recommendations: ${recDocs.length}`);
    console.log(`    Inventory insights: ${insightDocs.length}`);
  }

  console.log('\nAll 3 demo shops seeded successfully!');
  await disconnectDb();
}

main().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
