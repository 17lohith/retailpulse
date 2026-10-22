#!/usr/bin/env python3
"""LOCAL STAND-IN (not cloud evidence): runs the baseline half of cloud/sql/04 on DuckDB over the real Store Sales file, with the same
hold-out and series filter. The numbers are the targets the BigQuery run should reproduce for the baselines; they also cross-check
the Python benchmark (evidence/forecast/favorita_metrics.json)."""
import json, pathlib, sys, duckdb
ROOT = pathlib.Path(__file__).resolve().parents[2]
con = duckdb.connect()
con.execute(f"CREATE VIEW raw AS SELECT CAST(date AS DATE) AS date, store_nbr, family, sales, onpromotion FROM read_csv_auto('{ROOT}/data/raw/store_sales/train.csv')")
con.execute("CREATE TABLE v_series AS SELECT date, store_nbr, family, CAST(store_nbr AS VARCHAR) || '|' || family AS series_id, sales FROM raw")
last = con.execute("SELECT MAX(date) FROM v_series").fetchone()[0]
con.execute(f"CREATE TABLE elig AS SELECT series_id FROM v_series GROUP BY series_id HAVING SUM(CASE WHEN date > DATE '{last}' - 365 THEN sales ELSE 0 END) > 0 AND SUM(CASE WHEN date <= DATE '{last}' - 28 AND sales > 0 THEN 1 ELSE 0 END) > 365")
con.execute(f"CREATE TABLE h AS SELECT * FROM v_series WHERE series_id IN (SELECT series_id FROM elig)")
te = f"DATE '{last}' - 28"
con.execute(f"""CREATE TABLE test AS SELECT series_id, date, sales AS actual, CAST(date - ({te}) AS INTEGER) AS k FROM h WHERE date > {te}""")   # k = 1..28
con.execute(f"""CREATE TABLE base AS
 SELECT t.series_id, t.date, t.actual,
  (SELECT sales FROM h WHERE h.series_id = t.series_id AND h.date = {te}) AS naive,
  (SELECT sales FROM h WHERE h.series_id = t.series_id AND h.date = {te} - 6 + ((t.k - 1) % 7)) AS snaive7,
  (SELECT AVG(sales) FROM h WHERE h.series_id = t.series_id AND h.date <= {te} AND h.date > {te} - 28 AND (CAST(h.date - ({te}) AS INTEGER) - 1 - ((t.k - 1) % 7)) % 7 = 0) AS seasonal_avg4,
  (SELECT AVG(sales) FROM h WHERE h.series_id = t.series_id AND h.date <= {te} AND h.date > {te} - 28) AS ma28
 FROM test t""")
res = {}
for m in ("naive", "snaive7", "seasonal_avg4", "ma28"):
    wape, mae, series = con.execute(f"SELECT SUM(ABS({m} - actual)) / SUM(actual), AVG(ABS({m} - actual)), COUNT(DISTINCT series_id) FROM base").fetchone()
    res[m] = dict(WAPE=wape, MAE=mae)
out = dict(last_day=str(last), test_window_days=28, series=int(con.execute("SELECT COUNT(*) FROM elig").fetchone()[0]), baselines=res)
(ROOT / "evidence/forecast").mkdir(parents=True, exist_ok=True)
(ROOT / "evidence/forecast/duckdb_baselines.json").write_text(json.dumps(out, indent=2)); print(json.dumps(out, indent=2))
