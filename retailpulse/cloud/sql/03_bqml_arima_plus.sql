-- BigQuery ML time-series forecast. STATUS: NOT yet executed. Training window ends 28 days before the last date; the last 28 days are the hold-out.
DECLARE last_day DATE DEFAULT (SELECT MAX(date) FROM `${PROJECT}.retailpulse.store_sales`);
DECLARE train_end DATE DEFAULT DATE_SUB(last_day, INTERVAL 28 DAY);

CREATE OR REPLACE MODEL `${PROJECT}.retailpulse.arima_store_family`
OPTIONS (
  model_type = 'ARIMA_PLUS',
  time_series_timestamp_col = 'date',
  time_series_data_col = 'sales',
  time_series_id_col = 'series_id',
  horizon = 28,
  auto_arima = TRUE,
  data_frequency = 'DAILY',
  holiday_region = 'EC',                 -- Ecuador national holidays
  decompose_time_series = TRUE
) AS
SELECT date, series_id, sales
FROM `${PROJECT}.retailpulse.v_series`
WHERE date <= train_end AND series_id IN (SELECT series_id FROM `${PROJECT}.retailpulse.v_eligible_series`);

-- Model quality as reported by BigQuery ML (in-sample) - kept for the report, NOT used as the headline metric.
SELECT * FROM ML.EVALUATE(MODEL `${PROJECT}.retailpulse.arima_store_family`);
