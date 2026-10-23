#!/usr/bin/env python3
"""X7 (external synthetic supermarket): waste & near-expiry by category x store. Normalises the dirty category case; counts date-format drift."""
import sys, csv
from common import Counters
C = Counters("Cleaning")
for p in csv.reader(sys.stdin):
    if not p or p[0] == "Product_ID": continue
    C.inc("records_in")
    if len(p) < 29: C.inc("short_row"); continue
    if "/" in p[8]: C.inc("date_with_slashes")
    cat = p[2].strip().lower(); 
    if cat != p[2].strip(): C.inc("category_case_normalised")
    try: sold = float(p[19]); oos = int(float(p[20])); wasted = float(p[21]); loss = float(p[22] or 0); near = float(p[27] or 0)
    except ValueError: C.inc("bad_number"); continue
    print(f"{cat}|{p[9]}\t1,{sold},{wasted},{loss},{oos},{near}")
C.flush()
