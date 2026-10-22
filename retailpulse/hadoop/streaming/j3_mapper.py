#!/usr/bin/env python3
"""J3: review volume by month. value = n,rating_sum,verified"""
import sys, json
from common import Counters, month_of
C = Counters("Cleaning")
for line in sys.stdin:
    C.inc("records_in")
    try: d = json.loads(line)
    except Exception: C.inc("malformed_json"); continue
    ts, r = d.get("timestamp"), d.get("rating")
    if not isinstance(ts, (int, float)) or ts <= 0: C.inc("bad_timestamp"); continue
    if not isinstance(r, (int, float)) or not (1 <= r <= 5): C.inc("rating_invalid_or_missing"); continue
    print(f"{month_of(ts)}\t1,{r},{1 if d.get('verified_purchase') else 0}")
C.flush()
