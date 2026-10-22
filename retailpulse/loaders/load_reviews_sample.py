#!/usr/bin/env python3
"""Load a reproducible ~2M-review sample (Bernoulli sample by CRC32 of the raw line, p=P) into collection amazon_reviews_sample."""
import json, sys, time, zlib, collections, datetime
from mongo_common import db, bulk, ROOT
P = float(sys.argv[1]) if len(sys.argv) > 1 else 0.14
D = db(); coll = D.amazon_reviews_sample; coll.drop(); log = collections.Counter(); t0 = time.time()
thr = int(P * 2**32)
def docs():
    with open(ROOT / "data/raw/amazon2023/Grocery_and_Gourmet_Food.jsonl", "rb") as f:
        for line in f:
            log["read"] += 1
            if zlib.crc32(line) >= thr: continue
            try: d = json.loads(line)
            except Exception: log["malformed_json"] += 1; continue
            r = d.get("rating")
            if not isinstance(r, (int, float)) or not 1 <= r <= 5: log["rating_invalid_excluded"] += 1; continue
            ts = d.get("timestamp")
            yield dict(parent_asin=d.get("parent_asin"), asin=d.get("asin"), user_id=d.get("user_id"), rating=float(r),
                       title=d.get("title"), text=d.get("text"), date=datetime.datetime.utcfromtimestamp(ts / 1000).strftime("%Y-%m-%d") if ts else None,
                       verified=bool(d.get("verified_purchase")), helpful_vote=int(d.get("helpful_vote") or 0))
n = bulk(coll, docs())
for ix in ("parent_asin", "rating", "date", "user_id"): coll.create_index(ix)
log["inserted"] = n; log["sample_p"] = P; log["seconds"] = round(time.time() - t0)
print(dict(log)); json.dump(dict(log), open(ROOT / "evidence/mongo/load_reviews_sample.json", "w"), indent=1)
