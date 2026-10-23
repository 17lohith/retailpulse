#!/usr/bin/env python3
"""Independent (pandas / numpy) validation of the external-dataset Hadoop jobs X1..X8. -> evidence/validation/validation_external.{json,md}"""
import json, pathlib, re, sys, time, datetime as dt
import numpy as np, pandas as pd
ROOT = pathlib.Path(__file__).resolve().parents[1]; sys.path.insert(0, str(ROOT / "validation"))
from validate_jobs import compare
import validate_jobs as VJ
VJ.MR = ROOT / "data/clean/mr"; X = ROOT / "data/raw/external"; C = ROOT / "data/clean/ext"; OUT = ROOT / "evidence/validation"; T0 = time.time()
def tsv(job): return [l.rstrip("\n").split("\t") for l in open(ROOT / f"data/clean/mr/{job}.tsv", encoding="utf-8")]
def vec(s): return [float(x) for x in s.split(",")]
res = []
# ---------------- Instacart
op = pd.read_csv(X / "instacart-market-basket-analysis/order_products__prior.csv", usecols=["order_id", "product_id", "reordered"], dtype="int32")
sup = op.groupby("product_id").size(); freq = sup[sup >= 3000]
res.append(compare("X1 item support >= 3000 (Instacart)", {a: [float(b)] for a, b in tsv("X1_item_support")}, {str(k): [float(v)] for k, v in freq.items()}))
f = op[op.product_id.isin(freq.index)].sort_values(["order_id", "product_id"], ignore_index=True)
o, p = f.order_id.values, f.product_id.values; cuts = np.flatnonzero(np.diff(o)) + 1; starts = np.r_[0, cuts]; ends = np.r_[cuts, len(o)]
sizes = ends - starts; multi = np.flatnonzero(sizes >= 2); pairs = {}
buf = []
for k, i in enumerate(multi):
    b = p[starts[i]:ends[i]]; n = len(b); ia, ib = np.triu_indices(n, 1); buf.append(b[ia].astype(np.int64) * 1_000_000 + b[ib])
    if (k + 1) % 200000 == 0 or k == len(multi) - 1:
        u, c = np.unique(np.concatenate(buf), return_counts=True); buf = []
        for a, cc in zip(u.tolist(), c.tolist()): pairs[a] = pairs.get(a, 0) + cc
res.append(compare("X1b baskets with >= 2 frequent items", {"n": [float(len(tsv("X1b_frequent_baskets")))]}, {"n": [float(len(multi))]}))
res.append(compare("X1c frequent pair counts >= 300", {a: [float(b)] for a, b in tsv("X1c_pair_counts")}, {f"{k // 1_000_000},{k % 1_000_000}": [float(v)] for k, v in pairs.items() if v >= 300}))
pr = pd.read_csv(X / "instacart-market-basket-analysis/products.csv"); m = op.merge(pr[["product_id", "aisle_id", "department_id"]], on="product_id")
mine = {}
for key, col in (("D", "department_id"), ("A", "aisle_id")):
    g = m.groupby(col).agg(n=("reordered", "size"), r=("reordered", "sum"))
    mine.update({f"{key}:{i}": [float(r.n), float(r.r)] for i, r in g.iterrows()})
res.append(compare("X2 reorder rate by department & aisle (map-side join)", {a: vec(b) for a, b in tsv("X2_reorder_by_department")}, mine))
od = pd.read_csv(X / "instacart-market-basket-analysis/orders.csv"); mine = {}
h = od.groupby(["order_dow", "order_hour_of_day"]).size(); mine.update({f"H:{d}|{hh:02d}": [float(v)] for (d, hh), v in h.items()})
g = od.days_since_prior_order.dropna().astype(int).clip(upper=30); gg = g.value_counts(); mine.update({f"G:{'30+' if k >= 30 else '%02d' % k}": [float(v)] for k, v in gg.items()})
res.append(compare("X3 order timing (weekday x hour, recency)", {a: vec(b) for a, b in tsv("X3_order_timing")}, mine))
del op, m, f
# ---------------- Dunnhumby
t = pd.read_csv(X / "dunnhumby-the-complete-journey/transaction_data.csv"); pd_ = pd.read_csv(X / "dunnhumby-the-complete-journey/product.csv")
pd_["DEPARTMENT"] = pd_.DEPARTMENT.fillna("").astype(str).str.strip().replace("", "UNKNOWN"); pd_["BRAND"] = pd_.BRAND.fillna("").astype(str).str.strip().replace("", "UNKNOWN")
j = t.merge(pd_[["PRODUCT_ID", "DEPARTMENT", "BRAND"]], on="PRODUCT_ID", how="left"); j["DEPARTMENT"] = j.DEPARTMENT.fillna("UNKNOWN"); j["BRAND"] = j.BRAND.fillna("UNKNOWN"); j["Q"] = (j.WEEK_NO // 13)
g = j.groupby(["DEPARTMENT", "Q", "BRAND"]).agg(n=("QUANTITY", "size"), q=("QUANTITY", "sum"), s=("SALES_VALUE", "sum"), rd=("RETAIL_DISC", "sum"), cd=("COUPON_DISC", "sum"))
res.append(compare("X4 discount depth by dept x quarter x brand type (map-side join)", {a: vec(b) for a, b in tsv("X4_discount_depth")}, {f"{d}|Q{q:02d}|{b}": [r.n, r.q, r.s, r.rd, r.cd] for (d, q, b), r in g.iterrows()}, tol=1e-9))
bs = t.groupby("BASKET_ID").agg(n=("QUANTITY", "size"), s=("SALES_VALUE", "sum")); bk = lambda n: "01" if n == 1 else "02-05" if n <= 5 else "06-10" if n <= 10 else "11-20" if n <= 20 else "21-40" if n <= 40 else "41+"
bs["b"] = [bk(n) for n in bs.n]; g = bs.groupby("b").agg(c=("n", "size"), s=("s", "sum"), l=("n", "sum"))
res.append(compare("X4b/X4c basket size histogram", {a: vec(b) for a, b in tsv("X4c_basket_size_histogram")}, {f"SIZE:{k}": [r.c, r.s, r.l] for k, r in g.iterrows()}, tol=1e-6)); del t, j
# ---------------- Online Retail II
o = pd.read_csv(X / "online-retail-ii-uci/online_retail_II.csv", dtype={"Invoice": str, "StockCode": str}); NP = re.compile(r"^(POST|DOT|M|BANK CHARGES|AMAZONFEE|C2|D|S|B|CRUK|ADJUST\d*|PADS|TEST\d*|GIFT.*)$", re.I)
o = o[~o.StockCode.fillna("").str.match(NP)]; o = o[o.Price > 0]; o["month"] = o.InvoiceDate.str[:7]; canc = o.Invoice.str.startswith("C"); mine = {}
s = o[~canc & (o.Quantity > 0)]; c = o[canc]
for mo, grp in s.groupby("month"): mine[f"M:{mo}"] = [len(grp), float(grp.Quantity.sum()), float((grp.Quantity * grp.Price).sum()), 0, 0]
for mo, grp in c.groupby("month"):
    v = mine.setdefault(f"M:{mo}", [0, 0, 0, 0, 0]); v[3] = len(grp); v[4] = float(grp.Quantity.abs().sum())
for k, v in (s.assign(rev=s.Quantity * s.Price).groupby("Country").rev.sum()).items(): mine[f"C:{k}"] = [float(v)]
sp = s.groupby("StockCode").Quantity.sum(); cp = c.groupby("StockCode").Quantity.apply(lambda x: float(x.abs().sum()))
for k in set(sp.index) | set(cp.index): mine[f"P:{k}"] = [float(sp.get(k, 0)), float(cp.get(k, 0))]
res.append(compare("X5 online retail: monthly revenue / returns / country / product", {a: vec(b) for a, b in tsv("X5_online_retail")}, mine, tol=1e-6)); del o, s, c
# ---------------- M5
m5 = pd.read_parquet(X / "m5-parquet/m5_train.parquet"); m5["unique_id"] = m5.unique_id.astype(str); m5["y"] = m5.y.astype(np.int64); m5["nz"] = (m5.y > 0).astype(int); m5["y2"] = m5.y ** 2
g = m5.groupby("unique_id", observed=True).agg(n=("y", "size"), nz=("nz", "sum"), s=("y", "sum"), ss=("y2", "sum")); g["s"] = m5[m5.y > 0].groupby("unique_id", observed=True).y.sum().reindex(g.index).fillna(0); g["ss"] = m5[m5.y > 0].groupby("unique_id", observed=True).y2.sum().reindex(g.index).fillna(0)
mean = g.s / g.nz.replace(0, np.nan); cv2 = ((g.ss / g.nz.replace(0, np.nan) - mean ** 2).clip(lower=0) / mean ** 2).where(g.nz > 1, 0).fillna(0); adi = g.n / g.nz.replace(0, np.nan)
cls = np.where(g.nz == 0, "no_demand", np.where((adi < 1.32) & (cv2 < 0.49), "smooth", np.where(adi < 1.32, "erratic", np.where(cv2 < 0.49, "intermittent", "lumpy"))))
hd = {r[0]: r for r in tsv("X6_m5_demand_classes")}
mism = [k for k, c_ in zip(g.index, cls) if hd[k][6] != c_]; maxdiff = max(abs(float(hd[k][4]) - float(cv2[k])) for k in g.index if g.nz[k] > 1)
r6 = dict(check="X6 M5 demand class per series (30,490)", keys_hadoop=len(hd), keys_independent=len(g), mismatches=len(mism), max_abs_diff=float(maxdiff), status="PASS" if not mism and maxdiff < 1e-4 and len(hd) == len(g) else "FAIL", examples=mism[:3]); print(r6["check"], r6["status"]); res.append(r6)
gc = pd.Series(cls, index=g.index).groupby(lambda s: s.split("_")[0]).value_counts()
res.append(compare("X6b series count by department x class", {a: [vec(b)[0]] for a, b in tsv("X6b_class_by_department")}, {f"{d}|{k}": [float(v)] for (d, k), v in gc.items()}))
del m5
# ---------------- synthetic supermarket + RC superstore
s = pd.read_csv(X / "supermarket-inventory-and-demand-synthetic/inventory_management.csv"); s["cat"] = s.Category.str.strip().str.lower()
g = s.groupby(["cat", "Store_ID"]).agg(n=("Product_ID", "size"), sold=("Actual_Sales_Units", "sum"), w=("Units_Wasted", "sum"), loss=("Waste_Financial_Loss_USD", "sum"), oos=("Out_Of_Stock_Flag", "sum"), near=("Near_Expiry_Units", "sum"))
res.append(compare("X7 waste by category x store (dirty case normalised)", {a: vec(b) for a, b in tsv("X7_supermarket_waste")}, {f"{c}|{st}": [r.n, r.sold, r.w, r.loss, r.oos, r.near] for (c, st), r in g.iterrows()}, tol=1e-6))
rc = pd.read_json(C / "rc_superstore.jsonl", lines=True, dtype={"productId": str}); rc = rc[rc.price.notna()]; mine = {}
for pid, grp in rc.groupby("productId"):
    grp = grp.sort_values("month"); ps = grp.price.tolist(); mine[f"P:{pid}"] = [len(ps), min(ps), max(ps), round(ps[-1] - ps[0], 4), int(grp.deal.sum())]
for mo, grp in rc.groupby("month"): mine[f"M:{mo}"] = [len(grp), round(float(grp.price.sum()), 2), int(grp.deal.sum())]
res.append(compare("X8 price drift across 12 monthly scrapes", {a: vec(b) for a, b in tsv("X8_price_drift")}, mine, tol=1e-6))
rep = dict(generated=dt.datetime.now(dt.timezone.utc).isoformat(), runtime_s=round(time.time() - T0), all_pass=all(r["status"] == "PASS" for r in res), results=res)
(OUT / "validation_external.json").write_text(json.dumps(rep, indent=2, default=str))
md = ["# External-dataset Hadoop jobs vs independent pandas recomputation", "", "| Check | Keys (Hadoop) | Mismatches | Max abs diff | Status |", "|---|---|---|---|---|"] + [f"| {r['check']} | {r.get('keys_hadoop', '-')} | {r.get('mismatches', '-')} | {r.get('max_abs_diff', '-')} | {r['status']} |" for r in res]
(OUT / "validation_external.md").write_text("\n".join(md)); print("\n".join(md))
