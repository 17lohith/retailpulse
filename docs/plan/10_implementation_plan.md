# 10 — Implementation Plan (EXECUTION, started 2026-10-23)

Order is dependency-driven. Each stage ends with: tests/verification → evidence file in `retailpulse/evidence/` → DEV_LOG entry → rubric matrix update → git commit+push.

| Stage | Deliverable | Verification (exit gate) |
|---|---|---|
| 1 | Data verification + profiling scripts (`data_prep/`) | Row counts + profile JSONs in `evidence/data_profile/` |
| 2 | Simulator L3 (`simulation/`): catalog, suppliers, 3 tenants, daily SKU sales (family totals = real), POs, receipts+batches+expiry, adjustments/write-offs, Vyapar-/Marg-style CSV exports | Reconciliation checks pass (sum of SKU sales = real family sales) |
| 3 | Hadoop jobs J1–J10 (Streaming/Python), runner, HDFS loading, timings, counters-as-cleaning-log | Outputs in HDFS; job logs in evidence |
| 4 | Mongo as single-node replica set; loaders (catalog 603K, review sample 2M, L3, MR results); indexes; CRUD transcript | Counts match source; `explain()` evidence |
| 5 | Validation: Hadoop vs pandas (and Mongo aggregation) | Comparison table, zero/explained diffs |
| 6 | Forecast + decision engine (Python worker, Mongo job queue) | Backtest metrics table vs baselines on real Favorita holdout |
| 7 | Backend API (Node/Express): auth, tenancy, CRUD, import pipeline, batches/expiry prompts, recommendations, insights | Jest/Supertest green incl. cross-tenant tests |
| 8 | Frontend (React+Vite+Bootstrap+Recharts) | Build passes; screenshots; e2e smoke |
| 9 | Docker/compose, GitHub Actions, cloud code (function, SQL, runbook) | `docker compose up` works; unit tests green |
| 10 | Reports: 3 course reports, Big Data PPT outline, paper outline, rubric matrix, README | Matrix updated |

Rules: no fabricated numbers — all metrics produced by scripts and saved; simulated data always flagged; secrets never committed.
