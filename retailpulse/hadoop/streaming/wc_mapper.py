#!/usr/bin/env python3
import sys, re
for line in sys.stdin:
    for tok in re.findall(r"[a-z']+", line.lower()):
        print(f"{tok}\t1")
