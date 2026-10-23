#!/usr/bin/env python3
"""Prepare external datasets for Hadoop: (1) M5 parquet -> CSV (series_id,date,qty); (2) Real Canadian Superstore: 12 monthly CSVs whose schemas drift
-> one normalised JSONL. A product is 'on deal' when a higher wasPrice is shown (the 'deal' text column is mostly empty)."""
import duckdb, glob, json, pathlib, pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[1]; X = ROOT / "data/raw/external/"; O = ROOT / "data/clean/ext/"; O.mkdir(parents=True, exist_ok=True)
duckdb.connect().execute(f"COPY (SELECT CAST(unique_id AS VARCHAR) AS series_id, ds AS date, CAST(y AS INTEGER) AS qty FROM '{X}m5-parquet/m5_train.parquet') TO '{O}m5_sales.csv' (HEADER false, DELIMITER ',')")
MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
def num(v):
    try: x = float(str(v).replace("$", "").replace(",", "").split()[0]); return None if x != x else x
    except Exception: return None
rows = deals = 0; schemas = set()
with open(O / "rc_superstore.jsonl", "w") as out:
    for f in sorted(glob.glob(str(X / "rc-superstore-grocery-data/*.csv"))):
        m = pathlib.Path(f).stem.split("_")[2]; df = pd.read_csv(f, low_memory=False); schemas.add(tuple(df.columns))
        pcol = next((c for c in ("pricing.price", "pricing.displayPrice") if c in df.columns), None)
        for r in df.to_dict("records"):
            price = num(r.get(pcol)) if pcol else None; was = num(r.get("pricing.wasPrice")); deal = bool(price is not None and was is not None and was > price)
            out.write(json.dumps({"month": f"2025-{MONTHS.index(m) + 1:02d}", "productId": str(r.get("productId")), "brand": r.get("brand") if isinstance(r.get("brand"), str) else None,
                                  "title": r.get("title") if isinstance(r.get("title"), str) else None, "price": price, "wasPrice": was, "deal": deal}) + "\n"); rows += 1; deals += deal
print(f"rc rows={rows} on_deal={deals} ({deals / rows:.1%}) distinct_schemas={len(schemas)}")
