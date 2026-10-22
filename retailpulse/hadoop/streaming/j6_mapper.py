#!/usr/bin/env python3
"""J6: verified vs unverified + helpful votes by review-length bucket. value = n,helpful_sum,rating_sum"""
import sys, json
from common import Counters
C = Counters("Cleaning")
def lb(n): return "0-50" if n < 50 else "50-150" if n < 150 else "150-400" if n < 400 else "400+"
for line in sys.stdin:
    C.inc("records_in")
    try: d = json.loads(line)
    except Exception: C.inc("malformed_json"); continue
    r = d.get("rating")
    if not isinstance(r, (int, float)) or not (1 <= r <= 5): C.inc("rating_invalid_or_missing"); continue
    h = int(d.get("helpful_vote") or 0)
    print(f"V:{'verified' if d.get('verified_purchase') else 'unverified'}\t1,{h},{r}")
    print(f"L:{lb(len(d.get('text') or ''))}\t1,{h},{r}")
C.flush()
