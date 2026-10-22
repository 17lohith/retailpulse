-- Honest comparison on the 28-day hold-out: BQML ARIMA_PLUS vs simple baselines. STATUS: NOT yet executed on BigQuery.
-- The baseline logic is the SAME as in local_standins/duckdb_baseline.py, which was executed locally.
DECLARE last_day DATE DEFAULT (SELECT MAX(date) FROM `${PROJECT}.retailpulse.store_sales`);
DECLARE train_end DATE DEFAULT DATE_SUB(last_day, INTERVAL 28 DAY);

CREATE OR REPLACE TABLE `${PROJECT}.retailpulse.forecast_arima` AS
SELECT series_id, DATE(forecast_timestamp) AS date, GREATEST(forecast_value, 0) AS pred
FROM ML.FORECAST(MODEL `${PROJECT}.retailpulse.arima_store_family`, STRUCT(28 AS horizon, 0.8 AS confidence_level));

CREATE OR REPLACE TABLE `${PROJECT}.retailpulse.forecast_baselines` AS
WITH h AS (SELECT * FROM `${PROJECT}.retailpulse.v_series` WHERE series_id IN (SELECT series_id FROM `${PROJECT}.retailpulse.v_eligible_series`)),
test AS (SELECT series_id, date, sales AS actual FROM h WHERE date > train_end),
naive AS (SELECT series_id, ARRAY_AGG(sales ORDER BY date DESC LIMIT 1)[OFFSET(0)] AS v FROM h WHERE date <= train_end GROUP BY series_id),
snaive AS (SELECT t.series_id, t.date, (SELECT sales FROM h WHERE h.series_id = t.series_id AND h.date = DATE_SUB(train_end, INTERVAL 6 - MOD(DATE_DIFF(t.date, train_end, DAY) - 1, 7) DAY)) AS v FROM test t),
sa4 AS (SELECT t.series_id, t.date, (SELECT AVG(sales) FROM h WHERE h.series_id = t.series_id AND h.date <= train_end AND h.date > DATE_SUB(train_end, INTERVAL 28 DAY)
          AND MOD(DATE_DIFF(h.date, train_end, DAY) - MOD(DATE_DIFF(t.date, train_end, DAY) - 1, 7) - 1, 7) = 0) AS v FROM test t)
SELECT t.series_id, t.date, t.actual, n.v AS naive, s.v AS snaive7, a.v AS seasonal_avg4
FROM test t JOIN naive n USING (series_id) JOIN snaive s USING (series_id, date) JOIN sa4 a USING (series_id, date);

CREATE OR REPLACE TABLE `${PROJECT}.retailpulse.metrics_comparison` AS
WITH j AS (SELECT b.*, f.pred AS arima_plus FROM `${PROJECT}.retailpulse.forecast_baselines` b JOIN `${PROJECT}.retailpulse.forecast_arima` f USING (series_id, date))
SELECT model, SAFE_DIVIDE(SUM(ABS(p - actual)), SUM(actual)) AS wape, AVG(ABS(p - actual)) AS mae, SQRT(AVG(POW(p - actual, 2))) AS rmse, COUNT(DISTINCT series_id) AS series
FROM (SELECT actual, series_id, 'naive' AS model, naive AS p FROM j UNION ALL SELECT actual, series_id, 'seasonal_naive_7', snaive7 FROM j
      UNION ALL SELECT actual, series_id, 'seasonal_avg_4wk', seasonal_avg4 FROM j UNION ALL SELECT actual, series_id, 'bqml_arima_plus', arima_plus FROM j)
GROUP BY model ORDER BY wape;
