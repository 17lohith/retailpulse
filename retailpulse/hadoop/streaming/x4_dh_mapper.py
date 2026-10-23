#!/usr/bin/env python3
"""X4 (Dunnhumby): discount depth by department x quarter x brand type -- MAP-SIDE JOIN with product.csv. value = lines,qty,net_sales,retail_disc,coupon_disc"""
import sys, csv
from common import Counters
C = Counters("Cleaning"); prod = {}
for r in csv.reader(open("product.csv")):
    if r[0] != "PRODUCT_ID": prod[r[0]] = (r[2].strip() or "UNKNOWN", r[3].strip() or "UNKNOWN")
for line in sys.stdin:
    if line.startswith("household_key"): continue
    p = line.rstrip("\n").split(",")
    d = prod.get(p[3])
    if d is None: C.inc("product_not_in_master"); d = ("UNKNOWN", "UNKNOWN")
    if float(p[4]) == 0: C.inc("zero_quantity_lines")
    print(f"{d[0]}|Q{int(p[9]) // 13:02d}|{d[1]}\t1,{p[4]},{p[5]},{p[7]},{p[10]}")
C.flush()
