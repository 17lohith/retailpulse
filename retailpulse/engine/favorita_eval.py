#!/usr/bin/env python3
"""Honest forecast evaluation on REAL data (Store Sales / Favorita, L2).

28-day chronological hold-out (2017-07-19 .. 2017-08-15), 1 782 store x family series.
Baselines: naive, seasonal-naive(7), seasonal-average(4 wks), MA7, MA28.
Models:    ETS (damped trend + weekly seasonality), global GBM (direct multi-horizon, promo/holiday aware).
Selector:  per-series model chosen on the PREVIOUS 28-day window, scored on the test window.
All numbers written to evidence/forecast/favorita_metrics.{json,md}; nothing is hard-coded.
"""
import json, pathlib, sys, time, warnings
import numpy as np, pandas as pd
from joblib import Parallel, delayed
from sklearn.ensemble import HistGradientBoostingRegressor
warnings.filterwarnings("ignore")
ROOT = pathlib.Path(__file__).resolve().parents[1]; RAW = ROOT / "data/raw/store_sales"
OUT = ROOT / "evidence/forecast"; OUT.mkdir(parents=True, exist_ok=True)
H = 28; T0 = time.time()

def log(*a): print(f"[{time.time()-T0:5.0f}s]", *a, flush=True)

tr = pd.read_csv(RAW / "train.csv", parse_dates=["date"])
hol = pd.read_csv(RAW / "holidays_events.csv", parse_dates=["date"])
hol = hol[(hol.locale == "National") & (hol.transferred == False) & hol.type.isin(["Holiday", "Additional", "Bridge", "Event", "Transfer"])]
holiday_dates = set(hol.date)
dates = pd.date_range(tr.date.min(), tr.date.max()); nd = len(dates)
Y = tr.pivot_table(index=["store_nbr", "family"], columns="date", values="sales", aggfunc="sum").reindex(columns=dates).fillna(0.0)
P = tr.pivot_table(index=["store_nbr", "family"], columns="date", values="onpromotion", aggfunc="sum").reindex(index=Y.index, columns=dates).fillna(0.0)
keep = (Y.iloc[:, -365:].sum(axis=1) > 0) & ((Y.iloc[:, :-H] > 0).sum(axis=1) > 365)
Y, P = Y[keep], P[keep]; series = Y.index.to_list(); Yv, Pv = Y.values, P.values; ns = len(series)
log(f"series={ns} days={nd} test={dates[-H].date()}..{dates[-1].date()}")
dow = dates.dayofweek.values; hol_flag = np.array([d in holiday_dates for d in dates]).astype(float)
fam_codes = pd.Categorical([s[1] for s in series]).codes; store_codes = np.array([s[0] for s in series])

def baselines(hist, h):
    """hist: [ns, t] -> dict model -> [ns, h] for the h days following hist."""
    t = hist.shape[1]; out = {}
    out["naive"] = np.repeat(hist[:, -1:], h, axis=1)
    idx = np.arange(h) % 7
    out["snaive7"] = hist[:, t - 7 + idx]
    out["seasonal_avg4"] = np.stack([hist[:, [t - 7 * k + (i % 7) for k in range(1, 5)]].mean(axis=1) for i in range(h)], axis=1)
    out["ma7"] = np.repeat(hist[:, -7:].mean(axis=1, keepdims=True), h, axis=1)
    out["ma28"] = np.repeat(hist[:, -28:].mean(axis=1, keepdims=True), h, axis=1)
    return out

def ets_one(y, h):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    y = np.asarray(y, float)
    try:
        if y.sum() == 0: return np.zeros(h)
        m = ExponentialSmoothing(y + 1e-3, trend="add", damped_trend=True, seasonal="add", seasonal_periods=7,
                                 initialization_method="estimated").fit(optimized=True)
        return np.maximum(m.forecast(h) - 1e-3, 0)
    except Exception:
        return np.repeat(y[-28:].mean(), h)

def ets_all(hist, h):
    res = Parallel(n_jobs=-1, batch_size=16)(delayed(ets_one)(hist[i, -364:], h) for i in range(hist.shape[0]))
    return np.array(res)

def gbm_features(origin, h_arr):
    """Features for origin index (last observed day = origin) and each target step in h_arr -> rows [ns*len(h_arr), f]"""
    hist = Yv[:, : origin + 1]
    m7, m28, m91 = hist[:, -7:].mean(1), hist[:, -28:].mean(1), hist[:, -91:].mean(1)
    rows = []
    for h in h_arr:
        tgt = origin + h
        same = [Yv[:, tgt - 7 * k] for k in range(1, 6) if tgt - 7 * k <= origin]
        sdow = np.mean(same, axis=0) if same else m28
        rows.append(np.column_stack([m7, m28, m91, sdow, np.full(ns, h), np.full(ns, dow[tgt]),
                                     Pv[:, tgt], np.full(ns, hol_flag[tgt]), np.full(ns, dates[tgt].month),
                                     np.full(ns, dates[tgt].day), fam_codes, store_codes,
                                     m7 / (m91 + 1), hist[:, -1]]))
    return np.vstack(rows)

def gbm_forecast(origin_train_end):
    """Train on origins up to origin_train_end - H (targets fully observed), predict the next H days after origin_train_end."""
    X, y = [], []
    for o in range(origin_train_end - H, origin_train_end - H - 7 * 78, -7):
        if o < 120: break
        X.append(gbm_features(o, range(1, H + 1))); y.append(np.log1p(np.concatenate([Yv[:, o + h] for h in range(1, H + 1)])))
    X, y = np.vstack(X), np.concatenate(y)
    mdl = HistGradientBoostingRegressor(max_iter=250, learning_rate=0.08, max_leaf_nodes=48, min_samples_leaf=50,
                                        categorical_features=[10], random_state=42).fit(X, y)
    pred = np.expm1(mdl.predict(gbm_features(origin_train_end, range(1, H + 1)))).reshape(H, ns).T
    return np.maximum(pred, 0), len(y)

def run_window(end_idx):
    """Forecast days end_idx+1..end_idx+H using data up to end_idx; return model -> [ns,H]"""
    hist = Yv[:, : end_idx + 1]
    f = baselines(hist, H)
    log("  ets..."); f["ets"] = ets_all(hist, H)
    log("  gbm..."); f["gbm"], nrows = gbm_forecast(end_idx); f["_gbm_rows"] = nrows
    return f

def metrics(actual, pred, hist_for_scale):
    e = pred - actual; ae = np.abs(e)
    scale = np.maximum(np.abs(hist_for_scale[:, 7:] - hist_for_scale[:, :-7]).mean(axis=1), 1e-9)
    return dict(WAPE=float(ae.sum() / max(actual.sum(), 1e-9)), MAE=float(ae.mean()), RMSE=float(np.sqrt((e ** 2).mean())),
                MASE=float((ae.mean(axis=1) / scale).mean()), bias_pct=float(e.sum() / max(actual.sum(), 1e-9) * 100))

test_end = nd - 1 - H; val_end = nd - 1 - 2 * H      # history ends here; forecasts cover the next H days
log("validation window"); fv = run_window(val_end)
log("test window"); ft = run_window(test_end)
act_v = Yv[:, nd - 2 * H: nd - H]; act_t = Yv[:, nd - H:]
models = [m for m in ft if not m.startswith("_")]
res = {m: metrics(act_t, ft[m], Yv[:, : nd - H]) for m in models}
# per-series selector on the validation window -> applied to the test window
wv = {m: np.abs(fv[m] - act_v).sum(axis=1) for m in models}
best = np.argmin(np.vstack([wv[m] for m in models]), axis=0)
sel = np.array([ft[models[b]][i] for i, b in enumerate(best)])
res["selector"] = metrics(act_t, sel, Yv[:, : nd - H])
# per family WAPE (test) for baseline snaive7 vs best global model
fam = np.array([s[1] for s in series]); per_family = {}
for f in sorted(set(fam)):
    m = fam == f; per_family[f] = {k: float(np.abs(ft[k][m] - act_t[m]).sum() / max(act_t[m].sum(), 1e-9)) for k in ("snaive7", "seasonal_avg4", "ma28", "ets", "gbm")}
    per_family[f]["actual_units"] = float(act_t[m].sum())
rank = sorted(res.items(), key=lambda kv: kv[1]["WAPE"])
winner_vs_base = {"best_model": rank[0][0], "best_WAPE": rank[0][1]["WAPE"], "best_baseline": min(("naive", "snaive7", "seasonal_avg4", "ma7", "ma28"), key=lambda k: res[k]["WAPE"])}
winner_vs_base["best_baseline_WAPE"] = res[winner_vs_base["best_baseline"]]["WAPE"]
winner_vs_base["improvement_pct_vs_best_baseline"] = float((1 - winner_vs_base["best_WAPE"] / winner_vs_base["best_baseline_WAPE"]) * 100)
selection_counts = {models[b]: int((best == b).sum()) for b in range(len(models))}
out = dict(window_test=[str(dates[-H].date()), str(dates[-1].date())], window_validation=[str(dates[nd - 2 * H].date()), str(dates[nd - H - 1].date())],
           series=ns, horizon_days=H, gbm_training_rows=int(ft["_gbm_rows"]), metrics=res, ranking=[k for k, _ in rank],
           summary=winner_vs_base, selector_choice_counts=selection_counts, per_family_WAPE=per_family, runtime_s=round(time.time() - T0))
(OUT / "favorita_metrics.json").write_text(json.dumps(out, indent=2))
md = ["# Favorita (Store Sales) 28-day hold-out — REAL data", f"Series: {ns} (store × family). Test window {out['window_test'][0]} → {out['window_test'][1]}.", "",
      "| Model | WAPE | MAE | RMSE | MASE | Bias % |", "|---|---|---|---|---|---|"]
for k, v in rank: md.append(f"| {k} | {v['WAPE']:.3f} | {v['MAE']:.1f} | {v['RMSE']:.1f} | {v['MASE']:.2f} | {v['bias_pct']:+.1f} |")
md += ["", f"Best model: **{winner_vs_base['best_model']}** (WAPE {winner_vs_base['best_WAPE']:.3f}); best baseline: **{winner_vs_base['best_baseline']}** "
       f"(WAPE {winner_vs_base['best_baseline_WAPE']:.3f}); change vs best baseline: {winner_vs_base['improvement_pct_vs_best_baseline']:+.1f}%.",
       "WAPE = Σ|error| / Σ actual (lower is better). MASE scaled by in-sample seasonal-naive(7) error."]
(OUT / "favorita_metrics.md").write_text("\n".join(md)); log("DONE"); print("\n".join(md))
