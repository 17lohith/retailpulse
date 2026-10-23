#!/usr/bin/env python3
"""X2 (Instacart): reorder rate by department and aisle -- MAP-SIDE JOIN with products.csv (distributed cache). value = lines,reordered"""
import sys, csv
prod = {}
for r in csv.reader(open("products.csv")):
    if r[0] != "product_id": prod[r[0]] = (r[2], r[3])           # aisle_id, department_id
for line in sys.stdin:
    if line.startswith("order_id"): continue
    p = line.rstrip("\n").split(",")
    a = prod.get(p[1])
    if not a: continue
    print(f"D:{a[1]}\t1,{p[3]}"); print(f"A:{a[0]}\t1,{p[3]}")
