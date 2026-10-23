#!/usr/bin/env python3
"""Stream the Open Food Facts CSV (gzip, ~9 GB uncompressed) from stdin and keep Indian products (barcode prefix 890 or countries contains India)."""
import csv, sys
csv.field_size_limit(sys.maxsize)
rd = csv.reader(sys.stdin, delimiter="\t", quoting=csv.QUOTE_NONE)
h = next(rd); ix = {c: i for i, c in enumerate(h)}
keep = ["code", "product_name", "brands", "categories_en", "quantity", "packaging_en", "countries_en", "created_t", "nutriscore_grade", "product_quantity"]
keep = [k for k in keep if k in ix]
w = csv.writer(open(sys.argv[1], "w", newline="")); w.writerow(keep); n = k = 0
for r in rd:
    n += 1
    if len(r) <= max(ix[x] for x in keep): continue
    code = r[ix["code"]]; ctry = r[ix["countries_en"]] if "countries_en" in ix else ""
    if code.startswith("890") or "India" in ctry:
        w.writerow([r[ix[x]] for x in keep]); k += 1
print(f"read {n} kept {k}", file=sys.stderr)
