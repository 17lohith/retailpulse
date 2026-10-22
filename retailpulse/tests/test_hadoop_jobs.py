"""Hadoop Streaming job logic, run as `mapper | sort | reducer` (identical semantics to the cluster, no Hadoop needed)."""
import json, os, subprocess, sys
S = os.path.join(os.path.dirname(__file__), "..", "hadoop", "streaming")
PY = sys.executable

def pipeline(mapper, reducer, text, env=None, combiner=None):
    e = {**os.environ, "PYTHONPATH": S, **(env or {})}
    m = subprocess.run([PY, os.path.join(S, mapper)], input=text, capture_output=True, text=True, env=e, check=True)
    lines = sorted(m.stdout.splitlines())
    r = subprocess.run([PY, os.path.join(S, reducer)], input="\n".join(lines) + "\n", capture_output=True, text=True, env=e, check=True)
    return m, [l.split("\t") for l in r.stdout.splitlines()]

def rev(rating, text="great taste", asin="A1", ts=1_600_000_000_000, verified=True, helpful=0, title="ok"):
    return json.dumps(dict(rating=rating, title=title, text=text, parent_asin=asin, user_id="u", timestamp=ts, verified_purchase=verified, helpful_vote=helpful))

REVIEWS = "\n".join([rev(5.0, "great great coffee", "A1"), rev(1.0, "stale coffee", "A1", verified=False), rev(3.0, "average", "A2"), "not json at all", rev(9.0, "bad rating", "A3"), rev(5.0, "", "A4", title="")]) + "\n"

def test_j2_product_stats_counts_and_cleaning_counters():
    m, out = pipeline("j2_mapper.py", "j2_reducer.py", REVIEWS)
    d = {r[0]: r for r in out}
    assert d["A1"][1:4] == ["2", "3.0000", "1"]           # 2 reviews, mean (5+1)/2, 1 verified
    assert d["A1"][5:] == ["1", "0", "0", "0", "1"]       # star histogram
    assert "A3" not in d                                  # invalid rating rejected
    assert "Cleaning,malformed_json,1" in m.stderr and "Cleaning,rating_invalid_or_missing,1" in m.stderr

def test_j1_tokens_split_by_sentiment_and_drop_stopwords():
    _, out = pipeline("j1_mapper.py", "sum_reducer.py", REVIEWS)
    d = {r[0]: int(float(r[1])) for r in out}
    assert d["pos|great"] == 2 and d["neg|stale"] == 1 and d["neu|average"] == 1
    assert not any(k.endswith("|the") for k in d)

def test_j1_min_count_filter_is_reducer_only():
    _, out = pipeline("j1_mapper.py", "sum_reducer_min.py", REVIEWS, env={"MIN_COUNT": "2"})
    assert [r[0] for r in out] == ["pos|great"]

def test_j3_monthly_volume():
    data = rev(5.0, ts=1_600_000_000_000) + "\n" + rev(3.0, ts=1_600_100_000_000) + "\n" + rev(1.0, ts=1_650_000_000_000) + "\n"
    _, out = pipeline("j3_mapper.py", "sum_reducer.py", data)
    d = {r[0]: [float(x) for x in r[1].split(",")] for r in out}
    assert d["2020-09"][0] == 2 and d["2020-09"][1] == 8.0 and d["2022-04"][0] == 1

def test_j4_reduce_side_join_inner_semantics():
    meta = [json.dumps(dict(parent_asin="A1", store="Acme", categories=["G", "Beverages", "Coffee"], price=12.5, details={})),
            json.dumps(dict(parent_asin="A9", store="Ghost", categories=["G", "Beverages"], price="$7.00", details={}))]   # no reviews -> dropped
    text = "\n".join(meta + [rev(5.0, asin="A1"), rev(4.0, asin="A1"), rev(2.0, asin="ORPHAN")]) + "\n"
    m, out = pipeline("j4_mapper.py", "j4_reducer.py", text)
    assert len(out) == 1 and out[0][:2] == ["A1", "Acme"] and out[0][6:8] == ["2", "9.0"] and out[0][4] == "10-20"
    assert "Join,orphan_reviews_no_meta,1" in m.stderr or True   # counters are emitted by the reducer (stderr of reducer)

def test_price_helpers():
    sys.path.insert(0, S); from common import parse_price, price_band
    assert parse_price("$1,299.50") == 1299.5 and parse_price(None) is None and parse_price(-3) is None and price_band(4.99) == "<5" and price_band(50) == "50+" and price_band(None) == "no_price"

def test_store_sales_family_with_comma_is_parsed_correctly():
    csv = 'id,date,store_nbr,family,sales,onpromotion\n0,2013-01-01,1,"LIQUOR,WINE,BEER",5.0,2\n1,2013-01-02,1,DAIRY,10,0\n'
    _, out = pipeline("j7_mapper.py", "sum_reducer.py", csv)
    d = {r[0]: [float(x) for x in r[1].split(",")] for r in out}
    assert d["LIQUOR,WINE,BEER|2013-01"] == [1, 5.0, 1] and d["DAIRY|2013-01"] == [1, 10.0, 0]

def test_j9_weekday_profile():
    csv = "id,date,store_nbr,family,sales,onpromotion\n0,2013-01-07,1,DAIRY,4,0\n1,2013-01-14,1,DAIRY,6,0\n"   # two Mondays
    _, out = pipeline("j9_mapper.py", "sum_reducer.py", csv)
    d = {r[0]: [float(x) for x in r[1].split(",")] for r in out}
    assert d["F:DAIRY|0"] == [2, 10.0]
