#!/usr/bin/env python3
"""Load a SIMULATED tenant (demo-a | demo-b) into the app collections."""
import json, sys, pandas as pd, time
from mongo_common import db, bulk, ROOT
sys.path.insert(0, str(ROOT / "simulation")); from generate import TENANTS
t = sys.argv[1]; src = ROOT / "data/clean/sim" / t; D = db(); t0 = time.time()
rep = json.load(open(src / "sim_report.json")); cfg = TENANTS[t]
for c in ("products", "suppliers", "batches", "purchase_orders", "stock_adjustments", "inventory_state", "sales", "sim_future_sales", "sim_truth"):
    D[c].delete_many({"tenantId": t})
D.tenants.replace_one({"_id": t}, dict(_id=t, name=cfg["name"], kind=cfg["kind"], plan="demo", simulated=True, asOfDate=rep["visible_through"],
                                      currency="INR", timezone="Asia/Kolkata"), upsert=True)
D.stores.delete_many({"tenantId": t})
D.stores.insert_many([dict(_id=f"{t}-S{i+1}", storeId=f"{t}-S{i+1}", tenantId=t, name=f"{cfg['name']}" + ("" if cfg["stores"] == 1 else f" - Branch {i+1}"), simulated=True) for i in range(cfg["stores"])])
def jl(name):
    for l in open(src / f"{name}.jsonl"): yield json.loads(l)
counts = {}
counts["products"] = bulk(D.products, jl("products")); counts["suppliers"] = bulk(D.suppliers, jl("suppliers"))
counts["batches"] = bulk(D.batches, jl("batches")); counts["purchase_orders"] = bulk(D.purchase_orders, jl("purchase_orders"))
counts["stock_adjustments"] = bulk(D.stock_adjustments, jl("stock_adjustments")); counts["inventory_state"] = bulk(D.inventory_state, jl("inventory_state"))
def csv_docs(name, coll, drop=()):
    n = 0
    for ch in pd.read_csv(src / name, chunksize=100000):
        ch["tenantId"] = t; ch["simulated"] = True
        for c in drop: ch.pop(c, None)
        coll.insert_many(ch.to_dict("records"), ordered=False); n += len(ch)
    return n
counts["sales"] = csv_docs("sales_daily.csv.gz", D.sales); counts["sim_future_sales"] = csv_docs("future_sales_daily.csv.gz", D.sim_future_sales)
counts["sim_truth"] = csv_docs("TRUTH_demand_and_stockouts.csv.gz", D.sim_truth)
D.products.create_index([("tenantId", 1), ("sku", 1)], unique=True); D.products.create_index([("tenantId", 1), ("family", 1)]); D.products.create_index([("name", "text")])
D.sales.create_index([("tenantId", 1), ("storeId", 1), ("date", 1), ("sku", 1)]); D.sales.create_index([("tenantId", 1), ("sku", 1), ("date", 1)])
D.batches.create_index([("tenantId", 1), ("storeId", 1), ("sku", 1), ("expiryDate", 1)]); D.batches.create_index([("tenantId", 1), ("expiryDate", 1)])
D.purchase_orders.create_index([("tenantId", 1), ("storeId", 1), ("orderDate", 1)]); D.stock_adjustments.create_index([("tenantId", 1), ("storeId", 1), ("date", 1)])
D.inventory_state.create_index([("tenantId", 1), ("storeId", 1), ("sku", 1)], unique=True)
D.sim_future_sales.create_index([("tenantId", 1), ("storeId", 1), ("date", 1)]); D.sim_truth.create_index([("tenantId", 1), ("storeId", 1), ("sku", 1), ("date", 1)])
counts["seconds"] = round(time.time() - t0); print(t, counts)
json.dump(counts, open(ROOT / f"evidence/mongo/load_sim_{t}.json", "w"), indent=1)
