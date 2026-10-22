# 04 — Rubric Traceability Matrix (updated 2026-10-23)

Status: `DONE` (built + evidence) · `DONE-LOCAL` (built and tested locally; cloud execution pending) · `PENDING-CLOUD` · `OUT` (handled by user). Evidence paths are relative to `retailpulse/`.

## Full Stack Development (23DC2032) — 30 project (+10 cert: user)
| Criterion | Implementation | Evidence | Status |
|---|---|---|---|
| Front-end design | React 18 + Vite + Bootstrap 5 + Recharts; 11 responsive pages, accessible labels, takeaway-titled charts | `evidence/screenshots/*.png` (22 + wizard), report.json: 0 console errors, no phone overflow | DONE |
| Back-end integration | Node 22 / Express / Mongoose / MongoDB 7 replica set; JWT + roles + tenant isolation; GridFS; Python worker via Mongo job queue | `backend/`, `evidence/tests/backend_jest_verbose.txt` (45 tests) | DONE |
| Functionality | CRUD (products, suppliers), CSV/XLSX import wizard with undo, quick sale entry, reorder→PO→receive, batch questions, stock counts, dashboards, forecasts, insights | `e2e/ingest_flow.mjs` run; tests | DONE |
| Presentation | Demo script below; demo shops with one-click login | `docs/report/DEMO_SCRIPTS.md` (to write with reports) | READY |
| Innovation | Explainable reorder reasons, honest forecast scoring, owner-confirmed batches (D-018), data-quality page, automatic learning after import | EVIDENCE_SUMMARY §5–6 | DONE |
| Documentation | docs/ tree, API in code, decisions & trial/error logs | `docs/` | DONE (reports pending) |

## Big Data Tools & Techniques (23DC2044) — 30 project (+10 cert: user)
| Criterion | Implementation | Evidence | Status |
|---|---|---|---|
| Dataset & MapReduce (10) | Amazon Reviews 2023 grocery (14.3 M reviews, 603 K products) + Store Sales (3.0 M rows); **10 Hadoop MapReduce jobs** (incl. reduce-side join, map-side join, chained jobs, combiners, counters as cleaning log) | `evidence/hadoop/`, `hadoop/streaming/`, `data/clean/mr/` | DONE |
| NoSQL integration (5) | MongoDB: bulk insert 603 K + 2.0 M + results; indexes; CRUD via API; GridFS; replica set | `evidence/mongo/*.json`, backend tests | DONE |
| Result (10) | Independent recomputation 12/12 PASS; sample representativeness; insights (words, price bands, brands, promo, weekday) shown in UI | `evidence/validation/` | DONE |
| Report (5) + PPT 7–10 slides | Outline + all numbers ready | `docs/report/EVIDENCE_SUMMARY.md` | PENDING (user asks) |

## Cloud Computing for Data Analytics (23DC2043) — 25 project (+15 cert: user)
| Criterion | Implementation | Evidence | Status |
|---|---|---|---|
| Problem / dataset / cloud visualisation (5) | Food-retail demand; Store Sales; Looker Studio spec + views | `cloud/looker_studio_spec.md` | DONE-LOCAL / PENDING-CLOUD |
| Architecture & pipeline (10) | **Docker** ✔ (3 images + compose verified) · **CI** workflow ✔ (4 jobs) · **serverless function + ETL** ✔ code + 6 tests · CD workflow (inactive) · bucket/trigger/BigQuery load ✘ needs account | `evidence/docker/compose_up.txt`, `.github/workflows/`, `cloud/functions/` | DONE-LOCAL / PENDING-CLOUD |
| Managed ML results (5) | BQML ARIMA_PLUS SQL written; local models + baselines produce target numbers (GBM 0.142, baseline 0.166 WAPE) | `cloud/sql/`, `evidence/forecast/` | PENDING-CLOUD |
| Report (5) | Runbook + evidence checklist + facts | `cloud/RUNBOOK_FOR_TEAMMATE.md` | PENDING |

## Remaining open items
1. Teammate executes the cloud runbook. 2. Reports + Big Data PPT (user to request). 3. Real shop export samples (U-1/U-3) to verify templates. 4. Optional: public GitHub repo / README polish.
