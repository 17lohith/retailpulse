#!/usr/bin/env python3
"""Independent validation of the Hadoop job outputs.

A different implementation (plain Python / pandas, multiprocessing over byte ranges of the same raw files)
recomputes J1-J10; results are compared key by key with the Hadoop output in data/clean/mr/*.tsv.
Writes evidence/validation/validation_report.{json,md}.
"""
import collections, json, math, os, pathlib, sys, time, datetime as dt
from multiprocessing import Pool
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "hadoop/streaming"))
from common import STOP, TOKEN, price_band, parse_price  # same stop-word list is part of the job *specification*
REV = ROOT / "data/raw/amazon2023/Grocery_and_Gourmet_Food.jsonl"
META = ROOT / "data/raw/amazon2023/meta_Grocery_and_Gourmet_Food.jsonl"
MR = ROOT / "data/clean/mr"; OUT = ROOT / "evidence/validation"; OUT.mkdir(parents=True, exist_ok=True)
T0 = time.time()


def ranges(path, n):
    size = os.path.getsize(path); cuts = [0]
    with open(path, "rb") as f:
        for i in range(1, n):
            f.seek(size * i // n); f.readline(); cuts.append(f.tell())
    cuts.append(size); return list(zip(cuts[:-1], cuts[1:]))


def scan_reviews(args):
    start, end = args
    tok = collections.Counter(); prod = {}; month = {}; ver = {}; lenb = {}
    with open(REV, "rb") as f:
        f.seek(start)
        while f.tell() < end:
            line = f.readline()
            if not line: break
            try: d = json.loads(line)
            except Exception: continue
            r = d.get("rating")
            if not isinstance(r, (int, float)) or not (1 <= r <= 5): continue
            a = d.get("parent_asin"); v = 1 if d.get("verified_purchase") else 0; h = int(d.get("helpful_vote") or 0)
            p = prod.setdefault(a, [0, 0.0, 0, 0, 0, 0, 0, 0, 0]); p[0] += 1; p[1] += r; p[2] += v; p[3] += h; p[4 + int(round(r)) - 1] += 1
            ts = d.get("timestamp")
            if isinstance(ts, (int, float)) and ts > 0:
                m = dt.datetime.fromtimestamp(ts / 1000, dt.timezone.utc).strftime("%Y-%m"); x = month.setdefault(m, [0, 0.0, 0]); x[0] += 1; x[1] += r; x[2] += v
            k = "verified" if v else "unverified"; x = ver.setdefault(k, [0, 0, 0.0]); x[0] += 1; x[1] += h; x[2] += r
            n = len(d.get("text") or ""); lb = "0-50" if n < 50 else "50-150" if n < 150 else "150-400" if n < 400 else "400+"
            x = lenb.setdefault(lb, [0, 0, 0.0]); x[0] += 1; x[1] += h; x[2] += r
            text = ((d.get("title") or "") + " " + (d.get("text") or "")).lower()
            if len(text.strip()) < 3: continue
            b = "neg" if r <= 2 else "neu" if r < 4 else "pos"
            for t in TOKEN.findall(text):
                if t not in STOP: tok[(b, t)] += 1
    return tok, prod, month, ver, lenb


def merge_vec(dst, src):
    for k, v in src.items():
        if k in dst: dst[k] = [a + b for a, b in zip(dst[k], v)]
        else: dst[k] = list(v)


def compare(name, hadoop, mine, tol=1e-6):
    miss_h = [k for k in mine if k not in hadoop]; miss_m = [k for k in hadoop if k not in mine]
    bad = []; maxd = 0.0
    for k in hadoop.keys() & mine.keys():
        a, b = hadoop[k], mine[k]
        d = max(abs(x - y) for x, y in zip(a, b)) if isinstance(a, (list, tuple)) else abs(a - b)
        maxd = max(maxd, d)
        if d > tol * max(1, max(abs(x) for x in (a if isinstance(a, (list, tuple)) else [a]))): bad.append((k, a, b))
    res = dict(check=name, keys_hadoop=len(hadoop), keys_independent=len(mine), only_in_independent=len(miss_h), only_in_hadoop=len(miss_m),
               mismatches=len(bad), max_abs_diff=maxd, status="PASS" if not (miss_h or miss_m or bad) else "FAIL", examples=bad[:3])
    print(f"[{time.time()-T0:5.0f}s] {name}: {res['status']} (keys {len(hadoop)}, mismatches {len(bad)}, max diff {maxd:g})", flush=True); return res


def read_tsv(job): return [l.rstrip("\n").split("\t") for l in open(MR / f"{job}.tsv", encoding="utf-8")]


def main():
    results = []
    # ------------------------------------------------ pass over 14.3M reviews (12 processes)
    with Pool(12) as pool: parts = pool.map(scan_reviews, ranges(REV, 48))
    tok = collections.Counter(); prod = {}; month = {}; ver = {}; lenb = {}
    for t, p, m, v, l in parts:
        tok.update(t); merge_vec(prod, p); merge_vec(month, m); merge_vec(ver, v); merge_vec(lenb, l)
    print(f"[{time.time()-T0:5.0f}s] independent pass over reviews done: products={len(prod)} tokens={len(tok)}", flush=True)
    # J1 (threshold 50 is part of the job specification)
    h1 = {f"{a}": [float(b)] for a, b in read_tsv("J1_token_frequency")}
    results.append(compare("J1 token frequency (bucket|token >= 50)", h1, {f"{b}|{t}": [float(c)] for (b, t), c in tok.items() if c >= 50}))
    # J2
    h2 = {p[0]: [int(p[1]), float(p[2]) * int(p[1]), int(p[3]), int(p[4])] + [int(x) for x in p[5:10]] for p in read_tsv("J2_product_stats")}
    m2 = {a: [v[0], v[1], v[2], v[3]] + v[4:9] for a, v in prod.items()}
    for k in h2: h2[k][1] = round(h2[k][1], 0)   # Hadoop wrote the mean with 4 decimals: compare rating SUM rounded to integer-ish tolerance
    results.append(compare("J2 per-product count/rating-sum/verified/helpful/histogram", h2, {k: [v[0], round(v[1], 0)] + v[2:] for k, v in m2.items()}, tol=1e-3))
    # J3
    h3 = {p[0]: [float(x) for x in p[1].split(",")] for p in read_tsv("J3_monthly_volume")}
    results.append(compare("J3 monthly review volume", h3, month))
    # J6
    h6 = {p[0]: [float(x) for x in p[1].split(",")] for p in read_tsv("J6_verified_helpful")}
    results.append(compare("J6 verified / length-bucket helpfulness", h6, {**{f"V:{k}": v for k, v in ver.items()}, **{f"L:{k}": v for k, v in lenb.items()}}))
    # J4/J4b/J5 from the metadata join
    meta = {}
    for line in open(META, encoding="utf-8"):
        d = json.loads(line); c = d.get("categories") or []
        meta[d["parent_asin"]] = ((d.get("store") or "Unknown").replace("\t", " ").strip() or "Unknown", c[1] if len(c) > 1 else "Uncategorised", c[2] if len(c) > 2 else "", price_band(parse_price(d.get("price"))))
    j = {a: (meta[a], v) for a, v in prod.items() if a in meta}
    orphan = sum(v[0] for a, v in prod.items() if a not in meta)
    h4 = {p[0]: [int(p[6]), float(p[7])] for p in read_tsv("J4_join_reviews_meta")}
    results.append(compare("J4 reduce-side join (per-product reviews, rating sum)", h4, {a: [v[0], v[1]] for a, (m, v) in j.items()}))
    bb = collections.defaultdict(lambda: [0, 0, 0.0]); br = collections.defaultdict(lambda: [0, 0, 0.0])
    for a, (m, v) in j.items():
        x = bb[f"{m[3]}|{m[1]}"]; x[0] += 1; x[1] += v[0]; x[2] += v[1]
        y = br[m[0]]; y[0] += 1; y[1] += v[0]; y[2] += v[1]
    results.append(compare("J4b price band x category", {p[0]: [float(x) for x in p[1].split(",")] for p in read_tsv("J4b_priceband_category")}, dict(bb)))
    results.append(compare("J5 brand ranking", {p[0]: [float(x) for x in p[1].split(",")] for p in read_tsv("J5_brand_ranking")}, dict(br)))
    results.append(dict(check="J4 join integrity", orphan_reviews_without_metadata=orphan, joined_products=len(j), status="PASS" if orphan == 0 else "NOTE"))
    # ------------------------------------------------ Store Sales with pandas
    ss = pd.read_csv(ROOT / "data/raw/store_sales/train.csv", parse_dates=["date"])
    g = ss.assign(month=ss.date.dt.strftime("%Y-%m"), promo=(ss.onpromotion > 0).astype(int)).groupby(["family", "month"]).agg(rows=("sales", "size"), s=("sales", "sum"), p=("promo", "sum"))
    results.append(compare("J7 sales by family x month (pandas)", {p[0]: [float(x) for x in p[1].split(",")] for p in read_tsv("J7_family_month")}, {f"{f}|{m}": [r.rows, r.s, r.p] for (f, m), r in g.iterrows()}, tol=1e-9))
    g = ss.assign(k=ss.family + "|" + (ss.onpromotion > 0).map({True: "promo", False: "nopromo"})).groupby("k").agg(rows=("sales", "size"), s=("sales", "sum"))
    results.append(compare("J8 promo vs non-promo (pandas)", {p[0]: [float(x) for x in p[1].split(",")] for p in read_tsv("J8_promo_lift")}, {k: [r.rows, r.s] for k, r in g.iterrows()}, tol=1e-9))
    ss["dow"] = ss.date.dt.weekday
    gf = ss.groupby(["family", "dow"]).agg(rows=("sales", "size"), s=("sales", "sum")); gs = ss.groupby(["store_nbr", "dow"]).agg(rows=("sales", "size"), s=("sales", "sum"))
    mine = {f"F:{f}|{d}": [r.rows, r.s] for (f, d), r in gf.iterrows()}; mine.update({f"S:{s}|{d}": [r.rows, r.s] for (s, d), r in gs.iterrows()})
    results.append(compare("J9 weekday profile (pandas)", {p[0]: [float(x) for x in p[1].split(",")] for p in read_tsv("J9_weekday_profile")}, mine, tol=1e-9))
    # ------------------------------------------------ J10 against pandas
    f10 = MR / "J10_waste_by_family.tsv"
    if f10.exists() and f10.stat().st_size:
        fam = {}; adj = []
        for t in ("demo-a", "demo-b"):
            for l in open(ROOT / f"data/clean/sim/{t}/products.jsonl"): p = json.loads(l); fam[(p["tenantId"], p["sku"])] = p["family"]
            for l in open(ROOT / f"data/clean/sim/{t}/stock_adjustments.jsonl"): adj.append(json.loads(l))
        a = pd.DataFrame(adj); a["family"] = [fam.get((t, s), "UNKNOWN") for t, s in zip(a.tenantId, a.sku)]
        g = a.groupby(["family", "type", "storeId"]).agg(events=("qty", "size"), units=("qty", lambda x: -x.sum()))
        results.append(compare("J10 waste by family (map-side join) vs pandas", {p[0]: [float(x) for x in p[1].split(",")] for p in read_tsv("J10_waste_by_family")}, {f"{f}|{t}|{s}": [r.events, r.units] for (f, t, s), r in g.iterrows()}, tol=1e-9))
    rep = dict(generated=dt.datetime.now(dt.timezone.utc).isoformat(), runtime_s=round(time.time() - T0), all_pass=all(r["status"] in ("PASS", "NOTE") for r in results), results=results)
    (OUT / "validation_report.json").write_text(json.dumps(rep, indent=2, default=str))
    md = ["# Hadoop vs independent recomputation", "", f"Generated {rep['generated']} - runtime {rep['runtime_s']} s", "", "| Check | Keys (Hadoop) | Mismatches | Max abs diff | Status |", "|---|---|---|---|---|"]
    for r in results:
        md.append(f"| {r['check']} | {r.get('keys_hadoop', '-')} | {r.get('mismatches', '-')} | {r.get('max_abs_diff', '-')} | {r['status']} |")
    (OUT / "validation_report.md").write_text("\n".join(md)); print("\n".join(md))


if __name__ == "__main__":
    main()
