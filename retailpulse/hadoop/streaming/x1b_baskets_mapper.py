#!/usr/bin/env python3
"""X1b: keep only FREQUENT items (apriori pruning, list shipped via distributed cache), key = order_id"""
import sys
freq = {l.split("\t")[0] for l in open("frequent_items.txt")}
for line in sys.stdin:
    if line.startswith("order_id"): continue
    p = line.rstrip("\n").split(",")
    if p[1] in freq: print(f"{p[0]}\t{p[1]}")
