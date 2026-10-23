#!/usr/bin/env python3
"""X8 (RC Superstore, 12 monthly scrapes): per-product price drift + per-month deal share"""
import sys, json
from common import Counters
C = Counters("Cleaning")
for line in sys.stdin:
    try: d = json.loads(line)
    except Exception: C.inc("malformed_json"); continue
    p = d.get("price")
    if p is None: C.inc("missing_price"); continue
    print(f"P:{d['productId']}\t{p},{d['month']},{1 if d.get('deal') else 0}"); print(f"M:{d['month']}\t1,{p},{1 if d.get('deal') else 0}")
C.flush()
