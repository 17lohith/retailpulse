-- Views behind the Looker Studio dashboard (connect Looker Studio -> BigQuery -> these views).
CREATE OR REPLACE VIEW `${PROJECT}.retailpulse.v_dash_daily` AS
SELECT date, family, store_nbr, SUM(sales) AS units, SUM(IF(is_promo = 1, sales, 0)) AS promo_units, COUNT(*) AS series_rows
FROM `${PROJECT}.retailpulse.store_sales` GROUP BY date, family, store_nbr;

CREATE OR REPLACE VIEW `${PROJECT}.retailpulse.v_dash_forecast` AS
SELECT b.date, b.series_id, SPLIT(b.series_id, '|')[OFFSET(1)] AS family, CAST(SPLIT(b.series_id, '|')[OFFSET(0)] AS INT64) AS store_nbr, b.actual, f.pred AS bqml_forecast, b.seasonal_avg4 AS baseline
FROM `${PROJECT}.retailpulse.forecast_baselines` b JOIN `${PROJECT}.retailpulse.forecast_arima` f USING (series_id, date);

CREATE OR REPLACE VIEW `${PROJECT}.retailpulse.v_dash_metrics` AS SELECT * FROM `${PROJECT}.retailpulse.metrics_comparison`;

CREATE OR REPLACE VIEW `${PROJECT}.retailpulse.v_dash_promo` AS
SELECT family, AVG(IF(is_promo = 1, sales, NULL)) AS mean_promo, AVG(IF(is_promo = 0, sales, NULL)) AS mean_no_promo FROM `${PROJECT}.retailpulse.store_sales` GROUP BY family;
