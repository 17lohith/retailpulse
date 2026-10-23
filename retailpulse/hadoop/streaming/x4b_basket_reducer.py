#!/usr/bin/env python3
"""Sum per basket, then emit the basket's size bucket: key SIZE:<bucket> value 1,sales"""
import sys
def bucket(n): return "01" if n == 1 else "02-05" if n <= 5 else "06-10" if n <= 10 else "11-20" if n <= 20 else "21-40" if n <= 40 else "41+"
cur, n, s = None, 0, 0.0
def emit():
    if cur is not None: print(f"SIZE:{bucket(n)}\t1,{s:.2f},{n}")
for line in sys.stdin:
    k, v = line.rstrip("\n").split("\t"); a, b = v.split(",")
    if k != cur: emit(); cur, n, s = k, 0, 0.0
    n += int(a); s += float(b)
emit()
