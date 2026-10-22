# 02 — Feasibility & Challenges

*2026-10-22. Question asked: "Can we do it or not?" Answer is split in two, because the academic build and the startup are different bets.*

## Verdict
| Question | Verdict | Confidence |
|---|---|---|
| Can we build the **academic project** that satisfies all 3 rubrics? | **Yes**, if scope is held to the P0 list and cloud costs are controlled | Medium-high; unknown = deadline & team size |
| Can it become a **real SaaS** that beats incumbents? | **Possibly, as a narrow wedge** (explainable forecast + reorder on top of existing POS). Not as a general POS competitor. Unproven until owners confirm they'd pay | Low until interviews done |
| Can it serve **big chains** too? | Not in v1. Phase-2 tier at best | — |

## A. Technical challenges

| # | Challenge | Why it matters | Mitigation |
|---|---|---|---|
| T1 | **Hadoop in a SaaS is architecturally awkward.** A single store produces thousands–low millions of rows/yr; pandas/BigQuery handles that. Hadoop earns its place only for batch/historical backfill at chain scale | An evaluator or investor may ask "why Hadoop?" | Frame Hadoop as the **batch analytics tier** for historical/multi-store backfill; MongoDB = operational store. Document the honest trade-off in the report (good research-paper material) |
| T2 | **mongo-hadoop connector is dead** (last update 2017, repo archived Jan 2022; Java 11/Hadoop 3 issues reported) [MongoDB forum, GitHub] | Cannot rely on it to read/write Mongo from MapReduce | Use the plan already implied by the docs: export from Mongo → HDFS → MapReduce (Hadoop Streaming, Python) → output file → PyMongo load script. Log this as D-003 |
| T3 | **"MapReduce in MongoDB" vs Hadoop wording** (handout vs your statement) | Marks for criterion "Dataset & MapReduce" (10) | Get instructor confirmation **in writing** (Q-001). Fallback: also implement the same 3 jobs as Mongo aggregation pipelines (cheap, doubles as validation) |
| T4 | Hadoop setup effort (Java, HDFS, YARN) | Biggest "lost-week" risk | Single-node pseudo-distributed in Docker or native; Hadoop Streaming so mappers/reducers are Python. Log every setup error in TRIAL_ERROR.md |
| T5 | **Two unrelated datasets** (reviews vs store sales) | Weakens the "one product" story | Keep modules separate (Report 2 rule). Option: also run a sales-aggregation MapReduce on Store Sales so Hadoop touches the forecasting data too (Q-004) |
| T6 | Public data lacks inventory/expiry/purchases | Reorder & expiry features can't be validated on real data | Generate **clearly labelled synthetic** stock/batch data; never report it as real results |
| T7 | Forecast may not beat a moving-average baseline | Honest-result principle | Chronological hold-out, report MAE/RMSE vs baseline even if baseline wins |
| T8 | Cloud pipeline breadth (GCS → Cloud Run fn → BigQuery → BQML → Looker Studio → Docker → GitHub Actions) | 10-mark criterion + billing | Build thinnest vertical slice first; budget alerts; stay in free tier (BigQuery 1 TiB query/10 GB storage free monthly, Cloud Run free quota [3P, verify]); delete resources after demo |
| T9 | Atlas M0 free tier = 512 MB, shared, ~100 ops/s | 568k reviews + outputs may not fit | Use **local mongod (Docker)** for dev/demo; Atlas only if size verified |
| T10 | POS integration (real SaaS) | Each POS exports differently | v1 = CSV/Excel upload + column-mapping wizard; connectors later |
| T11 | Product-identity mismatch (same item, different names) | Garbage-in forecasts | Reviewed mapping step; stable SKU IDs |
| T12 | Multi-tenancy & auth (real SaaS) | Data isolation is existential | JWT auth + `tenantId` on every document + query middleware; test isolation explicitly |

## B. Business / startup challenges
| # | Challenge | Notes |
|---|---|---|
| B1 | **Premise correction**: incumbents are cheap, not elite-only | See research 01. Pitch must be "forecast + explanation", not "affordable software" |
| B2 | Low ARPU (₹300–1,500/mo) → needs thousands of stores; support cost can eat margin (GoFrugal's weak spot is support) | Self-serve onboarding, in-app help, WhatsApp support bots (later) |
| B3 | Distribution: kirana owners buy via local dealers/resellers | Partnership with POS resellers/CA firms is likelier than ads (hypothesis) |
| B4 | Language & literacy: 26% struggle with new tools [3P] | Hindi/Tamil/regional UI, voice/WhatsApp summary — post-v1 |
| B5 | Capital-heavy kirana-tech has failed (1K Kirana) | Stay software-only |
| B6 | Trust: "AI says order 75 units" must be explainable | Core differentiator (H2) |
| B7 | Churn when owners stop uploading data | Automatic ingestion / reminders |
| B8 | Competing with POS vendors who can ship the same feature | Moat = model quality, UX, POS-agnostic; honestly thin |

## C. Legal / compliance
- **DPDP Act 2023 + Rules 2025**: retailer = data fiduciary, we = processor; need security safeguards, breach notification, erasure/return of data on termination, sub-processor control [law-firm commentary via search; **verify against official text and commencement dates**]. Sales data may include customer data (loyalty phone numbers) → don't ingest customer PII in v1.
- GST/invoicing: not our scope (not billing).
- Dataset licences: check Kaggle licence for Amazon Fine Food Reviews and Store Sales before redistribution; Store Sales is competition data (rules apply) — **verify** (Q-006).

## D. Project-management risks (academic)
- **Deadline and team size unknown** → cannot size scope (Q-002).
- Three certifications (10 + 10 + 15 marks) are independent of code and easy to forget — schedule them now.
- Cloud credit/billing account needed (Q-005).
- Scope creep: P2 features are explicitly banned until P0 evidence exists.

## E. Decision gates (go / no-go)
1. Instructor confirms Hadoop acceptable → else switch Big Data to Mongo aggregation + keep Hadoop as bonus.
2. Hadoop single-node runs word-count end-to-end within the first work block, else fall back to Docker image.
3. Cloud slice (upload → function → BigQuery) works before any dashboard polish.
4. ≥ 5 owner conversations before any startup claims are written into a paper/pitch.
