#!/usr/bin/env python3
"""J5 (chained): brand ranking from J4 output. value = products,reviews,rating_sum"""
import sys
for line in sys.stdin:
    a, store, c2, c3, band, price, n, s = line.rstrip("\n").split("\t")
    print(f"{store}\t1,{n},{s}")
