#!/usr/bin/env python3
"""J1: token frequency by sentiment bucket (neg<=2, neu=3, pos>=4) over review title+text."""
import sys, json
from common import STOP, TOKEN, Counters
C = Counters("Cleaning")
for line in sys.stdin:
    C.inc("records_in")
    try: d = json.loads(line)
    except Exception: C.inc("malformed_json"); continue
    r = d.get("rating")
    if not isinstance(r, (int, float)) or not (1 <= r <= 5): C.inc("rating_invalid_or_missing"); continue
    text = ((d.get("title") or "") + " " + (d.get("text") or "")).lower()
    if len(text.strip()) < 3: C.inc("empty_text"); continue
    b = "neg" if r <= 2 else "neu" if r < 4 else "pos"
    seen = 0
    for t in TOKEN.findall(text):
        if t in STOP: continue
        print(f"{b}|{t}\t1"); seen += 1
    C.inc("reviews_tokenised"); C.inc("tokens_emitted", seen)
C.flush()
