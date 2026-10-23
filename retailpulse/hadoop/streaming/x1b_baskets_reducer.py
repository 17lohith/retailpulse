#!/usr/bin/env python3
"""One line per order with >= 2 frequent items: order_id <tab> sorted product ids"""
import sys
cur, items = None, []
def emit():
    if cur is not None and len(items) >= 2: print(cur + "\t" + ",".join(sorted(set(items), key=int)))
for line in sys.stdin:
    k, v = line.rstrip("\n").split("\t")
    if k != cur: emit(); cur, items = k, []
    items.append(v)
emit()
