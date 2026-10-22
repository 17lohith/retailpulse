#!/usr/bin/env python3
"""J8 (Store Sales): promo vs non-promo mean sales per family. value = rows,sales_sum"""
import sys, csv
for p in csv.reader(sys.stdin):
    if p[0] == "id": continue
    print(f"{p[3]}|{'promo' if float(p[5]) > 0 else 'nopromo'}\t1,{p[4]}")
