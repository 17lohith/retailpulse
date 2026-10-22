#!/usr/bin/env python3
"""J4b (chained): price band x category level-2 aggregates from J4 output. value = products,reviews,rating_sum"""
import sys
for line in sys.stdin:
    a, store, c2, c3, band, price, n, s = line.rstrip("\n").split("\t")
    print(f"{band}|{c2}\t1,{n},{s}")
