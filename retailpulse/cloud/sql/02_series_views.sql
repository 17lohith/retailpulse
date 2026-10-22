-- One row per store x family x day, plus a series id used by BigQuery ML.
CREATE OR REPLACE VIEW `${PROJECT}.retailpulse.v_series` AS
SELECT date, store_nbr, family, CONCAT(CAST(store_nbr AS STRING), '|', family) AS series_id, sales, onpromotion, is_promo
FROM `${PROJECT}.retailpulse.store_sales`;

-- Same filter the Python benchmark uses: series with sales in the last 365 days before the end, and > 365 days with sales before the hold-out.
CREATE OR REPLACE VIEW `${PROJECT}.retailpulse.v_eligible_series` AS
WITH bounds AS (SELECT MAX(date) AS last_day FROM `${PROJECT}.retailpulse.store_sales`)
SELECT series_id FROM `${PROJECT}.retailpulse.v_series`, bounds
GROUP BY series_id
HAVING SUM(IF(date > DATE_SUB(last_day, INTERVAL 365 DAY), sales, 0)) > 0
   AND COUNTIF(date <= DATE_SUB(last_day, INTERVAL 28 DAY) AND sales > 0) > 365;
