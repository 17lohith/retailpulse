#!/usr/bin/env python3
"""X4b: per-basket totals. key BASKET_ID, value lines,net_sales"""
import sys
for line in sys.stdin:
    if line.startswith("household_key"): continue
    p = line.rstrip("\n").split(",")
    print(f"{p[1]}\t1,{p[5]}")
