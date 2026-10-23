#!/usr/bin/env python3
"""X6b (chained): count series by department x demand class. key DEPT|class value series,days,nonzero_days"""
import sys
for line in sys.stdin:
    s, n, nz, mean, cv2, adi, k = line.rstrip("\n").split("\t")
    print(f"{s.split('_')[0]}|{k}\t1,{n},{nz}")
