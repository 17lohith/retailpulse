#!/usr/bin/env python3
import sys
cur, n = None, 0
for line in sys.stdin:
    k, v = line.rstrip("\n").split("\t")
    if k != cur:
        if cur is not None: print(f"{cur}\t{n}")
        cur, n = k, 0
    n += int(v)
if cur is not None: print(f"{cur}\t{n}")
