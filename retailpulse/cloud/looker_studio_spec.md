# Looker Studio dashboard specification ("RetailPulse - Grocery Demand")

Data sources (BigQuery connector, project `${PROJECT}`, dataset `retailpulse`): `v_dash_daily`, `v_dash_forecast`, `v_dash_metrics`, `v_dash_promo`.

Controls (apply to all pages): **date range** (default: last 90 days), **Category** (`family`, multi-select), **Store** (`store_nbr`), **Promotion** (promo / no promo - page 3 only).

| Page | Charts (each with a one-line takeaway in the title) |
|---|---|
| 1. Overview | Scorecards: units sold, categories, stores, days covered · Time series: units per day (7-day average overlay) · Bar: top 10 categories by units · Heat table: weekday × month |
| 2. Forecast vs actual | Time series: actual vs BQML forecast vs baseline for a selected store+category (28-day hold-out) · Table: worst 10 series by absolute error · Scorecard: WAPE of selected series |
| 3. Promotions | Bar: mean units per day promo vs no promo by category · Note: *association, not proven lift* |
| 4. Model comparison | Bar: WAPE per model from `v_dash_metrics` (naive, seasonal naive, seasonal 4-week average, BQML ARIMA_PLUS) · Table with MAE, RMSE · Text: how the hold-out was set up (last 28 days; model trained before) |

Design rules: colour-blind-safe palette (teal #0f766e primary, amber #f59e0b for forecasts, grey for baselines), no 3-D, no dual axes, titles state the takeaway, sources and caveats in a footer text box.
