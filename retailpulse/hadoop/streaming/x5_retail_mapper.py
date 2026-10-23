#!/usr/bin/env python3
"""X5 (Online Retail II): monthly revenue, cancellations (returns), country revenue, per-product returns."""
import sys, csv, re
from common import Counters
C = Counters("Cleaning"); NONPROD = re.compile(r"^(POST|DOT|M|BANK CHARGES|AMAZONFEE|C2|D|S|B|CRUK|ADJUST\d*|PADS|TEST\d*|GIFT.*)$", re.I)
for p in csv.reader(sys.stdin):
    if p and p[0] == "Invoice": continue
    C.inc("records_in")
    if len(p) < 8: C.inc("short_row"); continue
    inv, code, desc, q, ts, price, cust, country = p[:8]
    try: q = int(q); price = float(price)
    except ValueError: C.inc("bad_number"); continue
    if NONPROD.match(code): C.inc("non_product_stockcode"); continue
    if not desc.strip(): C.inc("missing_description")
    if price <= 0: C.inc("zero_or_negative_price"); continue
    month = ts[:7]; canc = inv.startswith("C")
    if canc: print(f"M:{month}\t0,0,0,1,{-q if q < 0 else q}"); print(f"P:{code}\t0,{-q if q < 0 else q}")
    elif q > 0:
        print(f"M:{month}\t1,{q},{q * price:.2f},0,0"); print(f"C:{country}\t{q * price:.2f}"); print(f"P:{code}\t{q},0")
    else: C.inc("negative_qty_not_cancellation")
C.flush()
