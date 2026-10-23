#!/usr/bin/env python3
"""X3 (Instacart): orders by weekday x hour, and days-since-prior-order buckets. input orders.csv"""
import sys
for line in sys.stdin:
    if line.startswith("order_id"): continue
    p = line.rstrip("\n").split(",")
    print(f"H:{p[4]}|{int(p[5]):02d}\t1")
    if p[6]: d = int(float(p[6])); print(f"G:{'30+' if d >= 30 else ('%02d' % d)}\t1")
