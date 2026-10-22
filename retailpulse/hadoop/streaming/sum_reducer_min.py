#!/usr/bin/env python3
"""Generic combiner/reducer: sums comma-separated numeric vectors per key.
env MIN_COUNT: drop keys whose FIRST component is below this (reducer-side filter only)."""
import sys, os
minc = float(os.environ.get("MIN_COUNT", 50)) if True else 0
cur, acc = None, None
def emit():
    if cur is not None and acc[0] >= minc: print(cur + "\t" + ",".join(("%d" % x if x == int(x) else "%.6f" % x) for x in acc))
for line in sys.stdin:
    k, _, v = line.rstrip("\n").partition("\t")
    vec = [float(x) for x in v.split(",")]
    if k != cur:
        emit(); cur, acc = k, vec
    else:
        for i, x in enumerate(vec): acc[i] += x
emit()
