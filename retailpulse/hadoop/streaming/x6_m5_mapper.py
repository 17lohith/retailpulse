#!/usr/bin/env python3
"""X6 (M5): demand statistics per series. value = days,nonzero_days,sum_nz,sumsq_nz"""
import sys
for line in sys.stdin:
    s, d, q = line.rstrip("\n").split(",")
    q = int(q); print(f"{s}\t1,{1 if q > 0 else 0},{q},{q * q}")
