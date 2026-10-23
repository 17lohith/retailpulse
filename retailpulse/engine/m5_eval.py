#!/usr/bin/env python3
"""Real-data SKU-level benchmark: Walmart M5, FOODS items x 3 stores (CA_1, TX_1, WI_1), 28-day hold-out.
Uses the PRODUCTION pipeline functions (pipeline.window / wape_rows) unchanged: selection on window V, honest score on window T."""
import json, pathlib, sys, time
import numpy as np, pandas as pd
sys.path.insert(0, str(pathlib.Path(__file__).parent)); import pipeline as P
ROOT = pathlib.Path(__file__).resolve().parents[1]; H = P.H; T0 = time.time()
STORES = ("CA_1", "TX_1", "WI_1")
df = pd.read_parquet(ROOT / "data/raw/external/m5-parquet/m5_train.parquet")
df["unique_id"] = df.unique_id.astype(str)
keep = df[df.unique_id.str.startswith("FOODS") & df.unique_id.str.endswith(STORES)]
Y = keep.pivot(index="unique_id", columns="ds", values="y").fillna(0).astype(np.float32); ids = Y.index.to_list(); dates = pd.to_datetime(Y.columns); Yv = Y.values; nd = Yv.shape[1]
dept = np.array([int(i.split("_")[1]) for i in ids]); store = np.array([STORES.index(i[-4:]) for i in ids]); cats = np.column_stack([dept, store])
first = np.array([int(np.argmax(r > 0)) if (r > 0).any() else nd for r in Yv]); hist = nd - first; active = Yv[:, -90:].sum(1) > 0; elig = (hist >= 56) & active
print(f"series={len(ids)} eligible={int(elig.sum())} days={nd} ({dates[0].date()}..{dates[-1].date()})", flush=True)
models = ["seasonal_avg4", "ma28", "croston_sba", "gbm"]
fv = P.window(Yv, cats, dates, nd - 1 - 2 * H, elig); ft = P.window(Yv, cats, dates, nd - 1 - H, elig)
act_v, act_t = Yv[:, nd - 2 * H: nd - H], Yv[:, nd - H:]
wv = np.vstack([P.wape_rows(act_v, fv[m]) for m in models]); sel_v_plain = np.argmin(wv, axis=0); sel_v = P.guarded_choice(wv, models)
pred_sel = np.array([ft[models[b]][i] for i, b in enumerate(sel_v)]); sigma = np.sqrt(((pred_sel - act_t) ** 2).mean(axis=1)); e = elig
def agg(pred): return float(np.abs(pred[e] - act_t[e]).sum() / act_t[e].sum())
res = {m: dict(WAPE=agg(ft[m]), MAE=float(np.abs(ft[m][e] - act_t[e]).mean())) for m in models}; res["selected"] = dict(WAPE=agg(pred_sel), MAE=float(np.abs(pred_sel[e] - act_t[e]).mean()))
pred_plain = np.array([ft[models[b]][i] for i, b in enumerate(sel_v_plain)]); res["selected_plain_argmin"] = dict(WAPE=agg(pred_plain), MAE=float(np.abs(pred_plain[e] - act_t[e]).mean()))
# demand class (Syntetos-Boylan) breakdown, same rule as the pipeline
klass = []
for r in Yv:
    nz = r[r > 0]; adi = nd / max(len(nz), 1) if len(nz) else 99; cv2 = (nz.std() / nz.mean()) ** 2 if len(nz) > 1 else 0
    klass.append("smooth" if adi < 1.32 and cv2 < 0.49 else "erratic" if adi < 1.32 else "intermittent" if cv2 < 0.49 else "lumpy")
klass = np.array(klass); by_class = {}
for k in sorted(set(klass[e])):
    m = e & (klass == k); a = act_t[m].sum()
    by_class[k] = dict(series=int(m.sum()), units=float(a), selected=float(np.abs(pred_sel[m] - act_t[m]).sum() / a), baseline=float(np.abs(ft["seasonal_avg4"][m] - act_t[m]).sum() / a))
cov = float((np.abs(pred_sel[e] - act_t[e]) <= 1.28 * sigma[e, None]).mean())
base = res["seasonal_avg4"]["WAPE"]; best = min(res, key=lambda k: res[k]["WAPE"])
print({k: round(v["WAPE"], 4) for k, v in res.items()})
out = dict(dataset="M5 (Walmart) FOODS x CA_1,TX_1,WI_1 - real SKU-level daily sales", series=len(ids), eligible=int(e.sum()), horizon=H, test_window=[str(dates[nd - H].date()), str(dates[-1].date())],
           metrics=res, best_model=best, baseline="seasonal_avg4", improvement_vs_baseline_pct=float((1 - res["selected"]["WAPE"] / base) * 100), coverage80=cov, by_demand_class=by_class,
           selector_choice=dict(zip(models, [int((sel_v[e] == i).sum()) for i in range(len(models))])), runtime_s=round(time.time() - T0))
(ROOT / "evidence/forecast/m5_foods_metrics.json").write_text(json.dumps(out, indent=2)); print(json.dumps(out, indent=2))
