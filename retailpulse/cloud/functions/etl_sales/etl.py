"""Pure-Python ETL core for the Store Sales upload (no cloud imports -> unit-testable locally).

validate -> clean -> derive features -> write cleaned CSV + a JSON data-quality report.
Rows are never dropped silently: every drop is counted by reason and written to the report.
"""
import csv, hashlib, json, os, datetime as dt
from collections import Counter

EXPECTED = ["id", "date", "store_nbr", "family", "sales", "onpromotion"]
OUT_COLS = ["date", "store_nbr", "family", "sales", "onpromotion", "day_of_week", "month", "year", "is_promo"]


class ETLError(Exception):
    """File-level problem (wrong columns, empty file) - the whole upload is rejected with a readable message."""


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""): h.update(b)
    return h.hexdigest()


def process_csv(path_in, path_out):
    drops = Counter(); seen = {}; rows_in = 0
    with open(path_in, newline="", encoding="utf-8-sig") as f:
        rd = csv.reader(f)
        try: header = [h.strip().lower() for h in next(rd)]
        except StopIteration: raise ETLError("The file is empty.")
        missing = [c for c in EXPECTED if c not in header]
        if missing: raise ETLError(f"Missing required column(s): {', '.join(missing)}. Expected: {', '.join(EXPECTED)}.")
        ix = {c: header.index(c) for c in EXPECTED}
        for row in rd:
            rows_in += 1
            if len(row) < len(header): drops["short_row"] += 1; continue
            try: d = dt.date.fromisoformat(row[ix["date"]].strip())
            except ValueError: drops["invalid_date"] += 1; continue
            fam = row[ix["family"]].strip()
            if not fam: drops["missing_family"] += 1; continue
            try: store = int(row[ix["store_nbr"]])
            except ValueError: drops["invalid_store"] += 1; continue
            try: sales = float(row[ix["sales"]])
            except ValueError: drops["invalid_sales"] += 1; continue
            if sales < 0: drops["negative_sales"] += 1; continue
            try: promo = int(float(row[ix["onpromotion"]] or 0))
            except ValueError: drops["invalid_promo"] += 1; continue
            if promo < 0: drops["negative_promo"] += 1; continue
            key = (d, store, fam)
            if key in seen: drops["duplicate_key_replaced"] += 1
            seen[key] = (sales, promo)
    if not seen: raise ETLError("No valid rows were found in the file.")
    dates = [k[0] for k in seen]
    with open(path_out, "w", newline="") as out:
        w = csv.writer(out); w.writerow(OUT_COLS)
        for (d, store, fam), (sales, promo) in sorted(seen.items()):
            w.writerow([d.isoformat(), store, fam, sales, promo, d.weekday(), d.month, d.year, int(promo > 0)])
    report = dict(rows_in=rows_in, rows_out=len(seen), dropped=dict(drops), reconciles=rows_in == len(seen) + sum(v for k, v in drops.items() if k != "duplicate_key_replaced") + drops["duplicate_key_replaced"],
                  date_min=min(dates).isoformat(), date_max=max(dates).isoformat(), stores=len({k[1] for k in seen}), families=len({k[2] for k in seen}),
                  input_sha256=sha256_file(path_in), generated_at=dt.datetime.now(dt.timezone.utc).isoformat())
    return report


def handle_event(data, storage, bq, workdir="/tmp"):
    """Core of the Cloud Run function. `data` is the GCS 'object finalized' payload; storage/bq are injected (fakes in tests)."""
    bucket, name = data["bucket"], data["name"]
    if not (name.startswith("raw/") and name.lower().endswith(".csv")):
        return {"status": "ignored", "reason": "not a raw/*.csv upload", "object": name}
    local_in = os.path.join(workdir, os.path.basename(name)); local_out = local_in + ".clean.csv"
    storage.download(bucket, name, local_in)
    try:
        report = process_csv(local_in, local_out)
    except ETLError as e:
        rej = {"status": "rejected", "object": name, "error": str(e)}
        _put_json(storage, bucket, f"reports/{os.path.basename(name)}.rejected.json", rej, workdir); return rej
    out_name = f"processed/{report['input_sha256'][:12]}_{os.path.basename(name)}"       # idempotent: same content -> same object
    storage.upload(bucket, out_name, local_out)
    _put_json(storage, bucket, f"reports/{os.path.basename(name)}.report.json", report, workdir)
    loaded = bq.load_csv(f"gs://{bucket}/{out_name}", "store_sales")
    return {"status": "loaded", "object": name, "processed": out_name, "bigquery_rows": loaded, "report": report}


def _put_json(storage, bucket, name, obj, workdir):
    p = os.path.join(workdir, os.path.basename(name)); json.dump(obj, open(p, "w"), indent=2); storage.upload(bucket, name, p)
