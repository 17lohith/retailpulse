#!/usr/bin/env python3
"""Extra billing-software-style export files (item list, closing stock) from a simulated tenant - SIMULATED, for the ingestion demo/tests."""
import json, sys, pathlib, pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[1]; t = sys.argv[1]; d = ROOT / "data/clean/sim" / t / "exports"
prods = [json.loads(l) for l in open(ROOT / f"data/clean/sim/{t}/products.jsonl")]
pd.DataFrame([{"Item Name": p["name"], "Item Code": p["sku"], "Barcode": p["barcode"], "Category": p["family"], "Brand": p["brand"], "MRP": p["mrpPaise"] / 100,
               "Cost Price": p["costPaise"] / 100, "Pack Size": p["packSize"]} for p in prods]).to_csv(d / "vyapar_style_item_list.csv", index=False)
inv = [json.loads(l) for l in open(ROOT / f"data/clean/sim/{t}/inventory_state.jsonl")]; name = {p["sku"]: p["name"] for p in prods}
store = f"{t}-S1"
pd.DataFrame([{"Item Name": name[i["sku"]], "Item Code": i["sku"], "Closing Stock": i["onHand"]} for i in inv if i["storeId"] == store]).to_csv(d / f"stock_style_closing_stock_{store}.csv", index=False)
print("wrote", [p.name for p in d.iterdir()])
