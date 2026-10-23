#!/usr/bin/env python3
"""Syntetos-Boylan classification (ADI 1.32, CV^2 0.49) -- the same rule the production pipeline uses. out: series days nz mean_nz cv2 adi class"""
import sys
cur, a = None, None
def emit():
    if cur is None: return
    n, nz, s, ss = a
    if nz == 0: print(f"{cur}\t{int(n)}\t0\t0\t0\t99\tno_demand"); return
    mean = s / nz; var = max(ss / nz - mean * mean, 0); cv2 = var / (mean * mean) if nz > 1 else 0; adi = n / nz
    k = "smooth" if adi < 1.32 and cv2 < 0.49 else "erratic" if adi < 1.32 else "intermittent" if cv2 < 0.49 else "lumpy"
    print(f"{cur}\t{int(n)}\t{int(nz)}\t{mean:.6f}\t{cv2:.6f}\t{adi:.6f}\t{k}")
for line in sys.stdin:
    k, v = line.rstrip("\n").split("\t"); vec = [float(x) for x in v.split(",")]
    if k != cur: emit(); cur, a = k, vec
    else: a = [x + y for x, y in zip(a, vec)]
emit()
