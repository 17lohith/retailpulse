#!/usr/bin/env python3
"""J9 (Store Sales): weekday profile per family and per store. value = rows,sales_sum"""
import sys, csv, datetime
for p in csv.reader(sys.stdin):
    if p[0] == "id": continue
    dow = datetime.date.fromisoformat(p[1]).weekday()
    print(f"F:{p[3]}|{dow}\t1,{p[4]}"); print(f"S:{p[2]}|{dow}\t1,{p[4]}")
