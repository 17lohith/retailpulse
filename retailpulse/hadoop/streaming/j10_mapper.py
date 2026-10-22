#!/usr/bin/env python3
"""J10 (simulated ops): MAP-SIDE join of stock adjustments with the product table (distributed cache file products_all.jsonl).
Key family|type|store, value = events,units"""
import sys, json
fam = {}
for l in open("products_all.jsonl"):
    p = json.loads(l); fam[(p["tenantId"], p["sku"])] = p["family"]
for line in sys.stdin:
    d = json.loads(line)
    print(f"{fam.get((d['tenantId'], d['sku']), 'UNKNOWN')}|{d['type']}|{d['storeId']}\t1,{-d['qty']}")
