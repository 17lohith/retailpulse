# Cloud runbook (for the teammate who has a Google Cloud account)

Everything that can be built **without** a cloud account is already done and tested locally (see "What is already done"). This runbook is the
list of things that need a Google Cloud project. Follow it top to bottom and **screenshot / save the output of every step marked 📸** - those
are the evidence for the Cloud Computing rubric. Do not skip the cost guards.

> Status of the code you will run: the ETL function and its tests pass locally; the SQL files were written against documented BigQuery
> syntax and have **not** been executed on BigQuery yet. If a statement fails, fix it, note the fix in `docs/logs/TRIAL_ERROR.md`, and commit.

## 0. What is already done (no account needed)
| Rubric item | Where | Evidence |
|---|---|---|
| Docker | `backend/Dockerfile`, `frontend/Dockerfile`, `engine/Dockerfile`, `cloud/functions/etl_sales/Dockerfile`, `infra/docker-compose.yml` | `evidence/docker/compose_up.txt` |
| CI | `.github/workflows/ci.yml` | passes once the repo is pushed to GitHub (see section 7) |
| CD (inactive) | `.github/workflows/deploy.yml` | activate in section 7 |
| Serverless function + ETL | `cloud/functions/etl_sales/` (`etl.py` core, `main.py` Cloud Run wrapper) | `pytest cloud` - 6 tests, fake storage/BigQuery |
| BigQuery SQL + BQML | `cloud/sql/*.sql` | baseline half validated locally: `cloud/local_standins/duckdb_baseline.py` |
| Looker Studio spec | `cloud/looker_studio_spec.md` | build in section 6 |

## 1. Project, billing guard, APIs  📸
```bash
gcloud auth login
export PROJECT=<your-project-id>  REGION=asia-south1
gcloud config set project $PROJECT
gcloud services enable storage.googleapis.com bigquery.googleapis.com run.googleapis.com eventarc.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com iam.googleapis.com iamcredentials.googleapis.com secretmanager.googleapis.com
```
**Cost guard (do this first):** Console → Billing → Budgets & alerts → create a budget of ₹500 with alerts at 50 / 90 / 100 %. 📸
Rough expectation: everything below fits in the free tier (BigQuery 1 TiB queries + 10 GB storage per month; Cloud Run free requests) because
the dataset is ~120 MB - **verify current limits on the Google Cloud pricing pages**. Delete resources when done (section 8).

## 2. Cloud Storage landing bucket  📸
```bash
export BUCKET=${PROJECT}-retailpulse-data
gcloud storage buckets create gs://$BUCKET --location=$REGION --uniform-bucket-level-access
```
Dataset: Kaggle competition *Store Sales - Time Series Forecasting* (accept the rules on Kaggle first). `train.csv` is in `retailpulse/data/raw/store_sales/`
(not committed to git). Do **not** upload yet - the trigger comes first.

## 3. Deploy the serverless ETL function with a Storage trigger  📸
```bash
cd retailpulse/cloud/functions/etl_sales
gcloud functions deploy etl-sales --gen2 --region=$REGION --runtime=python312 --source=. --entry-point=on_upload \
  --trigger-event-filters="type=google.cloud.storage.object.v1.finalized" --trigger-event-filters="bucket=$BUCKET" \
  --memory=1Gi --timeout=540s --set-env-vars=BQ_DATASET=retailpulse
# the function's service account needs: Storage Object Admin on the bucket, BigQuery Data Editor + Job User on the project
```
Then create the dataset/table (or let the function do it): run `cloud/sql/01_dataset_and_tables.sql` in the BigQuery console after replacing `${PROJECT}`.

Test the trigger: 📸 (upload, then open **Logs Explorer**, filter `resource.labels.service_name="etl-sales"`)
```bash
gcloud storage cp retailpulse/data/raw/store_sales/train.csv gs://$BUCKET/raw/train.csv
gcloud storage ls gs://$BUCKET/processed/ gs://$BUCKET/reports/      # cleaned file + JSON data-quality report
```
Expected: log line `etl_sales finished` with `rows_in: 3000888`; `store_sales` table has ~3,000,888 rows 📸 (`SELECT COUNT(*) FROM retailpulse.store_sales`).
Also test failure handling: upload a CSV with missing columns and show the `reports/*.rejected.json` file. 📸

## 4. Views, BigQuery ML, comparison  📸
Run in order in the BigQuery console (replace `${PROJECT}`): `02_series_views.sql`, `03_bqml_arima_plus.sql`, `04_forecast_vs_baselines.sql`.
Save a screenshot of `SELECT * FROM retailpulse.metrics_comparison`. **Report the numbers as they come out - even if ARIMA_PLUS loses to the simple
baselines.** Compare with `evidence/forecast/favorita_metrics.json` (local models) and `evidence/forecast/duckdb_baselines.json` (baseline targets).

## 5. Run the app on Cloud Run (optional but earns the "deployment" evidence)
Needs a MongoDB the app can reach: create a free MongoDB Atlas M0 cluster (512 MB; **it will not hold the 2M-review sample**, only the shop data) and store its URI:
```bash
echo -n "mongodb+srv://..." | gcloud secrets create retailpulse-mongo-uri --data-file=-
echo -n "$(openssl rand -hex 32)" | gcloud secrets create retailpulse-jwt --data-file=-
gcloud artifacts repositories create retailpulse --repository-format=docker --location=$REGION
```
Then use the GitHub Actions deploy workflow (section 7). Set the web container env `API_UPSTREAM` to the API's `https://...run.app` URL.

## 6. Looker Studio dashboard  📸
Follow `cloud/looker_studio_spec.md` (data source = the `v_dash_*` views from `05_dashboard_views.sql`). Share a view-only link. Take screenshots with filters applied.

## 7. GitHub: push, CI, CD  📸
```bash
git remote -v     # the repo already exists: github.com/allenjohn006/retailpulse (private)
```
CI runs automatically on push (Actions tab 📸 - all four jobs green). For CD configure **Workload Identity Federation** (no JSON keys):
repository variables `GCP_PROJECT_ID`, `GCP_ARTIFACT_REPO`; secrets `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`. Then Actions → *Deploy to Cloud Run* → Run workflow. 📸 the successful run and the Cloud Run URL.

## 8. Teardown (stops all costs)
```bash
gcloud functions delete etl-sales --gen2 --region=$REGION
gcloud run services delete retailpulse-api retailpulse-web --region=$REGION
bq rm -r -f -d $PROJECT:retailpulse
gcloud storage rm -r gs://$BUCKET
```

## Evidence checklist (save under `retailpulse/evidence/cloud/`)
- [ ] Budget alert screen
- [ ] Bucket with `raw/`, `processed/`, `reports/`
- [ ] Function deployed + trigger configuration
- [ ] Logs showing an upload triggering the function; rejected-file log
- [ ] BigQuery table schema + row count; partition/cluster settings
- [ ] `ML.EVALUATE` output and `metrics_comparison` table
- [ ] Looker Studio dashboard (2+ screenshots with filters) + share link
- [ ] GitHub Actions CI run (green) and deploy run
- [ ] Cloud Run service URLs and a working login page
- [ ] Teardown commands run
