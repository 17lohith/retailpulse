#!/usr/bin/env python3
"""X1 (Instacart): item support = number of orders containing the product. input: order_products__prior.csv"""
import sys
from common import Counters
C = Counters("Cleaning")
for line in sys.stdin:
    if line.startswith("order_id"): continue
    p = line.rstrip("\n").split(",")
    if len(p) < 4: C.inc("short_row"); continue
    print(f"{p[1]}\t1"); C.inc("lines")
C.flush()
