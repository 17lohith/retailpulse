#!/usr/bin/env python3
"""RetailPulse SIMULATOR (layer L3) -- everything produced here is SIMULATED.

Demand shape comes from REAL Favorita (Store Sales) family-level daily sales; each family's
daily total is split across SKUs (Zipf long-tail, weekly modulation, launches/discontinuations)
with a multinomial draw so that  sum(SKU demand) == round(scale * real family sales)  exactly.
Supply (orders, deliveries, batches with expiry, shrinkage, write-offs) is simulated with an
owner-style reorder policy, so stock-outs and waste emerge naturally.

usage: python simulation/generate.py demo-a|demo-b [--seed 42]
"""
import argparse, collections, datetime as dt, json, math, pathlib, sys, time
import numpy as np, pandas as pd
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from catalog import FAMILIES, SUPPLIERS, build_catalog

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
START, END = pd.Timestamp("2015-08-12"), pd.Timestamp("2017-08-15")   # 735 real days
HOLDOUT_DAYS = 28                       # last 28 days are hidden "future" (demo + evaluation)
SHIFT_DAYS = 3290                       # 470 whole weeks: weekday pattern preserved, ends 2026-08-18
TENANTS = {
    "demo-a": dict(name="Sri Lakshmi Provision Store", kind="single-owner store", stores=1, target_units=1200, sku_factor=0.5, seed_off=1),
    "demo-b": dict(name="GreenMart Supermarkets", kind="3-store small chain", stores=3, target_units=3500, sku_factor=1.0, seed_off=2),
}


def shifted(ts): return (pd.Timestamp(ts) + pd.Timedelta(days=SHIFT_DAYS)).strftime("%Y-%m-%d")


def load_real():
    tr = pd.read_csv(RAW / "store_sales/train.csv", parse_dates=["date"])
    tr = tr[(tr.date >= START) & (tr.date <= END) & (tr.family.isin(FAMILIES))]
    st = pd.read_csv(RAW / "store_sales/stores.csv")
    return tr, st


def pick_stores(tr, st, n, tenant_seed):
    days = (END - START).days + 1
    tot = tr.groupby(["store_nbr", "date"]).sales.sum().unstack(fill_value=0)
    active = (tot > 0).sum(axis=1) / days
    ok = [s for s in tot.index if active[s] > 0.95]
    mean = tot.loc[ok].mean(axis=1)
    if n == 1:
        s = (mean - mean.median()).abs().idxmin(); return [int(s)]
    city_counts = st[st.store_nbr.isin(ok)].groupby("city").size()
    city = city_counts.idxmax()
    cand = sorted(st[(st.city == city) & st.store_nbr.isin(ok)].store_nbr.tolist())
    return [int(x) for x in cand[:n]]


def simulate_store(rng, prods, real_fam, scale, store_idx, n_days, asof_idx, dates):
    """Return dict of arrays/events for one store."""
    n = len(prods)
    fam_idx = collections.defaultdict(list)
    for i, p in enumerate(prods): fam_idx[p["family"]].append(i)
    # ---- demand: multinomial split of scaled real family totals
    D = np.zeros((n_days, n), dtype=np.int32)
    weeks = n_days // 7 + 2
    launch = np.zeros(n, dtype=int); disc = np.full(n, 10**6)
    new = rng.random(n) < 0.06; launch[new] = rng.integers(60, 600, new.sum())
    gone = (rng.random(n) < 0.03) & ~new; disc[gone] = rng.integers(300, 650, gone.sum())
    closed = np.zeros(n_days, dtype=bool)
    recon = {}
    for fam, idx in fam_idx.items():
        idx = np.array(idx); k = len(idx)
        base = 1.0 / np.arange(1, k + 1) ** 0.85; rng.shuffle(base)
        base = base * rng.lognormal(0, 0.3, k)
        mod = rng.lognormal(0, 0.25, (weeks, k))
        series = real_fam[fam]  # array n_days (real units)
        tot = np.rint(series * scale).astype(np.int64)
        for d in range(n_days):
            if tot[d] <= 0: continue
            act = (launch[idx] <= d) & (d < disc[idx])
            p = base * mod[d // 7] * act
            if p.sum() == 0: p = base.copy()
            D[d, idx] = rng.multinomial(tot[d], p / p.sum())
        recon[fam] = bool((D[:, idx].sum(axis=1) == tot).all())
    closed = (D.sum(axis=1) == 0)
    # ---- supply simulation
    mrp = np.array([p["mrpPaise"] for p in prods]); cost = np.array([p["costPaise"] for p in prods])
    pack = np.array([p["packSize"] for p in prods]); shelf = np.array([p["shelfLifeDays"] or 0 for p in prods])
    policy = [p["trackingPolicy"] for p in prods]; tracked = np.array([x != "off" for x in policy])
    sup_key = [p["supplierKey"] for p in prods]
    lead = np.array([SUPPLIERS[k][1] for k in sup_key]); review = np.array([SUPPLIERS[k][2] for k in sup_key])
    review_off = np.array([sum(map(ord, k)) % 7 for k in sup_key])
    bias = rng.lognormal(0, 0.25, n)
    on_hand = np.zeros(n, dtype=np.int64); on_order = np.zeros(n, dtype=np.int64)
    roll = np.zeros(n); sales_hist = np.zeros((n_days, n), dtype=np.int32); stockout = np.zeros((n_days, n), dtype=bool)
    batches = collections.defaultdict(list)           # sku -> list of batch dicts sorted by expiry
    expiries = collections.defaultdict(list)          # day -> [(sku, batch)]
    arrivals = collections.defaultdict(list)          # day -> [(sku, qty, po)]
    pos, receipts, moves = [], [], []                 # moves: adjustments / write-offs
    bid = [0]; poid = [0]
    snap = {}

    def new_batch(sku, d, qty, po, kind="RECEIPT"):
        bid[0] += 1
        b = dict(batchId=f"B{store_idx}-{bid[0]:06d}", sku=prods[sku]["sku"], receivedDay=d, qty=int(qty), remaining=int(qty),
                 poId=po, costPaise=int(cost[sku]), kind=kind)
        if policy[sku] != "off":
            life = int(shelf[sku]); mfg_back = int(rng.integers(0, max(1, life // 8) + 1))
            b["mfgDay"] = d - mfg_back; b["expiryDay"] = d - mfg_back + life
            b["expirySource"] = "entered" if policy[sku] == "strict" else "estimated"
            batches[sku].append(b); batches[sku].sort(key=lambda x: x["expiryDay"])
            expiries[b["expiryDay"]].append((sku, b))
        return b

    est0 = D[:28].mean(axis=0)
    for s in range(n):  # opening stock
        q = int(math.ceil(est0[s] * 8 / pack[s]) * pack[s]) if est0[s] > 0 else 0
        if q > 0:
            b = new_batch(s, -3, q, None, "OPENING")
            if "expiryDay" in b:  # opening stock expires somewhere within its life
                expiries[b["expiryDay"]].remove((s, b))
                b["expiryDay"] = int(rng.integers(3, max(5, int(shelf[s] * 0.8))))
                expiries[b["expiryDay"]].append((s, b)); batches[s].sort(key=lambda x: x["expiryDay"])
            on_hand[s] = q
            receipts.append(b)
    for d in range(n_days):
        # 1) arrivals
        for s, q, po in arrivals.pop(d, []):
            on_order[s] -= q
            if q > 0:
                on_hand[s] += q; receipts.append(new_batch(s, d, q, po))
        # 2) sales (stock-out censoring)
        dem = D[d]
        sold = np.minimum(dem, on_hand)
        stockout[d] = (dem > on_hand)
        on_hand -= sold; sales_hist[d] = sold
        for s in np.nonzero((sold > 0) & tracked)[0]:       # FEFO depletion
            rem = int(sold[s])
            for b in batches[s]:
                if rem <= 0: break
                t = min(b["remaining"], rem); b["remaining"] -= t; rem -= t
        # 3) shrinkage (damage / theft) 0.15% of sku-days with stock
        cand = np.nonzero(on_hand > 0)[0]
        hit = cand[rng.random(len(cand)) < 0.0015]
        for s in hit:
            q0 = q = int(min(on_hand[s], rng.integers(1, 4)))
            on_hand[s] -= q
            for b in batches[s]:
                if b["remaining"] > 0:
                    t = min(b["remaining"], q); b["remaining"] -= t; q -= t
                    if q == 0: break
            moves.append(dict(day=d, sku=prods[s]["sku"], type="ADJUSTMENT", reason="damage/shrinkage", qty=-q0))
        # 4) expiry write-offs (end of expiry day)
        for s, b in expiries.pop(d, []):
            if b["remaining"] > 0:
                moves.append(dict(day=d, sku=prods[s]["sku"], type="EXPIRY_WRITEOFF", reason="expired unsold", qty=-int(b["remaining"]), batchId=b["batchId"]))
                on_hand[s] -= b["remaining"]; b["remaining"] = 0
        # 5) rolling 28d mean of sales
        roll += sold
        if d >= 28: roll -= sales_hist[d - 28]
        # 6) review & order
        if d < n_days - 1:
            by_sup = collections.defaultdict(list)
            est = roll / min(28, d + 1) * bias
            age_new = (launch > 0) & (d - launch < 14) & (d >= launch)
            est = np.where(age_new & (est < 0.3), 0.3, est)
            for k in sorted(set(sup_key)):
                ks = [i for i in np.nonzero(np.array(sup_key) == k)[0]]
                if not ks: continue
                R = SUPPLIERS[k][2]
                if (d + review_off[ks[0]]) % R != 0: continue
                for s in ks:
                    if est[s] < 0.02 or d >= disc[s]: continue
                    L = int(lead[s]); inv_pos = on_hand[s] + on_order[s]
                    if inv_pos > est[s] * (L + R + 1): continue
                    up_to = est[s] * (L + R + 2)
                    if shelf[s] and policy[s] == "strict": up_to = min(up_to, est[s] * shelf[s] * 0.6)
                    q = int(math.ceil(max(up_to - inv_pos, 0) / pack[s]) * pack[s])
                    if q <= 0: continue
                    by_sup[k].append((s, q, L))
            for k, lines in by_sup.items():
                poid[0] += 1; pid = f"PO{store_idx}-{poid[0]:05d}"
                arr_day = d + lines[0][2] + (1 if rng.random() < 0.15 else 0)
                plines = []
                for s, q, L in lines:
                    recv = int(q * 0.7) if rng.random() < 0.04 else q
                    on_order[s] += recv
                    arrivals[arr_day].append((s, recv, pid))
                    plines.append(dict(sku=prods[s]["sku"], orderedQty=q, receivedQty=recv, unitCostPaise=int(cost[s])))
                pos.append(dict(poId=pid, supplierKey=k, orderDay=d, expectedDay=arr_day, receivedDay=arr_day, lines=plines))
        if d == asof_idx:
            snap = dict(on_hand=on_hand.copy(), on_order=on_order.copy(),
                        remaining={b["batchId"]: int(b["remaining"]) for b in receipts},
                        batches={prods[s]["sku"]: [dict(b) for b in bl if b["remaining"] > 0] for s, bl in batches.items()},
                        open_pos=[dict(po, lines=[dict(l) for l in po["lines"]]) for po in pos if po["receivedDay"] > asof_idx])
    return dict(D=D, sales=sales_hist, stockout=stockout, pos=pos, receipts=receipts, moves=moves, snap=snap, recon=recon,
                closed=closed)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("tenant"); ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args(); cfg = TENANTS[a.tenant]
    t0 = time.time()
    out = ROOT / "data/clean/sim" / a.tenant; (out / "exports").mkdir(parents=True, exist_ok=True)
    tr, st = load_real()
    stores = pick_stores(tr, st, cfg["stores"], a.seed)
    n_days = (END - START).days + 1
    asof_idx = n_days - 1 - HOLDOUT_DAYS
    dates = pd.date_range(START, END)
    nfam = {f: max(2, int(round(v[4] * cfg["sku_factor"]))) for f, v in FAMILIES.items()}
    prods = build_catalog(RAW / "amazon2023/meta_Grocery_and_Gourmet_Food.jsonl", nfam, a.seed + cfg["seed_off"], a.tenant)
    print(f"[{a.tenant}] stores={stores} products={len(prods)} ({time.time()-t0:.0f}s)")
    pv = tr.pivot_table(index=["store_nbr", "date"], columns="family", values="sales", aggfunc="sum")
    sales_rows, future_rows, truth_rows = [], [], []
    all_moves, all_receipts, all_pos, snaps, recon_all, stats = [], [], [], {}, {}, {}
    for si, sn in enumerate(stores):
        rng = np.random.default_rng(a.seed * 100 + cfg["seed_off"] * 10 + si)
        real_fam = {f: pv.loc[sn][f].reindex(dates, fill_value=0).values.astype(float) for f in FAMILIES}
        mean_units = sum(v.mean() for v in real_fam.values())
        scale = cfg["target_units"] / mean_units
        res = simulate_store(rng, prods, real_fam, scale, si, n_days, asof_idx, dates)
        store_id = f"{a.tenant}-S{si+1}"
        sku = np.array([p["sku"] for p in prods]); mrp = np.array([p["mrpPaise"] for p in prods])
        for d_idx in range(n_days):
            nz = np.nonzero(res["sales"][d_idx])[0]
            if len(nz) == 0: continue
            rows = pd.DataFrame({"tenantId": a.tenant, "storeId": store_id, "date": shifted(dates[d_idx]),
                                 "sku": sku[nz], "qty": res["sales"][d_idx][nz].astype(int),
                                 "revenuePaise": res["sales"][d_idx][nz].astype(np.int64) * mrp[nz], "simulated": True})
            (sales_rows if d_idx <= asof_idx else future_rows).append(rows)
        tdf = []
        for d_idx in range(n_days):
            nz = np.nonzero(res["D"][d_idx])[0]
            if len(nz): tdf.append(pd.DataFrame({"storeId": store_id, "date": shifted(dates[d_idx]), "sku": sku[nz],
                                                 "trueDemand": res["D"][d_idx][nz], "sold": res["sales"][d_idx][nz],
                                                 "stockout": res["stockout"][d_idx][nz]}))
        truth_rows.append(pd.concat(tdf))
        rem = res["snap"]["remaining"]
        vis_b = []
        for b in res["receipts"]:
            if b["receivedDay"] <= asof_idx:
                b["remaining"] = rem[b["batchId"]]; vis_b.append(b)
        res["receipts"] = vis_b
        res["moves"] = [m for m in res["moves"] if m["day"] <= asof_idx]
        vis_po = []
        for po in res["pos"]:
            if po["orderDay"] > asof_idx: continue
            if po["receivedDay"] > asof_idx:
                po["status"] = "OPEN"
                for l in po["lines"]: l["receivedQty"] = None
            else: po["status"] = "RECEIVED"
            vis_po.append(po)
        res["pos"] = vis_po
        for m in res["moves"]: m.update(storeId=store_id, date=shifted(dates[m["day"]]))
        for b in res["receipts"]:
            b.update(storeId=store_id, receivedDate=shifted(dates[max(b["receivedDay"], 0)]) if b["receivedDay"] >= 0 else shifted(dates[0] - pd.Timedelta(days=3)))
        for po in res["pos"]: po.update(storeId=store_id)
        all_moves += res["moves"]; all_receipts += res["receipts"]; all_pos += res["pos"]; snaps[store_id] = res["snap"]
        recon_all[store_id] = res["recon"]
        so = res["stockout"][: asof_idx + 1]; dm = res["D"][: asof_idx + 1]
        stats[store_id] = dict(real_store_nbr=sn, visible_batches=len(res["receipts"]), scale=round(scale, 5), mean_daily_units=float(res["D"].sum(axis=1).mean()),
                               sku_days_stockout_share=float(so[dm > 0].mean()) if (dm > 0).any() else 0,
                               lost_units_share=float(1 - res["sales"].sum() / res["D"].sum()),
                               pos=len(res["pos"]), batches=len(res["receipts"]),
                               expiry_writeoff_units=int(-sum(m["qty"] for m in res["moves"] if m["type"] == "EXPIRY_WRITEOFF")),
                               shrink_events=sum(1 for m in res["moves"] if m["type"] == "ADJUSTMENT"),
                               closed_days=int(res["closed"].sum()))
        print(f"  store {store_id}: {stats[store_id]}  ({time.time()-t0:.0f}s)")
    sales = pd.concat(sales_rows); future = pd.concat(future_rows)
    sales.to_csv(out / "sales_daily.csv.gz", index=False); future.to_csv(out / "future_sales_daily.csv.gz", index=False)
    pd.concat(truth_rows).to_csv(out / "TRUTH_demand_and_stockouts.csv.gz", index=False)
    # --- JSONL documents
    sup_docs = [dict(tenantId=a.tenant, supplierKey=k, name=v[0], leadTimeDays=v[1], reviewPeriodDays=v[2], simulated=True) for k, v in SUPPLIERS.items()]
    def dump(name, rows):
        with open(out / f"{name}.jsonl", "w") as f:
            for r in rows: f.write(json.dumps(r, default=str) + "\n")
    dump("products", prods); dump("suppliers", sup_docs)
    for b in all_receipts:
        b["tenantId"] = a.tenant; b["simulated"] = True
        for k in ("mfgDay", "expiryDay"):
            if k in b: b[k.replace("Day", "Date")] = shifted(dates[0] + pd.Timedelta(days=int(b.pop(k))))
        b.pop("receivedDay", None)
    dump("batches", all_receipts)
    for po in all_pos:
        po.update(tenantId=a.tenant, simulated=True)
        for k in ("orderDay", "expectedDay", "receivedDay"):
            po[k.replace("Day", "Date")] = shifted(dates[0] + pd.Timedelta(days=int(po.pop(k))))
    dump("purchase_orders", all_pos)
    for m in all_moves: m.update(tenantId=a.tenant, simulated=True); m.pop("day", None)
    dump("stock_adjustments", all_moves)
    snap_docs = []
    for sid, sn in snaps.items():
        for i, p in enumerate(prods):
            snap_docs.append(dict(tenantId=a.tenant, storeId=sid, sku=p["sku"], onHand=int(sn["on_hand"][i]), onOrder=int(sn["on_order"][i]),
                                  asOf=shifted(dates[asof_idx]), simulated=True))
    dump("inventory_state", snap_docs)
    # --- Vyapar-style / Marg-style exports (what a real owner would upload)
    sk = {p["sku"]: p for p in prods}
    for sid in stores_ids(a.tenant, len(stores)):
        s = sales[sales.storeId == sid].copy()
        x = pd.DataFrame({"Date": pd.to_datetime(s.date).dt.strftime("%d/%m/%Y"), "Item Name": s.sku.map(lambda v: sk[v]["name"]),
                          "Item Code": s.sku, "Category": s.sku.map(lambda v: sk[v]["family"]),
                          "Quantity": s.qty, "Sale Amount": (s.revenuePaise / 100).round(2)})
        x.to_csv(out / "exports" / f"vyapar_style_item_sales_{sid}.csv", index=False)
    pe = []
    for b in all_receipts:
        p = sk[b["sku"]]
        pe.append({"Date": pd.Timestamp(b["receivedDate"]).strftime("%d/%m/%Y"), "Store": b["storeId"], "Supplier": SUPPLIERS[p["supplierKey"]][0],
                   "Invoice No": b.get("poId") or "OPENING", "Item Code": b["sku"], "Item Name": p["name"], "Batch No": b["batchId"],
                   "Expiry": pd.Timestamp(b["expiryDate"]).strftime("%m/%y") if b.get("expiryDate") else "", "Qty": b["qty"],
                   "Rate": b["costPaise"] / 100})
    pd.DataFrame(pe).to_csv(out / "exports" / "marg_style_purchase_register.csv", index=False)
    card = dict(tenant=a.tenant, tenant_name=cfg["name"], kind=cfg["kind"], SIMULATED=True, seed=a.seed, real_stores_used=stores,
                date_shift_days=SHIFT_DAYS, real_window=[str(START.date()), str(END.date())],
                visible_through=shifted(dates[asof_idx]), hidden_future_days=HOLDOUT_DAYS, products=len(prods),
                currency="INR", usd_to_inr_assumption=33.0, family_reconciliation_ok=recon_all, per_store=stats,
                sales_rows_visible=len(sales), sales_rows_future=len(future), runtime_s=round(time.time() - t0, 1))
    (out / "sim_report.json").write_text(json.dumps(card, indent=2, default=str))
    (ROOT / "evidence/data_profile").mkdir(parents=True, exist_ok=True)
    (ROOT / f"evidence/data_profile/sim_report_{a.tenant}.json").write_text(json.dumps(card, indent=2, default=str))
    print("DONE", json.dumps({k: card[k] for k in ("products", "sales_rows_visible", "runtime_s")}))


def stores_ids(t, n): return [f"{t}-S{i+1}" for i in range(n)]


if __name__ == "__main__":
    main()
