# Development & Research Log (chronological, append-only)

**Rules:** newest entry at the bottom. One entry per working session or significant event. Never edit old entries — add a correction entry. Record failures as carefully as successes; they become the "Challenges" section of the report/paper.

**Entry template**
```
## YYYY-MM-DD HH:MM — Short title
- Goal:
- Actions (commands run, files changed):
- Result / output (paste key lines):
- Problems & how resolved (also copy to TRIAL_ERROR.md):
- Decisions made (also copy to DECISIONS.md):
- Evidence saved (path):
- Rubric lines affected:
- Next step:
```

---

## 2026-10-22 — Project kickoff: context analysis & research (no building)
- **Goal:** understand supplied documents, research market, assess feasibility, set up documentation system.
- **Actions:** Extracted text from `RetailPulse_Product_Concept_Report.docx` (Report 1: product/problem) and `RetailPulse_Three_Subject_Rubric_Alignment_Report.docx` (Report 2: rubrics for 23DC2032 Full Stack, 23DC2044 Big Data, 23DC2043 Cloud). Ran 11 web searches (pricing of GoFrugal/Marg/Vyapar, enterprise forecasters, kirana market data, competitor reviews, Hadoop–Mongo connector status, GCP free tier, Atlas M0, DPDP Act). Created `docs/` tree.
- **Result:**
  - Report 2 already contains a full rubric-to-project mapping; this work builds on it rather than replacing it.
  - **Premise challenged:** Indian incumbents are cheap (Vyapar ≈ ₹3.4k/yr; Marg ≈ ₹8–26k one-time; GoFrugal ≈ ₹9–18k/yr), so "existing products are too expensive for small stores" is not supported. The enterprise forecasting tier is expensive. See research/01.
  - **Technical finding:** mongo-hadoop connector is archived/unmaintained → Hadoop↔Mongo must go through files + PyMongo loader.
  - **Conflict noted:** Report 1 targets independents and excludes big chains from v1; user now wants big companies too → handled as phase-2 tier (D-004).
- **Problems:** `pandoc`/`libreoffice` not installed → extracted docx text via Python `zipfile` + regex on `word/document.xml`. Search tool returned thin results for Blue Yonder pricing and genuine user complaints (logged as research gaps).
- **Decisions:** D-001…D-005 (see DECISIONS.md).
- **Evidence saved:** `docs/research/*`.
- **Rubric lines affected:** planning only.
- **Next step:** user answers OPEN_QUESTIONS (deadline, team size, instructor confirmation, cloud account); then Phase 0/1.

## 2026-10-22 — User answers & environment audit
- **Goal:** record answers to Q-001…Q-007; check laptop readiness.
- **Result:** Decisions D-008…D-012 logged. Audit: Ubuntu 26.04, 14 GB RAM, 12 cores, 407 GB free. Installed: Node 22.14, npm 10.9, Python 3.14.4, git 2.53. **Missing: Java, Docker, MongoDB, Hadoop, pip.** Agent has no passwordless sudo; user is not in `docker` group.
- **Problems:** Python 3.14 is very new — some libs (pandas/numpy wheels) may lag; consider a venv with uv or Python 3.12. Ubuntu 26.04 is new — MongoDB/Docker apt repos may not list it yet; verify before install (log result in TRIAL_ERROR.md).
- **Next step:** see plan/05_local_environment_setup.md.

## 2026-10-22 — Local environment installation
- Installed via apt: docker.io 29.1.3, docker-compose-v2, python3-venv/pip, openjdk-17-jdk-headless (17.0.20.1); added `allen` to `docker` group (takes effect after re-login; until then docker needs sudo).
- Installed `uv` to ~/.local/bin; created `retailpulse/.venv` (Python 3.12) with pymongo, pandas, numpy, statsmodels, scikit-learn (avoids Python 3.14 wheel risk).
- MongoDB: container `retailpulse-mongo` (image mongo:7.0, v7.0.45, 127.0.0.1:27017, volume `retailpulse-mongo-data`, restart unless-stopped). `mongo:8` failed — see TRIAL_ERROR.
- Hadoop 3.4.3 tarball downloading to ~/tools/dl (unused JDK/mongo tarballs also downloaded; to be deleted).
- Created project skeleton `retailpulse/`.
- Hadoop 3.4.3 installed at ~/tools/hadoop (user-level), pseudo-distributed: NameNode, DataNode, ResourceManager, NodeManager started directly via `--daemon start` (no sshd needed). Config: replication 1, YARN 6 GB, Java 17 via JAVA_HOME. Env added to ~/.bashrc.
- **Smoke test PASSED:** Hadoop Streaming (Python mapper/reducer, `hadoop-streaming-3.4.3.jar`) word count on HDFS `/smoke/in` → `/smoke/out`, job completed successfully (map input 2, reduce output 6 records). Code: `retailpulse/hadoop/streaming/wc_*.py`. Evidence screenshot/log still to be captured for the report.
- Mongo 7.0.45 ping OK. Python venv OK (pymongo 4.19, pandas 3.1).
- Added `retailpulse/infra/stack.sh` and `retailpulse/README.md`.
- Pending: Kaggle datasets (needs user's Kaggle API token), Node project scaffolds, Dockerfile + GitHub Actions workflow draft, docker group re-login.

## 2026-10-22 — Dataset research & downloads
- Researched 8 candidate datasets (see research/03_dataset_selection.md). Verified via HTTP headers: Amazon 2023 Grocery reviews 5.97 GB, metadata 1.38 GB, SNAP finefoods.txt.gz 122 MB; Kaggle download URL returns 404 without auth.
- User supplied a college account login (service unspecified); **not used** — dataset sources chosen need no login; Kaggle should use an API token. Credentials not stored.
- Background download started into `retailpulse/data/raw/` (marker file `.dl_done` on completion). Record sha/row counts after finish.

## 2026-10-23 — Data verification, Kaggle access, master plan v2
- Reviews download had been **truncated** (5,566,217,749 B vs expected 5,973,991,903) although `.dl_done` was written (the marker fires regardless of curl success). Resumed with `curl -C -`; final size 5,973,991,903 — matches.
- Kaggle: `~/.kaggle/access_token` (new-style token, 38 bytes; value never printed/stored in docs). Used via `KAGGLE_API_TOKEN`; Kaggle CLI 2.2.4 installed in venv. Competition file list OK; downloaded Store Sales (train.csv 3,000,888 rows incl. header-1; 54 stores; 33 families).
- Hadoop daemons were down after reboot → restarted with `infra/stack.sh start` (4 daemons up). Mongo container survived.
- Metadata profile: 603,274 products; store 97.1%; **price only 37.2%** and price sometimes a string (type error hit while computing median) → cleaning step needed.
- Wrote plan/06_master_plan_v2.md (data layers L1/L2/L3-simulated, Hadoop J1–J10, forecast design, cloud local-vs-teammate split, gates). Awaiting user review R-1…R-8.

## 2026-10-23 — Plan approved; pre-build setup
- User approved R-1…R-8 (see DECISIONS D-015). Wrote plan/07_saas_onboarding_and_data_lifecycle.md (owner journey, ingestion pipeline, automatic training lifecycle, Today screen, UX/chart standards, multi-tenant foundations, decisions E-1…E-10).
- Hadoop auto-start: user systemd unit `~/.config/systemd/user/retailpulse-hadoop.service` (oneshot, calls `infra/stack.sh hadoop-start/stop`); tested stop → enable --now → 4 daemons up. (Linger not enabled: starts at login, as requested. Mongo container uses docker restart policy.)
- Git: repo initialised at /home/allen/IA-3 (root holds docs/ and retailpulse/); local identity = GitHub noreply address; raw data, venv, secrets excluded via .gitignore. `gh` authenticated as allenjohn006.
- **Waiting for the user's "build" command.** No application code has been written.

## 2026-10-23 — User clarification Q&A: what the owner uploads
- User asked whether owners upload Excel/PDF/real data and what "demo store"/"manual typing" mean. Clarified: v1 = Excel/CSV item-wise sales report exported from billing software (real data); PDF/OCR not supported (silent-corruption risk); demo store = simulated data for instant trial; manual entry = for shops without software.
- Wrote plan/08_user_problems_and_mitigations.md (42 problems with fixes, "will not do" list, fixture-based test plan).
- Unverified: real export layouts of Vyapar/Marg/GoFrugal/Tally. Open: U-1 (sample exports), U-3 below.

## 2026-10-23 — Purchase/receiving/expiry workflow and feature parity
- Fetched vendor pages (GoFrugal, Vyapar) for feature lists; Marg page fetch failed ("unable to verify the first certificate") — Marg covered from prior research only.
- Wrote plan/09: stock-movement ledger model, 7 ways to capture expiry (receive-against-PO, purchase export upload, add-later, weekly sweep, opening-stock wizard, category estimate, future OCR), tracking policy per category, order-by-date logic, order lifecycle, problem/fix table, honest feature-parity matrix. Key engineering finding: POS sales lines lack batch → FEFO assumption + stock-count reconciliation.
- Awaiting D-017 approval.
