#!/usr/bin/env python3
"""J4: reduce-side JOIN of reviews with product metadata on parent_asin.
Input lines are either meta records (have 'details'/'main_category') or review records (have 'user_id')."""
import sys, json
from common import parse_price, price_band, Counters
C = Counters("Join")
for line in sys.stdin:
    try: d = json.loads(line)
    except Exception: C.inc("malformed_json"); continue
    a = d.get("parent_asin")
    if not a: C.inc("missing_parent_asin"); continue
    if "user_id" in d:  # review
        r = d.get("rating")
        if not isinstance(r, (int, float)) or not (1 <= r <= 5): C.inc("rating_invalid_or_missing"); continue
        print(f"{a}\tR\t{r}"); C.inc("review_in")
    else:               # meta
        cats = d.get("categories") or []
        p = parse_price(d.get("price"))
        if isinstance(d.get("price"), str): C.inc("price_was_string")
        store = (d.get("store") or "Unknown").replace("\t", " ").strip() or "Unknown"
        c2 = cats[1] if len(cats) > 1 else "Uncategorised"; c3 = cats[2] if len(cats) > 2 else ""
        print(f"{a}\tM\t{store}\t{c2}\t{c3}\t{price_band(p)}\t{'' if p is None else p}"); C.inc("meta_in")
C.flush()
