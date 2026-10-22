#!/usr/bin/env python3
"""RetailPulse automatic learning pipeline (per tenant).

AGGREGATE -> PROFILE -> BACKTEST (select) -> HONEST SCORE -> FORECAST -> RECOMMEND
Models per SKU x store series: ma28, seasonal-average(4 wk), Croston-SBA (intermittent), global GBM.
Selection uses window V (t-2H..t-H); the reported accuracy is measured on the later window T (t-H..t),
so the selection step never sees the data it is scored on. The seasonal-average model is the baseline.

usage: python engine/pipeline.py demo-a [--asof YYYY-MM-DD]
"""
import argparse, datetime as dt, json, math, os, pathlib, sys, time, uuid, warnings
import numpy as np, pandas as pd
from pymongo import MongoClient
from sklearn.ensemble import HistGradientBoostingRegressor
warnings.filterwarnings("ignore")
H = 28
URI = os.environ.get("MONGO_URI", "mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true")
DBN = os.environ.get("MONGO_DB", "retailpulse")


def log(*a): print(f"[{time.strftime('%H:%M:%S')}]", *a, flush=True)


# ---------------------------------------------------------------- models (vectorised over series)
def m_ma28(Y, h): return np.repeat(Y[:, -28:].mean(axis=1, keepdims=True), h, axis=1)


def m_sa4(Y, h):
    t = Y.shape[1]
    cols = [Y[:, [max(t - 7 * k + (i % 7), 0) for k in range(1, 5)]].mean(axis=1) for i in range(h)]
    return np.stack(cols, axis=1)


def m_sba(Y, h, alpha=0.1):
    n, t = Y.shape
    z = np.zeros(n); p = np.zeros(n); q = np.ones(n); init = np.zeros(n, bool)
    for d in range(t):
        y = Y[:, d]; nz = y > 0
        first = nz & ~init
        z[first] = y[first]; p[first] = q[first]; init |= first
        upd = nz & ~first
        z[upd] += alpha * (y[upd] - z[upd]); p[upd] += alpha * (q[upd] - p[upd])
        q = np.where(nz, 1, q + 1)
    f = np.where(init, (1 - alpha / 2) * z / np.maximum(p, 1e-9), 0.0)
    return np.repeat(f[:, None], h, axis=1)


def gbm_feats(Y, origin, cats, h_arr, dates):
    hist = Y[:, : origin + 1]
    m7, m28, m91 = hist[:, -7:].mean(1), hist[:, -28:].mean(1), hist[:, -91:].mean(1)
    nz28 = (hist[:, -28:] > 0).mean(1)
    rows = []
    for h in h_arr:
        tgt = origin + h
        same = [Y[:, tgt - 7 * k] for k in range(1, 6) if tgt - 7 * k <= origin]
        sd = np.mean(same, axis=0) if same else m28
        td = dates[origin] + pd.Timedelta(days=h)
        rows.append(np.column_stack([m7, m28, m91, sd, nz28, np.full(len(Y), h), np.full(len(Y), td.dayofweek), np.full(len(Y), td.day),
                                     np.full(len(Y), td.month), cats[:, 0], cats[:, 1], m7 / (m91 + 0.1), hist[:, -1]]))
    return np.vstack(rows)


def m_gbm(Y, cats, dates, end_idx, eligible):
    """Train a global direct model with origins <= end_idx-H; forecast H days after end_idx. Returns [n,H]."""
    Xs, ys = [], []
    for o in range(end_idx - H, max(end_idx - H - 7 * 52, 120), -7):
        Xs.append(gbm_feats(Y[eligible], o, cats[eligible], range(1, H + 1), dates))
        ys.append(np.log1p(np.concatenate([Y[eligible][:, o + h] for h in range(1, H + 1)])))
    if not Xs: return np.zeros((len(Y), H))
    X, y = np.vstack(Xs).astype(np.float32), np.concatenate(ys)
    mdl = HistGradientBoostingRegressor(max_iter=200, learning_rate=0.08, max_leaf_nodes=32, min_samples_leaf=50,
                                        categorical_features=[9], random_state=42).fit(X, y)
    pred = np.zeros((len(Y), H))
    pred[eligible] = np.expm1(mdl.predict(gbm_feats(Y[eligible], end_idx, cats[eligible], range(1, H + 1), dates).astype(np.float32))).reshape(H, -1).T
    return np.maximum(pred, 0)


def window(Y, cats, dates, end_idx, eligible):
    hist = Y[:, : end_idx + 1]
    out = {"seasonal_avg4": m_sa4(hist, H), "ma28": m_ma28(hist, H), "croston_sba": m_sba(hist, H)}
    out["gbm"] = m_gbm(Y, cats, dates, end_idx, eligible)
    return out


def wape_rows(actual, pred):
    e = np.abs(pred - actual).sum(axis=1); a = actual.sum(axis=1)
    return np.where(a > 0, e / np.maximum(a, 1e-9), np.where(e > 0, 1.0 + e, 0.0))


# ---------------------------------------------------------------- pipeline
def run(tenant, asof=None):
    t0 = time.time(); db = MongoClient(URI)[DBN]; run_id = uuid.uuid4().hex[:12]
    ten = db.tenants.find_one({"_id": tenant}) or {}
    simulated = bool(ten.get("simulated"))
    asof = asof or ten.get("asOfDate")
    df = pd.DataFrame(list(db.sales.find({"tenantId": tenant}, {"_id": 0, "storeId": 1, "date": 1, "sku": 1, "qty": 1})))
    if df.empty: log("no sales"); return None
    if asof is None: asof = df.date.max()
    df = df[df.date <= asof]; asof_ts = pd.Timestamp(asof)
    dates = pd.date_range(df.date.min(), asof_ts); nd = len(dates); didx = {d.strftime("%Y-%m-%d"): i for i, d in enumerate(dates)}
    prods = {p["sku"]: p for p in db.products.find({"tenantId": tenant}, {"_id": 0})}
    sups = {s["supplierKey"]: s for s in db.suppliers.find({"tenantId": tenant}, {"_id": 0})}
    inv = {(i["storeId"], i["sku"]): i for i in db.inventory_state.find({"tenantId": tenant}, {"_id": 0})}
    fam_codes = {f: i for i, f in enumerate(sorted({p.get("family", "") for p in prods.values()}))}
    log(f"[{tenant}] asOf={asof} days={nd} sales_rows={len(df)} skus={len(prods)}")
    db.forecasts.delete_many({"tenantId": tenant}); db.recommendations.delete_many({"tenantId": tenant, "status": "suggested"})
    db.inventory_insights.delete_many({"tenantId": tenant})
    fdocs, rdocs, idocs = [], [], []
    summary = {"stores": {}, "model_counts": {}, "wape_selected": [], "wape_baseline": [], "cov": [], "act": [], "ae_sel": [], "ae_base": []}
    now = dt.datetime.utcnow(); today = (asof_ts + pd.Timedelta(days=1))
    for store, g in df.groupby("storeId"):
        skus = sorted(g.sku.unique()); sidx = {s: i for i, s in enumerate(skus)}
        Y = np.zeros((len(skus), nd), dtype=np.float32)
        ii = g.sku.map(sidx).values; jj = g.date.map(didx).values
        np.add.at(Y, (ii, jj), g.qty.values.astype(np.float32))
        first = np.array([int(np.argmax(r > 0)) if (r > 0).any() else nd for r in Y]); hist_days = nd - first
        cats = np.column_stack([[fam_codes.get(prods.get(s, {}).get("family", ""), 0) for s in skus], np.full(len(skus), int(store[-1]) if store[-1].isdigit() else 0)])
        active = (Y[:, -90:].sum(axis=1) > 0)
        elig_full = (hist_days >= 56) & active
        log(f"  {store}: series={len(skus)} eligible={int(elig_full.sum())}")
        models = ["seasonal_avg4", "ma28", "croston_sba", "gbm"]
        if elig_full.sum() >= 20 and nd >= 3 * H + 130:
            fv = window(Y, cats, dates, nd - 1 - 2 * H, elig_full)         # window V (selection)
            ft = window(Y, cats, dates, nd - 1 - H, elig_full)             # window T (honest score)
            act_v, act_t = Y[:, nd - 2 * H: nd - H], Y[:, nd - H:]
            wv = np.vstack([wape_rows(act_v, fv[m]) for m in models]); wt = np.vstack([wape_rows(act_t, ft[m]) for m in models])
            sel_v = np.argmin(wv, axis=0)                                  # chosen on V
            pred_sel_t = np.array([ft[models[b]][i] for i, b in enumerate(sel_v)])
            sigma = np.sqrt(((pred_sel_t - act_t) ** 2).mean(axis=1))
            e = elig_full
            a_sum = act_t[e].sum()
            summary["wape_selected"].append(float(np.abs(pred_sel_t[e] - act_t[e]).sum() / max(a_sum, 1)))
            summary["wape_baseline"].append(float(np.abs(ft["seasonal_avg4"][e] - act_t[e]).sum() / max(a_sum, 1)))
            summary["cov"].append(float((np.abs(pred_sel_t[e] - act_t[e]) <= 1.28 * sigma[e, None]).mean()))
            summary["act"].append(float(a_sum))
            best_t = np.argmin(wv + wt, axis=0)                            # final choice on V+T
            ffin = window(Y, cats, dates, nd - 1, elig_full)
            wsel = wt[sel_v, np.arange(len(skus))]
        else:
            ffin = {"ma28": m_ma28(Y, H), "seasonal_avg4": m_sa4(Y, H), "croston_sba": m_sba(Y, H), "gbm": np.zeros((len(skus), H))}
            best_t = np.full(len(skus), 1); sigma = Y[:, -28:].std(axis=1); wsel = np.full(len(skus), np.nan); wt = np.full((4, len(skus)), np.nan)
        for i, sku in enumerate(skus):
            p = prods.get(sku, {})
            nzr = Y[i][Y[i] > 0]
            adi = nd / max(len(nzr), 1) if len(nzr) else 99
            cv2 = (nzr.std() / nzr.mean()) ** 2 if len(nzr) > 1 else 0
            klass = "smooth" if adi < 1.32 and cv2 < 0.49 else "erratic" if adi < 1.32 else "intermittent" if cv2 < 0.49 else "lumpy"
            hd = int(hist_days[i])
            if hd < 14:
                model, conf = None, "learning"
            elif hd < 56 or not elig_full[i]:
                model, conf = "ma28", "low"
            else:
                model = models[int(best_t[i])]; w = float(wsel[i]) if not np.isnan(wsel[i]) else 1
                conf = "high" if w <= 0.35 else "medium" if w <= 0.7 else "low"
            base_mdl = "ma28" if model is None else model
            f = ffin[base_mdl][i] if model else np.zeros(H)
            sg = float(sigma[i]) if model else 0.0
            baseline_w = float(wt[0, i]) if not np.isnan(wt[0, i]) else None
            hz = [{"date": (asof_ts + pd.Timedelta(days=k + 1)).strftime("%Y-%m-%d"), "p50": round(float(max(f[k], 0)), 3),
                   "lo": round(float(max(f[k] - 1.28 * sg, 0)), 3), "hi": round(float(f[k] + 1.28 * sg), 3)} for k in range(H)] if model else []
            if model: summary["model_counts"][model] = summary["model_counts"].get(model, 0) + 1
            fdocs.append(dict(tenantId=tenant, storeId=store, sku=sku, runId=run_id, generatedAt=now, asOf=asof, model=model, demandClass=klass,
                              confidence=conf, historyDays=hd, dailyMean=round(float(f.mean()), 4), sigmaDaily=round(sg, 4),
                              backtest=dict(wapeSelected=None if np.isnan(wsel[i]) else round(float(wsel[i]), 4), wapeBaseline=None if baseline_w is None else round(baseline_w, 4),
                                            baselineModel="seasonal_avg4"),
                              horizon=hz, simulated=simulated))
            # ---- inventory insight + recommendation
            st = inv.get((store, sku))
            on_hand, on_order = (st["onHand"], st["onOrder"]) if st else (None, None)
            d = float(f.mean()) if model else float(Y[i, -28:].mean())
            cover = (on_hand / d) if (on_hand is not None and d > 0) else None
            vel = "non-moving" if not active[i] else "fast" if d >= 5 else "stable" if d >= 1 else "slow"
            cost = p.get("costPaise", 0)
            idocs.append(dict(tenantId=tenant, storeId=store, sku=sku, runId=run_id, velocity=vel, demandClass=klass, dailyDemand=round(d, 3),
                              onHand=on_hand, daysOfCover=None if cover is None else round(cover, 1),
                              cashTiedPaise=None if on_hand is None else int(on_hand * cost), asOf=asof, simulated=simulated))
            if model and st and d > 0:
                sup = sups.get(p.get("supplierKey"), {"leadTimeDays": 2, "reviewPeriodDays": 3, "name": "Supplier"})
                L, R = int(sup.get("leadTimeDays", 2)), int(sup.get("reviewPeriodDays", 3))
                horizon_demand = float(sum(h_["p50"] for h_ in hz[: L + R]))
                safety = 1.65 * sg * math.sqrt(L + R) if sg > 0 else 0.0
                need = horizon_demand + safety - on_hand - on_order
                pack = max(int(p.get("packSize", 1)), 1)
                days_cover = on_hand / d
                stockout = today + pd.Timedelta(days=int(days_cover))
                order_by = stockout - pd.Timedelta(days=L)
                if need > 0.5 * pack or (days_cover < L + 1 and need > 0):
                    qty = int(math.ceil(need / pack) * pack)
                    urgency = "now" if order_by <= today else "soon" if order_by <= today + pd.Timedelta(days=2) else "later"
                    txt = (f"Sells about {d:.1f}/day · {on_hand} in stock (≈ {days_cover:.1f} days) · "
                           f"{sup.get('name','supplier')} delivers in {L} day{'s' if L != 1 else ''} · "
                           + ("order today." if urgency == "now" else f"order by {order_by.strftime('%d %b')}."))
                    rdocs.append(dict(tenantId=tenant, storeId=store, sku=sku, runId=run_id, createdAt=now, status="suggested",
                                      suggestedQty=qty, finalQty=qty, supplierKey=p.get("supplierKey"), supplierName=sup.get("name"),
                                      orderByDate=order_by.strftime("%Y-%m-%d"), urgency=urgency, unitCostPaise=int(cost), estCostPaise=int(cost * qty),
                                      confidence=conf, model=model,
                                      reason=dict(text=txt, inputs=dict(dailyDemand=round(d, 3), onHand=int(on_hand), onOrder=int(on_order), leadDays=L, reviewDays=R,
                                                                       horizonDemand=round(horizon_demand, 1), safetyStock=round(safety, 1), packSize=pack,
                                                                       daysOfCover=round(days_cover, 1), formula="demand(L+R) + safety − onHand − onOrder")),
                                      simulated=simulated))
    for coll, docs in ((db.forecasts, fdocs), (db.recommendations, rdocs), (db.inventory_insights, idocs)):
        for k in range(0, len(docs), 5000):
            coll.insert_many(docs[k: k + 5000], ordered=False)
    for coll in (db.forecasts, db.recommendations, db.inventory_insights):
        coll.create_index([("tenantId", 1), ("storeId", 1), ("sku", 1)])
    db.recommendations.create_index([("tenantId", 1), ("status", 1), ("urgency", 1)])
    w = sum(summary["act"]) or 1
    sel = sum(a * b for a, b in zip(summary["act"], summary["wape_selected"])) / w if summary["act"] else None
    base = sum(a * b for a, b in zip(summary["act"], summary["wape_baseline"])) / w if summary["act"] else None
    rep = dict(tenantId=tenant, runId=run_id, asOf=asof, createdAt=now, seconds=round(time.time() - t0, 1), simulated=simulated,
               series=len(fdocs), recommendations=len(rdocs), modelCounts=summary["model_counts"], horizonDays=H,
               honestScore=dict(window="last 28 days, selection made on the preceding 28 days", wapeSelected=sel, wapeBaselineSeasonalAvg4=base,
                                coverage80=float(np.mean(summary["cov"])) if summary["cov"] else None),
               note="SIMULATED tenant: scores describe the simulation, not real shops." if simulated else "")
    db.forecast_runs.insert_one(dict(rep))
    pathlib.Path(__file__).resolve().parents[1].joinpath("evidence/forecast").mkdir(parents=True, exist_ok=True)
    rep.pop("_id", None)
    (pathlib.Path(__file__).resolve().parents[1] / f"evidence/forecast/pipeline_{tenant}.json").write_text(json.dumps(rep, indent=2, default=str))
    log("DONE", json.dumps({k: rep[k] for k in ("series", "recommendations", "seconds", "honestScore")}, default=str))
    return rep


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("tenant"); ap.add_argument("--asof"); a = ap.parse_args()
    run(a.tenant, a.asof)
