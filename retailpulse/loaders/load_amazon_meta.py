#!/usr/bin/env python3
"""Load ALL 603,274 Amazon grocery product metadata records into MongoDB (collection amazon_meta) with a cleaning log."""
import json, re, sys, time, collections
from mongo_common import db, bulk, ROOT
sys.path.insert(0, str(ROOT / "hadoop/streaming")); from common import parse_price
D = db(); coll = D.amazon_meta; coll.drop()
log = collections.Counter(); t0 = time.time()
def docs():
    for line in open(ROOT / "data/raw/amazon2023/meta_Grocery_and_Gourmet_Food.jsonl", encoding="utf-8"):
        log["read"] += 1
        try: d = json.loads(line)
        except Exception: log["malformed_json"] += 1; continue
        raw = d.get("price"); p = parse_price(raw)
        if isinstance(raw, str): log["price_was_string"] += 1
        if p is None: log["price_missing"] += 1
        det = {k.replace(".", "_").replace("$", "_"): v for k, v in (d.get("details") or {}).items()} if isinstance(d.get("details"), dict) else {}
        c = d.get("categories") or []
        yield dict(parent_asin=d.get("parent_asin"), title=d.get("title"), store=d.get("store"), main_category=d.get("main_category"),
                   categories=c, price=p, average_rating=d.get("average_rating"), rating_number=d.get("rating_number"),
                   features=d.get("features") or [], details=det, source="amazon_reviews_2023", simulated=False)
n = bulk(coll, docs())
coll.create_index("parent_asin", unique=True); coll.create_index("store"); coll.create_index([("categories.1", 1)])
coll.create_index([("title", "text")]); coll.create_index("price")
log["inserted"] = n; log["seconds"] = round(time.time() - t0)
print(dict(log)); (ROOT / "evidence/mongo").mkdir(exist_ok=True)
json.dump(dict(log), open(ROOT / "evidence/mongo/load_amazon_meta.json", "w"), indent=1)
