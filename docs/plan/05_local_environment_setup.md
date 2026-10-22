# 05 — Local Environment Setup (Ubuntu 26.04, no cloud)

| Tool | Needed for | Status 2026-10-22 | How |
|---|---|---|---|
| Node 22 / npm | Full Stack | installed | — |
| Java 17 (apt) | Hadoop | INSTALLED 17.0.20.1 | — |
| Hadoop 3.x single-node (pseudo-distributed) + Hadoop Streaming | Big Data | MISSING | download Apache tarball to `~/tools`, user-level; needs SSH to localhost or run in local mode first |
| MongoDB Community | Full Stack + Big Data storage | MISSING | official apt repo may not support 26.04 yet → fallback: Docker `mongo` image, or tarball |
| Docker + Compose | Cloud rubric (Dockerfile), Mongo | MISSING | `sudo apt install docker.io docker-compose-v2`, `sudo usermod -aG docker $USER`, re-login |
| Python venv, pip | loaders, validation | pip missing | `sudo apt install python3-venv python3-pip` or use `uv` |
| GitHub Actions workflow file | Cloud CI/CD | can be authored locally, test with `act` | file only until a repo exists |
| gcloud / cloud services | Cloud rubric | DEFERRED | teammate; keep scripts parameterised, no secrets in repo |

Local stand-ins before cloud exists: MinIO or a folder for "bucket", a local file-watcher for the "trigger", DuckDB/SQLite for BigQuery-style SQL, Python/Prophet-style forecasts — **label them as local stand-ins, never as the cloud evidence.**

Order: Docker → Mongo → Java → Hadoop (word-count smoke test) → Python venv → project skeleton. Log every command/error in DEV_LOG and TRIAL_ERROR.

## Status update 2026-10-22 (end of day)
INSTALLED & VERIFIED: Docker 29.1.3, JDK 17, Hadoop 3.4.3 (streaming smoke test passed), MongoDB 7.0.45 (container), Python 3.12 venv + libs, uv, Node 22. Still to do: Kaggle token + dataset download, backend/frontend scaffolds, Dockerfile, GitHub Actions file.
