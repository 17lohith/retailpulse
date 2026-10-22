#!/usr/bin/env python3
"""J7 (Store Sales): sales by family x month. value = rows,sales_sum,promo_rows"""
import sys, csv
for p in csv.reader(sys.stdin):
    if p[0] == "id": continue
    print(f"{p[3]}|{p[1][:7]}\t1,{p[4]},{1 if float(p[5]) > 0 else 0}")
