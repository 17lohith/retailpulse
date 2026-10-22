#!/usr/bin/env python3
"""Load Hadoop job outputs (data/clean/mr/*.tsv) and job metadata (evidence/hadoop/*.log) into MongoDB."""
import json, re, sys, glob, pathlib, datetime as dt
from mongo_common import db, bulk, ROOT
D = db(); MR = ROOT / "data/clean/mr"; now = dt.datetime.utcnow()

def rows(job):
    f = MR / f"{job}.tsv"
    for line in open(f, encoding="utf-8"):
        yield line.rstrip("\n").split("\t")

def vec(s): return [float(x) for x in s.split(",")]

SPEC = {  # job -> function(parts) -> (key, values)
    "J1_token_frequency":     lambda p: (p[0], {"count": float(p[1])}),
    "J3_monthly_volume":      lambda p: (p[0], (lambda v: {"reviews": v[0], "ratingSum": v[1], "verified": v[2], "meanRating": v[1] / v[0]})(vec(p[1]))),
    "J4b_priceband_category": lambda p: (p[0], (lambda v: {"products": v[0], "reviews": v[1], "ratingSum": v[2], "meanRating": v[2] / v[1] if v[1] else 0})(vec(p[1]))),
    "J5_brand_ranking":       lambda p: (p[0], (lambda v: {"products": v[0], "reviews": v[1], "ratingSum": v[2], "meanRating": v[2] / v[1] if v[1] else 0})(vec(p[1]))),
    "J6_verified_helpful":    lambda p: (p[0], (lambda v: {"n": v[0], "helpful": v[1], "ratingSum": v[2]})(vec(p[1]))),
    "J7_family_month":        lambda p: (p[0], (lambda v: {"rows": v[0], "sales": v[1], "promoRows": v[2]})(vec(p[1]))),
    "J8_promo_lift":          lambda p: (p[0], (lambda v: {"rows": v[0], "sales": v[1], "mean": v[1] / v[0]})(vec(p[1]))),
    "J9_weekday_profile":     lambda p: (p[0], (lambda v: {"rows": v[0], "sales": v[1], "mean": v[1] / v[0]})(vec(p[1]))),
    "J10_waste_by_family":    lambda p: (p[0], (lambda v: {"events": v[0], "units": v[1]})(vec(p[1]))),
}
out = {}
D.mr_results.delete_many({})
for job, fn in SPEC.items():
    if not (MR / f"{job}.tsv").exists(): print("skip", job); continue
    docs = ({"job": job, "key": k, "values": v, "source": "hadoop-streaming"} for k, v in (fn(p) for p in rows(job)))
    out[job] = bulk(D.mr_results, docs)
D.mr_results.create_index([("job", 1), ("key", 1)])
# J2 and J4 are large, per-product tables
D.mr_product_stats.drop(); D.mr_joined_products.drop()
out["J2_product_stats"] = bulk(D.mr_product_stats, ({"parent_asin": p[0], "reviews": int(p[1]), "meanRating": float(p[2]), "verified": int(p[3]), "helpful": int(p[4]), "hist": [int(x) for x in p[5:10]]} for p in rows("J2_product_stats")))
out["J4_join_reviews_meta"] = bulk(D.mr_joined_products, ({"parent_asin": p[0], "store": p[1], "category2": p[2], "category3": p[3], "priceBand": p[4], "price": float(p[5]) if p[5] else None, "reviews": int(p[6]), "ratingSum": float(p[7]), "meanRating": float(p[7]) / int(p[6])} for p in rows("J4_join_reviews_meta")))
D.mr_product_stats.create_index("parent_asin", unique=True); D.mr_joined_products.create_index("parent_asin", unique=True); D.mr_joined_products.create_index("store")
# job metadata from logs
D.mr_jobs.delete_many({})
for f in sorted(glob.glob(str(ROOT / "evidence/hadoop/J*.log"))):
    t = open(f).read(); name = pathlib.Path(f).stem
    g = lambda pat: (int(m.group(1).replace(",", "")) if (m := re.search(pat, t)) else None)
    ex = re.search(r"# exit=(\d+) elapsed_s=(\d+)", t)
    counters = {m.group(1) + "." + m.group(2): int(m.group(3)) for m in re.finditer(r"^\s+(Cleaning|Join)\s*\n?", t, re.M)} if False else {}
    for grp in ("Cleaning", "Join"):
        blk = re.search(rf"\n\s+{grp}\n((?:\s+\S+=\d+\n)+)", t)
        if blk: counters[grp] = {k: int(v) for k, v in re.findall(r"(\S+)=(\d+)", blk.group(1))}
    D.mr_jobs.insert_one({"job": name, "exitCode": int(ex.group(1)) if ex else None, "elapsedSeconds": int(ex.group(2)) if ex else None,
        "mapInputRecords": g(r"Map input records=(\d+)"), "reduceOutputRecords": g(r"Reduce output records=(\d+)"), "launchedMaps": g(r"Launched map tasks=(\d+)"),
        "launchedReduces": g(r"Launched reduce tasks=(\d+)"), "hdfsBytesRead": g(r"HDFS: Number of bytes read=(\d+)"), "cpuMs": g(r"CPU time spent \(ms\)=(\d+)"),
        "counters": counters, "ranAt": now})
json.dump(out, open(ROOT / "evidence/mongo/load_mr_results.json", "w"), indent=1); print(out)
