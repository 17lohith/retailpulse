# Demo scripts (10 minutes each) — one product, three subjects

Prerequisites: stack running (`infra/stack.sh start`, API on :4000, `npm run dev` or Docker web on :8080). Use the **Single store** demo button on the sign-in page.

## Full Stack Development
1. **Sign in** with a demo shop → Today screen. Point out: freshness banner, KPIs, "What to order today" with reasons, batch questions, chart takeaway line. (Data comes from MongoDB queries - not hard-coded.)
2. **Products** → add an item (see validation messages for a bad price), edit it, search, delete it; try deleting an item with sales (blocked, offers "hide").
3. **Orders** → edit a quantity, Approve, Skip with a reason → *Create order* → copy the supplier message → *Placed orders* → *Record delivery* (enter damaged units, leave one fresh item without expiry) → **Stock → Needs expiry date**.
4. **Bring in data** → upload `retailpulse/e2e/fixtures/messy_sales.csv`: columns guessed, title lines skipped, preview with rejected rows (download "rows to fix"), unrecognised items, Import, then **Undo**.
5. **Roles**: sign in as `staff@demo-a.retailpulse.test` - no costs/profit, cannot approve or upload. **Settings → Activity log** shows who did what.
6. Show MongoDB (`mongosh`): `db.sales.countDocuments({tenantId:'demo-a'})`, a `recommendations` document, the `audit_log`. Explain frontend / API / worker / database roles. Run `npm test` (45 passing).

## Big Data Tools & Techniques
1. Data: 14.3 M reviews (5.97 GB JSONL) + 603 K product records + 3.0 M sales rows. Show `evidence/data_profile/*.json` and the cleaning counters (1 bad rating, 42 empty reviews, 1 string price, 92 products without reviews).
2. `hdfs dfs -ls -h /retailpulse/raw`; open the NameNode UI (`:9870`) and YARN UI (`:8088`).
3. Walk through `j2_mapper.py` / `j2_reducer.py` (emit, shuffle, reduce), a combiner (`sum_reducer.py`), the **reduce-side join** (J4) and **map-side join** (J10, distributed cache).
4. Run a job live (`hadoop/scripts/run_job.sh J3_monthly_volume …`, ~3 min) or show its log + counters (14,318,520 map input records).
5. Show validation: `python validation/validate_jobs.py` output - 12/12 PASS against independent pandas/plain-Python computations.
6. MongoDB: the loaded collections and counts, indexes, a query with `explain()`, insert/update/delete through the API, results shown in the app (**Insights**). 
7. Insights + limits: frequency ≠ sentiment, promo effect is association, price known for 37 % of products, reviews ≠ sales. Mention the 2 M-review sample (representative within 0.05 pp) and that the full set is processed by Hadoop.

## Cloud Computing for Data Analytics
1. Problem: food-retail demand forecasting; dataset Store Sales (Kaggle).
2. Architecture diagram (README). `docker compose up` → show all four services healthy and `/health`.
3. Dockerfiles, `.github/workflows/ci.yml` (4 jobs) - show a green run once pushed; `deploy.yml` (Workload Identity, inactive).
4. Cloud function: `etl.py` core, `main.py` trigger wrapper, run `pytest cloud` (fake GCS/BigQuery events, bad-file rejection, idempotent output names).
5. *(Teammate evidence)* bucket upload → function logs → BigQuery row count → `ML.EVALUATE` and `metrics_comparison` → Looker Studio dashboard with filters.
6. Results to explain: GBM 0.142 vs best baseline 0.166 WAPE on a 28-day hold-out (real data), selector 0.148 - honest note; interval coverage; cost guards and teardown.
