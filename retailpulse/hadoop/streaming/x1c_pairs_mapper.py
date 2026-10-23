#!/usr/bin/env python3
"""X1c: emit every product pair of a basket (a<b)"""
import sys
from itertools import combinations
for line in sys.stdin:
    _, items = line.rstrip("\n").split("\t"); it = items.split(",")
    for a, b in combinations(it, 2): print(f"{a},{b}\t1")
