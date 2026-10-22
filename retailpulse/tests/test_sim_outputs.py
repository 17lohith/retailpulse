"""Checks on the generated SIMULATED data (skipped when it has not been generated)."""
import gzip, json, os
import pandas as pd, pytest
ROOT = os.path.join(os.path.dirname(__file__), "..")
SIM = os.path.join(ROOT, "data/clean/sim")
pytestmark = pytest.mark.skipif(not os.path.exists(os.path.join(SIM, "demo-a/sim_report.json")), reason="simulation not generated")

@pytest.mark.parametrize("t", ["demo-a", "demo-b"])
def test_family_totals_reconcile_exactly_with_real_data(t):
    r = json.load(open(os.path.join(SIM, t, "sim_report.json")))
    assert r["SIMULATED"] is True
    assert all(all(v.values()) for v in r["family_reconciliation_ok"].values())

@pytest.mark.parametrize("t", ["demo-a"])
def test_sales_never_exceed_true_demand_and_stock_is_never_negative(t):
    truth = pd.read_csv(os.path.join(SIM, t, "TRUTH_demand_and_stockouts.csv.gz"))
    assert (truth.sold <= truth.trueDemand).all() and (truth.sold >= 0).all()
    assert (truth[truth.stockout].trueDemand > truth[truth.stockout].sold).all()   # stock-out days are exactly the censored ones
    inv = [json.loads(l) for l in open(os.path.join(SIM, t, "inventory_state.jsonl"))]
    assert all(i["onHand"] >= 0 and i["onOrder"] >= 0 for i in inv)

@pytest.mark.parametrize("t", ["demo-a"])
def test_batches_are_consistent(t):
    seen = 0
    for l in open(os.path.join(SIM, t, "batches.jsonl")):
        b = json.loads(l); seen += 1
        assert 0 <= b["remaining"] <= b["qty"] and b["simulated"] is True
        if b.get("expiryDate"): assert b["expiryDate"] >= b["receivedDate"] or b["kind"] == "OPENING"
    assert seen > 1000

def test_no_future_data_leaks_into_visible_sales():
    r = json.load(open(os.path.join(SIM, "demo-a/sim_report.json"))); vis = r["visible_through"]
    s = pd.read_csv(os.path.join(SIM, "demo-a/sales_daily.csv.gz")); f = pd.read_csv(os.path.join(SIM, "demo-a/future_sales_daily.csv.gz"))
    assert s.date.max() <= vis < f.date.min()
    b = [json.loads(l) for l in open(os.path.join(SIM, "demo-a/batches.jsonl"))]
    assert max(x["receivedDate"] for x in b) <= vis
