import json, os, sys
import pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import etl

GOOD = "id,date,store_nbr,family,sales,onpromotion\n0,2017-01-02,1,DAIRY,10.5,0\n1,2017-01-02,1,BREAD/BAKERY,3,2\n2,2017-01-03,2,\"LIQUOR,WINE,BEER\",0,0\n"

def write(tmp_path, text, name="train.csv"):
    p = tmp_path / name; p.write_text(text); return str(p)

def test_clean_file_passes_through_with_derived_columns(tmp_path):
    rep = etl.process_csv(write(tmp_path, GOOD), str(tmp_path / "out.csv"))
    assert rep["rows_in"] == 3 and rep["rows_out"] == 3 and rep["dropped"] == {} and rep["date_min"] == "2017-01-02"
    lines = (tmp_path / "out.csv").read_text().splitlines(); assert lines[0].startswith("date,store_nbr,family") and "LIQUOR,WINE,BEER" in lines[3].replace('"', "")
    assert lines[1].split(",")[-4:] == ["0", "1", "2017", "1"]            # first sorted row is BREAD/BAKERY: Monday=0, January, 2017, on promotion

def test_every_dropped_row_is_counted_by_reason(tmp_path):
    bad = GOOD + "3,2017-13-45,1,DAIRY,1,0\n4,2017-01-04,1,DAIRY,-5,0\n5,2017-01-04,1,,5,0\n6,2017-01-04,x,DAIRY,5,0\n7,2017-01-04,1,DAIRY,abc,0\n8,2017-01-04,1,DAIRY,5,-1\n9,2017-01-02,1,DAIRY,99,0\n"
    rep = etl.process_csv(write(tmp_path, bad), str(tmp_path / "o.csv"))
    assert rep["dropped"] == {"invalid_date": 1, "negative_sales": 1, "missing_family": 1, "invalid_store": 1, "invalid_sales": 1, "negative_promo": 1, "duplicate_key_replaced": 1}
    assert rep["rows_in"] == 10 and rep["rows_out"] == 3 and rep["reconciles"] is True
    assert "99.0" in (tmp_path / "o.csv").read_text()                    # the later duplicate wins

def test_missing_column_rejects_the_whole_file_with_a_clear_message(tmp_path):
    with pytest.raises(etl.ETLError, match="Missing required column"): etl.process_csv(write(tmp_path, "date,sales\n2017-01-01,1\n"), str(tmp_path / "o.csv"))
    with pytest.raises(etl.ETLError, match="empty"): etl.process_csv(write(tmp_path, ""), str(tmp_path / "o.csv"))

class FakeStorage:
    def __init__(self, files): self.files, self.up = files, {}
    def download(self, b, n, dest): open(dest, "w").write(self.files[n])
    def upload(self, b, n, src): self.up[n] = open(src).read()
class FakeBq:
    def __init__(self): self.calls = []
    def load_csv(self, uri, table): self.calls.append((uri, table)); return 3

def test_event_handler_loads_valid_upload(tmp_path):
    st, bq = FakeStorage({"raw/train.csv": GOOD}), FakeBq()
    r = etl.handle_event({"bucket": "b", "name": "raw/train.csv"}, st, bq, str(tmp_path))
    assert r["status"] == "loaded" and r["bigquery_rows"] == 3 and bq.calls[0][0].startswith("gs://b/processed/") and "reports/train.csv.report.json" in st.up
    assert json.loads(st.up["reports/train.csv.report.json"])["rows_out"] == 3

def test_event_handler_ignores_other_objects_and_reports_bad_files(tmp_path):
    st, bq = FakeStorage({"raw/bad.csv": "a,b\n1,2\n"}), FakeBq()
    assert etl.handle_event({"bucket": "b", "name": "processed/x.csv"}, st, bq, str(tmp_path))["status"] == "ignored"
    r = etl.handle_event({"bucket": "b", "name": "raw/bad.csv"}, st, bq, str(tmp_path))
    assert r["status"] == "rejected" and "Missing required column" in r["error"] and not bq.calls and "reports/bad.csv.rejected.json" in st.up

def test_same_content_gives_same_processed_name(tmp_path):
    a = etl.handle_event({"bucket": "b", "name": "raw/t1.csv"}, FakeStorage({"raw/t1.csv": GOOD}), FakeBq(), str(tmp_path))
    b = etl.handle_event({"bucket": "b", "name": "raw/t1.csv"}, FakeStorage({"raw/t1.csv": GOOD}), FakeBq(), str(tmp_path))
    assert a["processed"] == b["processed"]
