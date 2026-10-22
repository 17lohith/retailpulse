#!/usr/bin/env python3
"""Join reducer: output only products having BOTH metadata and >=1 review (inner join).
out: asin store cat2 cat3 band price n rating_sum"""
import sys
from common import Counters
C = Counters("Join")
cur, meta, n, s = None, None, 0, 0.0
def emit():
    if cur is None: return
    if meta is None: C.inc("orphan_reviews_no_meta", n); return
    if n == 0: C.inc("meta_without_reviews"); return
    C.inc("joined_products"); C.inc("joined_reviews", n)
    print(f"{cur}\t{meta}\t{n}\t{s}")
for line in sys.stdin:
    p = line.rstrip("\n").split("\t")
    if p[0] != cur:
        emit(); cur, meta, n, s = p[0], None, 0, 0.0
    if p[1] == "R": n += 1; s += float(p[2])
    else: meta = "\t".join(p[2:7])
emit(); C.flush()
