# Evidence Summary — every number below was produced by a script in this repo

Generated 2026-10-23. Each row names the file that holds the evidence. Nothing here is estimated by hand. **Simulated** results are labelled as such and must never be presented as evidence about real shops.

## 1. Data sources (real) — `evidence/data_profile/*.json`
| Source | Facts |
|---|---|
| Amazon Reviews 2023, Grocery & Gourmet Food — reviews (McAuley Lab) | 5,973,991,903 bytes (matches server size); **14,318,520 JSONL lines**; fields rating, title, text, asin, parent_asin, user_id, timestamp, helpful_vote, verified_purchase; 2002-11 → 2023-03 |
| …— product metadata | **603,274 products**; `store` (brand) present 97.1 %; **price present only 37.2 %** (1 price stored as text); categories depth ≥ 3 for 85.4 %; nested `details` dict varies |
| Amazon Fine Foods (Stanford SNAP mirror) | 568,454 reviews; kept as small development sample |
| Store Sales (Kaggle, Corporación Favorita) | **3,000,888 rows**, 54 stores, 33 families, 1,684 days (2013-01-01 → 2017-08-15); 31.3 % zero-sales rows; 20.4 % rows on promotion; 4 missing 25-Dec calendar days; family `"LIQUOR,WINE,BEER"` contains commas |

### Data-quality findings (the cleaning log)
From Hadoop counters (`evidence/hadoop/J1_*.log`, `J4_*.log`, loaded into `mr_jobs`): 14,318,520 records read; **1** review with invalid rating (0.0) excluded; **42** reviews with empty title+text; **1** price stored as text; **92** products with no reviews; **0** orphan reviews; 603,182 products joined with 14,318,519 reviews; 235,725,339 tokens emitted by J1.

## 2. Simulated operations layer (L3) — `evidence/data_profile/sim_report_demo-*.json`, `simulation/`
SIMULATED. Demand shape from real Favorita family sales split across SKUs by a multinomial draw — **sum of SKU demand equals the scaled real family total on every day (checked, `tests/test_sim_outputs.py`)**.
| | Demo A (single store) | Demo B (3-store chain) |
|---|---|---|
| Products (real Amazon names/brands/prices where available, template otherwise) | 600 | 1,200 |
| Visible sales rows | 228,968 | 1,466,603 |
| SKU-days with stock-out (of days with demand) | ≈ 5 % | ≈ 5 % |
| Purchase orders / batches (visible) | 3,259 / 59,779 | 9,783 / 423,793 |
Date shift +3,290 days (470 whole weeks: weekdays preserved). Last 28 days hidden as "future". Currency: USD→INR factor 33 is an assumption.

## 3. Hadoop MapReduce (Big Data rubric) — `evidence/hadoop/`, `evidence/validation/`
Hadoop 3.4.3 single node, HDFS + YARN, Hadoop Streaming with Python mappers/reducers.
| Job | Input | Output rows | Elapsed (first run, machine busy)* |
|---|---|---|---|
| J1 token frequency by sentiment | 14.3 M reviews | 57,402 (count ≥ 50) | 536 s |
| J2 per-product stats | 14.3 M reviews | 603,182 | 243 s |
| J3 monthly volume | 14.3 M reviews | 263 | 217 s |
| J4 reduce-side **join** reviews × metadata | 14.9 M records | 603,182 | 245 s |
| J4b price band × category (chained) | J4 output | 701 | 34 s |
| J5 brand ranking (chained) | J4 output | 80,350 | 32 s |
| J6 verified / helpful votes | 14.3 M reviews | 6 | 190 s |
| J7 family × month | 3.0 M sales rows | 1,848 | 36 s |
| J8 promo vs no promo | 3.0 M | 65 | 35 s |
| J9 weekday profile | 3.0 M | 609 | 40 s |
| J10 waste by family (**map-side join**, distributed cache) | 67.8 k adjustments | 115 | 26 s |
\*A clean re-run on an idle machine is in `evidence/hadoop/SUMMARY.txt`; the busy-machine run is kept in `evidence/hadoop/contended_first_run/` for transparency.

**Independent validation** (`validation/validate_jobs.py`, plain Python/pandas, 12 processes over byte ranges): **12 of 12 checks PASS, 0 mismatches** (J1 57,402 keys; J2 603,182 products incl. histograms; J3 263 months; J4 join 603,182; J4b 701; J5 80,350 brands; J6; J7 1,848; J8 65; J9 609; J10 115). J2 comparison tolerance 1e-3 relative because Hadoop wrote the mean with 4 decimals.
**Sample representativeness** (`evidence/validation/review_sample_representativeness.json`): MongoDB holds **2,002,550** reviews (14.0 %); star-rating shares differ from the full 14,318,519 by at most 0.049 percentage points.

## 4. MongoDB (NoSQL rubric) — `evidence/mongo/`
Single-node replica set (MongoDB 7.0.45 in Docker; MongoDB 8 is incompatible with kernel 7.0.0-31). Collections: `amazon_meta` 603,274 (price parsed, 1 string price cleaned); `amazon_reviews_sample` 2,002,550; `mr_results`, `mr_product_stats` 603,182, `mr_joined_products` 603,182, `mr_jobs`; operational: `tenants, users, stores, products, suppliers, batches, purchase_orders, stock_adjustments, inventory_state, sales, forecasts, recommendations, inventory_insights, import_jobs, import_errors, import_overwrites, column_mappings, batch_confirmations, stock_counts, jobs, audit_log, forecast_runs` + GridFS `raw_uploads`. Indexes on tenant/date/sku paths. Loaders: `loaders/*.py` (counts recorded in `evidence/mongo/*.json`).

## 5. Forecasting — `evidence/forecast/`
**Real data benchmark** (`favorita_metrics.md`): 1,543 store×family series, hold-out 2017-07-19…08-15, selection made on the previous 28 days.
| Model | WAPE | MAE | RMSE |
|---|---|---|---|
| **GBM (global, promo/holiday aware)** | **0.142** | 74.9 | 257.1 |
| Per-series selector | 0.148 | 78.0 | 264.6 |
| ETS (damped trend + weekly seasonality) | 0.162 | 85.5 | 288.7 |
| Seasonal average (4 weeks) — best baseline | 0.166 | 87.6 | 296.9 |
| Seasonal naive (7) | 0.174 | 91.5 | 327.7 |
| 7-day / 28-day average | 0.217 / 0.221 | | |
| Naive | 0.259 | 136.6 | 462.1 |
GBM is 14.5 % lower in error than the best baseline. **The per-series selector did *not* beat simply using GBM** — reported as found.
**Baseline cross-check:** the BigQuery SQL baseline logic, run on DuckDB, reproduces the Python baseline WAPE to < 1e-15 (`duckdb_baselines.json`).
**Simulated shop engine run** (`pipeline_demo-a.json`, `pipeline_demo-b.json`) — SIMULATED: Demo A 561 series, WAPE 0.578 vs baseline 0.604, 80 % interval covered 83.7 %; Demo B 3,402 series, WAPE 0.458 vs 0.478, coverage 82.5 %. Per-item daily demand is noisy; absolute errors are high and are shown to users as such. The pipeline is deterministic (an uploaded copy of Demo A reproduced identical scores) and a unit test proves forecasts do not change when future data changes (`tests/test_engine.py::test_no_future_leakage_into_forecasts`).

## 6. Full Stack — `evidence/tests/`, `evidence/screenshots/`
- Backend: **45 Jest/Supertest tests pass** (auth + lockout, roles, **tenant isolation**, CRUD + validation, 14 import scenarios incl. messy file / encodings / lakh digits / duplicates / undo / PDF-xls refusal, reorder→PO→receive→batches, batch questions D-018, stock counts, data export/delete).
- Python: **25 pytest tests pass** (Hadoop job logic incl. comma-in-CSV regression, engine models, no-leakage, simulator reconciliation, cloud ETL).
- Frontend: Vite build OK; Playwright captured **22 screenshots** (11 pages × desktop/phone), **0 console errors, no horizontal overflow on a 390 px phone**; wizard flow screenshots `wizard-*.png`.
- **New-owner end-to-end** (`e2e/ingest_flow.mjs`): register → items (600) → sales **20.6 MB / 228,968 rows**: preview in ≈ 4 s, commit ≈ 39 s, **100 % matched by code, rows reconcile (ok + rejected + skipped = total)** → stock (600) → learning job → Today screen: 100 order suggestions, expiry alerts correctly "not ready" (no expiry data), freshness banner "92 days old".
- Bugs found *by the tests* and fixed (see `docs/logs/TRIAL_ERROR.md`): Mongoose `strictQuery` silently turned an import-undo `deleteMany` into "delete all of the tenant's sales"; schema-less assignment not persisted; unlabeled form fields (accessibility).

## 7. Cloud rubric — what exists without an account
Docker: 3 application images + compose (`evidence/docker/compose_up.txt`: all services healthy; `/health` via nginx). CI workflow (4 jobs), inactive deploy workflow (Workload Identity placeholders), Cloud Run **function code + 6 passing tests** with fake storage/BigQuery, 5 BigQuery SQL files (BQML `ARIMA_PLUS`, baselines, dashboard views — **not executed on BigQuery**), Looker Studio spec, runbook + evidence checklist for the teammate. **Pending (needs a Google Cloud account):** bucket, deployed trigger, BigQuery tables/BQML metrics, Looker Studio dashboard, Cloud Run URL, green CI run on GitHub.

## 8. Things that are NOT claimed
No real-shop results; all stock/expiry/waste/orders are simulated. No measured savings. The Amazon data licence is not stated (cite Hou et al., 2024); Kaggle rules apply to Store Sales. Export layouts of Vyapar/Marg/GoFrugal/Tally were **not verified with real files**. Cloud steps have not been run.
