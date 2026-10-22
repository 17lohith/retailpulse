#!/usr/bin/env python3
"""Profile the four raw sources and write JSON to evidence/data_profile/.
Reviews (6 GB) are profiled on the first N lines + exact line count; the full-file
statistics come from the Hadoop jobs (see hadoop/streaming)."""
import gzip, json, collections, sys, pathlib, re
import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
OUT = ROOT / "evidence/data_profile"; OUT.mkdir(parents=True, exist_ok=True)
N_REV = int(sys.argv[1]) if len(sys.argv) > 1 else 1_000_000

def save(name, obj):
    (OUT / f"{name}.json").write_text(json.dumps(obj, indent=2, default=str))
    print("wrote", name)

def profile_meta():
    n = bad = 0; has = collections.Counter(); price_types = collections.Counter()
    prices = []; cat2 = collections.Counter(); depth = collections.Counter(); stores = collections.Counter()
    for line in open(RAW / "amazon2023/meta_Grocery_and_Gourmet_Food.jsonl", encoding="utf-8"):
        try: d = json.loads(line)
        except Exception: bad += 1; continue
        n += 1
        for k in ("price", "store", "title", "categories", "details", "features", "description", "main_category"):
            v = d.get(k)
            if v not in (None, "", [], {}): has[k] += 1
        p = d.get("price"); price_types[type(p).__name__] += 1
        if isinstance(p, (int, float)): prices.append(p)
        elif isinstance(p, str):
            m = re.search(r"[\d.]+", p.replace(",", ""))
            if m:
                try: prices.append(float(m.group()))
                except ValueError: pass
        c = d.get("categories") or []; depth[len(c)] += 1
        if len(c) > 1: cat2[c[1]] += 1
        if d.get("store"): stores[d["store"]] += 1
    s = pd.Series(prices)
    save("amazon_meta", {"rows": n, "malformed": bad, "field_present": dict(has), "price_python_types": dict(price_types),
        "price_numeric_after_parse": len(prices), "price_describe": s.describe(percentiles=[.1,.5,.9,.99]).to_dict(),
        "category_depth": dict(sorted(depth.items())), "top_level2_categories": cat2.most_common(25),
        "distinct_stores": len(stores), "top_stores": stores.most_common(15)})

def profile_reviews():
    n = bad = 0; ratings = collections.Counter(); ver = collections.Counter(); years = collections.Counter()
    helpful = collections.Counter(); tl = []; keys = collections.Counter(); asins = set(); ts_min = 10**18; ts_max = 0
    with open(RAW / "amazon2023/Grocery_and_Gourmet_Food.jsonl", encoding="utf-8") as f:
        for i, line in enumerate(f):
            if i >= N_REV: break
            try: d = json.loads(line)
            except Exception: bad += 1; continue
            n += 1; keys.update(d.keys())
            ratings[d.get("rating")] += 1; ver[d.get("verified_purchase")] += 1
            ts = d.get("timestamp")
            if isinstance(ts, (int, float)):
                ts_min = min(ts_min, ts); ts_max = max(ts_max, ts)
                years[pd.Timestamp(ts, unit="ms").year] += 1
            helpful[min(int(d.get("helpful_vote") or 0), 10)] += 1
            tl.append(len(d.get("text") or "")); asins.add(d.get("parent_asin"))
    total = sum(1 for _ in open(RAW / "amazon2023/Grocery_and_Gourmet_Food.jsonl", "rb"))
    save("amazon_reviews", {"total_lines_exact": total, "profiled_lines": n, "malformed_in_sample": bad,
        "keys": dict(keys), "rating_dist": {str(k): v for k, v in sorted(ratings.items(), key=lambda x: str(x[0]))},
        "verified": {str(k): v for k, v in ver.items()}, "by_year": dict(sorted(years.items())),
        "ts_range": [str(pd.Timestamp(ts_min, unit="ms")), str(pd.Timestamp(ts_max, unit="ms"))],
        "helpful_votes_capped10": dict(sorted(helpful.items())), "distinct_products_in_sample": len(asins),
        "text_len": pd.Series(tl).describe(percentiles=[.5,.9,.99]).to_dict()})

def profile_snap():
    n = 0; scores = collections.Counter()
    with gzip.open(RAW / "snap_finefoods/finefoods.txt.gz", "rt", encoding="latin-1") as f:
        for line in f:
            if line.startswith("review/score:"):
                n += 1; scores[line.split(":")[1].strip()] += 1
    save("snap_finefoods", {"reviews": n, "score_dist": dict(sorted(scores.items()))})

def profile_store_sales():
    d = RAW / "store_sales"
    tr = pd.read_csv(d / "train.csv", parse_dates=["date"])
    info = {"rows": len(tr), "date_min": tr.date.min(), "date_max": tr.date.max(), "stores": tr.store_nbr.nunique(),
            "families": tr.family.nunique(), "days": tr.date.nunique(), "zero_sales_share": float((tr.sales == 0).mean()),
            "negative_sales": int((tr.sales < 0).sum()), "nulls": tr.isna().sum().to_dict(),
            "onpromotion_share": float((tr.onpromotion > 0).mean()), "sales_describe": tr.sales.describe().to_dict()}
    full = pd.date_range(tr.date.min(), tr.date.max())
    info["missing_calendar_days"] = [str(x.date()) for x in full.difference(pd.DatetimeIndex(tr.date.unique()))]
    info["duplicates_store_family_date"] = int(tr.duplicated(["date", "store_nbr", "family"]).sum())
    info["other_files_rows"] = {f: int(sum(1 for _ in open(d / f)) - 1) for f in ("stores.csv", "oil.csv", "holidays_events.csv", "transactions.csv")}
    save("store_sales", info)

if __name__ == "__main__":
    for fn in (profile_snap, profile_store_sales, profile_meta, profile_reviews): fn()
