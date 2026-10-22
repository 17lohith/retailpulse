# cloud/

Cloud-track code. Nothing here needs a cloud account to read, test or review; **running it on Google Cloud is the teammate's task** (`RUNBOOK_FOR_TEAMMATE.md`).

- `functions/etl_sales/` - Cloud Run function (Storage trigger) + pure-Python ETL core + tests (`pytest cloud`)
- `sql/` - BigQuery dataset/tables, series views, BigQuery ML `ARIMA_PLUS`, forecast-vs-baselines, dashboard views
- `local_standins/` - local replacements used only to validate logic before the cloud run (DuckDB for BigQuery SQL). **Never cite these as cloud evidence.**
- `looker_studio_spec.md` - dashboard design
