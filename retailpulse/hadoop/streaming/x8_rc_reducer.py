#!/usr/bin/env python3
"""P: months_seen, min, max, last-first price change, deal months. M: rows, price_sum, deal_rows"""
import sys
cur, rows = None, []
def emit():
    if cur is None: return
    if cur.startswith("P:"):
        rows.sort(key=lambda r: r[1]); ps = [r[0] for r in rows]
        print(f"{cur}\t{len(ps)},{min(ps)},{max(ps)},{ps[-1] - ps[0]:.4f},{sum(r[2] for r in rows)}")
    else: print(f"{cur}\t{len(rows)},{sum(r[0] for r in rows):.2f},{sum(r[2] for r in rows)}")
for line in sys.stdin:
    k, v = line.rstrip("\n").split("\t"); a = v.split(",")
    if k != cur: emit(); cur, rows = k, []
    rows.append((float(a[0]), a[1], int(a[2])) if k.startswith("P:") else (float(a[1]), a[0], int(a[2])))
emit()
