#!/usr/bin/env python3
"""Load external-dataset Hadoop results (X1..X8) + lookup tables + the dataset registry into MongoDB."""
import json, re, glob, os, pathlib, datetime as dt
import pandas as pd
from mongo_common import db, bulk, ROOT
D = db(); MR = ROOT / "data/clean/mr"; X = ROOT / "data/raw/external"; EV = ROOT / "evidence"
def rows(job): return (l.rstrip("\n").split("\t") for l in open(MR / f"{job}.tsv", encoding="utf-8"))
def vec(s): return [float(x) for x in s.split(",")]
SPEC = {
    "X1_item_support": lambda p: (p[0], {"orders": float(p[1])}),
    "X1c_pair_counts": lambda p: (p[0], {"count": float(p[1])}),
    "X2_reorder_by_department": lambda p: (p[0], (lambda v: {"lines": v[0], "reordered": v[1], "rate": v[1] / v[0]})(vec(p[1]))),
    "X3_order_timing": lambda p: (p[0], {"orders": float(p[1])}),
    "X4_discount_depth": lambda p: (p[0], (lambda v: {"lines": v[0], "qty": v[1], "netSales": v[2], "retailDisc": v[3], "couponDisc": v[4]})(vec(p[1]))),
    "X4c_basket_size_histogram": lambda p: (p[0], (lambda v: {"baskets": v[0], "sales": v[1], "lines": v[2]})(vec(p[1]))),
    "X5_online_retail": lambda p: (p[0], {"v": vec(p[1])}),
    "X6b_class_by_department": lambda p: (p[0], (lambda v: {"series": v[0], "days": v[1], "nonzeroDays": v[2]})(vec(p[1]))),
    "X7_supermarket_waste": lambda p: (p[0], (lambda v: {"rows": v[0], "sold": v[1], "wasted": v[2], "lossUsd": v[3], "oosDays": v[4], "nearExpiry": v[5]})(vec(p[1]))),
    "X8_price_drift": lambda p: (p[0], {"v": vec(p[1])}),
}
D.mr_results.delete_many({"job": {"$regex": "^X"}}); out = {}
for job, fn in SPEC.items():
    out[job] = bulk(D.mr_results, ({"job": job, "key": k, "values": v, "source": "hadoop-streaming"} for k, v in (fn(p) for p in rows(job))))
# lookups
ip = pd.read_csv(X / "instacart-market-basket-analysis/products.csv"); ia = pd.read_csv(X / "instacart-market-basket-analysis/aisles.csv"); idp = pd.read_csv(X / "instacart-market-basket-analysis/departments.csv")
m = ip.merge(ia, on="aisle_id").merge(idp, on="department_id"); D.ext_instacart_products.drop()
out["ext_instacart_products"] = bulk(D.ext_instacart_products, ({"product_id": int(r.product_id), "name": r.product_name, "aisle_id": int(r.aisle_id), "aisle": r.aisle, "department_id": int(r.department_id), "department": r.department} for r in m.itertuples()))
D.ext_instacart_products.create_index("product_id", unique=True)
D.ext_names.delete_many({}); D.ext_names.insert_many([{"kind": "instacart_department", "id": int(r.department_id), "name": r.department} for r in idp.itertuples()] + [{"kind": "instacart_aisle", "id": int(r.aisle_id), "name": r.aisle} for r in ia.itertuples()])
o = pd.read_csv(X / "online-retail-ii-uci/online_retail_II.csv", dtype={"StockCode": str}, usecols=["StockCode", "Description"]).dropna()
desc = o.groupby("StockCode").Description.agg(lambda s: s.value_counts().index[0]); D.ext_retail_desc.drop(); out["ext_retail_desc"] = bulk(D.ext_retail_desc, ({"code": k, "description": v} for k, v in desc.items())); D.ext_retail_desc.create_index("code", unique=True)
cls = [l.rstrip("\n").split("\t") for l in open(MR / "X6_m5_demand_classes.tsv")]; D.ext_m5_classes.drop()
out["ext_m5_classes"] = bulk(D.ext_m5_classes, ({"series": r[0], "dept": r[0].split("_")[0], "days": int(r[1]), "nonzeroDays": int(r[2]), "meanNonzero": float(r[3]), "cv2": float(r[4]), "adi": float(r[5]), "class": r[6]} for r in cls))
D.mr_results.create_index([("job", 1), ("key", 1)])
# dataset registry (provenance panel)
def prof(n): return json.load(open(EV / f"data_profile/{n}.json"))
LIC = {"supermarket_inventory_synthetic": "CC0 (CSV, per LICENSE_DATA.md; Kaggle page may list CC BY-NC-SA)", "grocery_inventory_sales": "CC0", "retail_store_inventory": "CC0", "bigbasket": "CC BY-NC-SA 4.0 (non-commercial)", "online_retail_ii": "CC0 (original UCI: CC BY 4.0)",
       "instacart": "CC0 on Kaggle mirror; Instacart terms: research use - verify", "dunnhumby": "dunnhumby Database Contents License (DbCL 1.0)", "rc_superstore": "Apache-2.0", "m5": "Walmart M5 competition data via MIT-licensed parquet mirror - verify competition rules"}
reg = [
 dict(key="amazon_reviews", name="Amazon Reviews 2023 - Grocery & Gourmet Food", rows=14318520, size="5.97 GB", format="JSONL", role="Hadoop J1-J6; product reviews & metadata (real)", license="Not stated; cite Hou et al. 2024", used_in=["Big Data", "Full Stack"]),
 dict(key="store_sales", name="Store Sales - Corporacion Favorita (Kaggle)", rows=3000888, size="116 MB", format="CSV", role="Hadoop J7-J9; forecast benchmark (real store x family)", license="Kaggle competition rules", used_in=["Big Data", "Cloud"]),
 dict(key="instacart", name="Instacart Market Basket Analysis", rows=prof("external_instacart")["prior_order_product_rows"], size="665 MB", format="CSV", role="Hadoop X1-X3: basket analysis (Apriori chain), reorder rates, order timing (real)", license=LIC["instacart"], used_in=["Big Data"]),
 dict(key="dunnhumby", name="Dunnhumby - The Complete Journey", rows=prof("external_dunnhumby")["transaction_rows"], size="808 MB", format="CSV", role="Hadoop X4: discount depth, basket sizes (real household transactions)", license=LIC["dunnhumby"], used_in=["Big Data"]),
 dict(key="online_retail_ii", name="Online Retail II (UCI)", rows=prof("external_online_retail_ii")["rows"], size="91 MB", format="CSV", role="Hadoop X5 + importer stress test on real bill-level data with returns", license=LIC["online_retail_ii"], used_in=["Big Data", "Full Stack"]),
 dict(key="m5", name="M5 Forecasting - Walmart (parquet mirror)", rows=46796220, size="1.5 GB as CSV", format="Parquet -> CSV", role="Hadoop X6 demand classification of 30,490 series; real SKU-level forecast benchmark", license=LIC["m5"], used_in=["Big Data", "Cloud"]),
 dict(key="rc_superstore", name="Real Canadian Superstore monthly scrapes (2025)", rows=prof("external_rc_superstore")["rows"], size="252 MB", format="12 CSV with drifting schemas -> JSONL", role="Hadoop X8 price drift; schema-drift cleaning", license=LIC["rc_superstore"], used_in=["Big Data"]),
 dict(key="supermarket_inventory_synthetic", name="Supermarket Inventory & Demand (synthetic)", rows=prof("external_supermarket_inventory_synthetic")["rows"], size="36 MB", format="CSV", role="Hadoop X7 waste reference (batches, expiry, waste) - SYNTHETIC", license=LIC["supermarket_inventory_synthetic"], used_in=["Big Data"], synthetic=True),
 dict(key="bigbasket", name="BigBasket Entire Product List", rows=prof("external_bigbasket")["rows"], size="16 MB", format="CSV", role="Indian product catalogue for demo shop Annapurna (real products, INR prices)", license=LIC["bigbasket"], used_in=["Full Stack"]),
 dict(key="grocery_inventory_sales", name="Grocery Inventory & Sales (dirty sample)", rows=prof("external_grocery_inventory_sales")["rows"], size="136 KB", format="CSV", role="Dirty-data fixture only (495 of 992 rows have expiry before receipt) - not used for results", license=LIC["grocery_inventory_sales"], used_in=[], synthetic=True),
 dict(key="retail_store_inventory", name="Retail Store Inventory Forecasting (synthetic)", rows=prof("external_retail_store_inventory")["rows"], size="6 MB", format="CSV", role="Reviewed, not used: mostly non-grocery, no stock-outs", license=LIC["retail_store_inventory"], used_in=[], synthetic=True),
]
D.ext_datasets.delete_many({}); D.ext_datasets.insert_many(reg)
json.dump(out, open(EV / "mongo/load_external.json", "w"), indent=1); print(out)
