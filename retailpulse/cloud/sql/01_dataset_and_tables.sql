-- RetailPulse - BigQuery setup. STATUS: written against documented BigQuery syntax; NOT yet executed (no cloud account).
-- Replace ${PROJECT} / ${DATASET} (default dataset: retailpulse). The ETL function creates/loads store_sales automatically;
-- this file is for manual (re)creation and documents the schema.
CREATE SCHEMA IF NOT EXISTS `${PROJECT}.retailpulse` OPTIONS (location = 'asia-south1');

CREATE TABLE IF NOT EXISTS `${PROJECT}.retailpulse.store_sales` (
  date        DATE    NOT NULL,
  store_nbr   INT64   NOT NULL,
  family      STRING  NOT NULL,
  sales       FLOAT64 NOT NULL,
  onpromotion INT64,
  day_of_week INT64,        -- Monday = 0 (same convention as the Python ETL)
  month       INT64,
  year        INT64,
  is_promo    INT64
)
PARTITION BY date
CLUSTER BY family, store_nbr
OPTIONS (description = 'Cleaned Corporacion Favorita daily sales (Kaggle: store-sales-time-series-forecasting)');
