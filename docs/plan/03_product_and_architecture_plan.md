# 03 — Product & Architecture Plan (proposed, nothing built)

## 1. Product statement
**RetailPulse** — a POS-agnostic SaaS "intelligence layer" for grocery retailers: upload the sales/stock exports you already have → get sales insights, demand forecasts, and **explainable** reorder/expiry suggestions the owner can approve or edit.

Segments: **Starter** (single owner-run store), **Growth** (small supermarket / purchasing manager), **Chain** (multi-store, phase 2). Hypotheses H1–H6 live in Report 1 §8 and must be validated, not assumed.

## 2. Responsibility split (matches your instruction)
| Concern | Technology | Rule |
|---|---|---|
| All storage + CRUD (insert/delete/update/query) | **MongoDB only** | No other operational datastore for app data |
| Batch data processing | **Hadoop (HDFS + MapReduce / Streaming)** | Reads exported files, writes result files; a loader (PyMongo) puts results into Mongo |
| Web app | React + Bootstrap + Node/Express | Reads Mongo only |
| Cloud analytics module | GCS, Cloud Run functions, BigQuery, BQML, Looker Studio, Docker, GitHub Actions | Separate sales-forecast pipeline (Store Sales data); allowed to hold analytical copies — flag this explicitly in the report since BigQuery is a second store (D-005) |

## 3. Logical architecture
```
 CSV/Excel upload ──► Express API ──► MongoDB (tenants, products, sales, stock, batches, recommendations, mr_results)
                                         │  export
                                         ▼
                              HDFS ──► Hadoop Streaming jobs (python mapper/reducer)
                                         │ output files
                                         ▼
                                  PyMongo loader ──► mr_results collection ──► React dashboards
 Store Sales CSV ─► GCS bucket ─(event)─► Cloud Run fn (validate/ETL) ─► BigQuery ─► BQML ARIMA_PLUS ─► Looker Studio
 GitHub push ─► GitHub Actions (test, docker build, deploy to Cloud Run)
```

## 4. Data model sketch (MongoDB)
`tenants`, `users`, `products(sku, name, category, cost, price, shelfLifeDays)`, `sales(date, sku, qty, revenue, storeId, tenantId)`, `stock_snapshots`, `batches(sku, qty, expiry)` *(synthetic for demo)*, `purchase_orders`, `forecasts`, `recommendations(status: suggested/approved/edited/rejected, reasons[])`, `reviews`, `mr_results(job, key, value, runId)`, `import_logs`, `audit_log`. Every doc carries `tenantId`; indexes on `(tenantId, date, sku)`.

## 5. Feature priorities
- **P0** CRUD + CSV import with validation, dashboards, auth, Hadoop jobs → Mongo, GCS→function→BigQuery→BQML→Looker, Docker, CI/CD.
- **P1** Baseline vs model forecast, rule-based reorder with reasons, slow-mover list, data-quality report.
- **P2** NL assistant, budget-constrained purchasing, multi-store transfers, real expiry optimisation, WhatsApp summaries, regional languages.

## 6. Forecast & reorder logic (transparent first)
Baselines: naive, 7-day moving average, seasonal naive. Model: BQML ARIMA_PLUS (cloud) and a simple Python model in-app. Metrics: MAE, RMSE, sMAPE/MASE on chronological hold-out. Reorder = `forecast(leadtime+review period) + safety stock − on-hand − incoming`, rounded to pack size; every output stores its inputs (explainability).

## 7. Hadoop jobs (Big Data rubric)
1. Token frequency in review text (stop-words documented). 2. Per-product count / mean rating / score histogram. 3. Monthly review volume. 4. *Optional (Q-004)* daily/category sales totals on Store Sales. Validation: compare each job to a Python/pandas and a Mongo aggregation on the same sample; log differences.

## 8. SaaS-readiness checklist (for the startup framing, post-rubric)
Auth + tenant isolation tests, rate limiting, backups, audit log, DPDP-aware retention/erasure, pricing tiers & usage metering, onboarding wizard, status page. Mark these "designed, not built" in the academic report unless actually done.

## 9. Phases (from Report 2, with gates)
0 Confirm scope (Q-001…Q-006) → 1 Data prep → 2 Full-stack foundation → 3 Hadoop pipeline → 4 Cloud pipeline → 5 Forecasting → 6 Deployment → 7 Reports/PPT/certs. Durations deliberately **not** set until deadline is known.
