#!/usr/bin/env python3
"""Sums the vector per product and finalises mean rating. out: asin n mean verified helpful h1..h5"""
import sys
cur, acc = None, None
def emit():
    if cur is not None:
        n, s = acc[0], acc[1]
        print(f"{cur}\t{int(n)}\t{s/n:.4f}\t{int(acc[2])}\t{int(acc[3])}\t" + "\t".join(str(int(x)) for x in acc[4:]))
for line in sys.stdin:
    k, _, v = line.rstrip("\n").partition("\t"); vec = [float(x) for x in v.split(",")]
    if k != cur:
        emit(); cur, acc = k, vec
    else:
        for i, x in enumerate(vec): acc[i] += x
emit()
