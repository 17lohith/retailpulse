#!/usr/bin/env python3
"""J2: per-product review statistics. value = n,rating_sum,verified,helpful,h1..h5"""
import sys, json
from common import Counters
C = Counters("Cleaning")
for line in sys.stdin:
    C.inc("records_in")
    try: d = json.loads(line)
    except Exception: C.inc("malformed_json"); continue
    r, a = d.get("rating"), d.get("parent_asin")
    if not a: C.inc("missing_parent_asin"); continue
    if not isinstance(r, (int, float)) or not (1 <= r <= 5): C.inc("rating_invalid_or_missing"); continue
    h = [0] * 5; h[int(round(r)) - 1] = 1
    print(f"{a}\t1,{r},{1 if d.get('verified_purchase') else 0},{int(d.get('helpful_vote') or 0)},{','.join(map(str, h))}")
C.flush()
