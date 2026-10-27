"""Cloud Run function (Eventarc trigger: Cloud Storage 'object finalized'). Thin wrapper over etl.handle_event."""
import json, logging, os
import functions_framework
from etl import handle_event


class GcsStorage:
    def __init__(self):
        from google.cloud import storage
        self.c = storage.Client()
    def download(self, bucket, name, dest): self.c.bucket(bucket).blob(name).download_to_filename(dest)
    def upload(self, bucket, name, src): self.c.bucket(bucket).blob(name).upload_from_filename(src)


class Bq:
    def __init__(self, dataset=None):
        from google.cloud import bigquery
        self.dataset = dataset or os.environ.get("BQ_DATASET", "retailpulse")
        self.bq, self.mod = bigquery.Client(), bigquery
    def load_csv(self, uri, table):
        cfg = self.mod.LoadJobConfig(source_format=self.mod.SourceFormat.CSV, skip_leading_rows=1, write_disposition="WRITE_TRUNCATE", autodetect=False,
                                     schema=[self.mod.SchemaField("date", "DATE"), self.mod.SchemaField("store_nbr", "INT64"), self.mod.SchemaField("family", "STRING"), self.mod.SchemaField("sales", "FLOAT64"),
                                             self.mod.SchemaField("onpromotion", "INT64"), self.mod.SchemaField("day_of_week", "INT64"), self.mod.SchemaField("month", "INT64"),
                                             self.mod.SchemaField("year", "INT64"), self.mod.SchemaField("is_promo", "INT64")],
                                     time_partitioning=self.mod.TimePartitioning(field="date"), clustering_fields=["family", "store_nbr"])
        job = self.bq.load_table_from_uri(uri, f"{self.bq.project}.{self.dataset}.{table}", job_config=cfg); job.result()
        return self.bq.get_table(f"{self.bq.project}.{self.dataset}.{table}").num_rows


@functions_framework.cloud_event
def on_upload(cloud_event):
    result = handle_event(cloud_event.data, GcsStorage(), Bq())
    logging.warning(json.dumps({"severity": "INFO", "message": "etl_sales finished", **{k: v for k, v in result.items() if k != "report"}, "report": result.get("report")}))
