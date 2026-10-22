# 07 — SaaS Onboarding & Data Lifecycle (how the shop owner actually uses RetailPulse)

Status: DESIGN FOR REVIEW 2026-10-23. Not built.

## 0. The problem, stated as an engineer
A supermarket owner has: a billing/POS program (Vyapar, Marg, GoFrugal, Tally, or a custom one), maybe Excel sheets, paper purchase bills, and no time. They will not clean data, tune models, or read statistics. Our product only works if **their history gets in cheaply, wrong data is caught before it poisons the forecasts, and the system trains itself and tells them what to do in plain words.**

Design targets (measurable, to be tested in the demo):
| Target | Goal |
|---|---|
| Time from signup to first useful screen | ≤ 15 minutes with a billing export, ≤ 2 minutes with demo data |
| Owner actions needed to "train" | **0** (training is automatic) |
| Daily effort after setup | ≤ 2 minutes (upload today's sales, approve the order list) |
| Silent data corruption | none: every rejected/changed row is visible and countable |
| Jargon on screen | none (no "MAPE", "ARIMA"; use "usually off by about 12 units") |

## 1. Owner journey (5 stages)
```
 SIGN UP → SHOP SETUP → BRING IN DATA → CHECK & CONFIRM → AUTOMATIC LEARNING → DAILY USE
 (1 min)   (2 min)      (5–10 min)      (2–5 min)         (minutes, background)  (2 min/day)
```
1. **Sign up:** email + password (v1), shop name. Roles: Owner / Manager / Staff (staff can't see cost/margin or approve orders).
2. **Shop setup wizard (≤ 6 questions):** shop type (kirana / supermarket / small chain), number of stores, categories sold (checkbox tiles), weekly off day, supplier lead time (default 2 days, editable per supplier later), budget sensitivity (optional). Everything has a sensible default and can be changed later.
3. **Bring in data** — three doors, shown as large cards:
   - **"Upload my billing report"** (core). Drag-and-drop CSV/XLSX. Pick the software from a list (Vyapar / Marg / GoFrugal / Tally / "Other") → we use a prebuilt column template; "Other" triggers auto-detection.
   - **"Try with a demo store"** (zero effort). Loads the simulated *Demo A* so the owner/examiner sees every feature immediately; clearly badged SIMULATED.
   - **"Type it in"** (fallback). Add items, opening stock, and receive deliveries manually (mobile-friendly forms; barcode scan later).
   Future doors (documented, not built): watched-folder uploader for Windows, scheduled email-in, Google Sheets link, POS APIs.
4. **Check & confirm** — see §2. The owner confirms a column mapping and fixes flagged items; nothing is imported without a preview.
5. **Automatic learning** — see §3. A progress card says "Learning from 14 months of sales… 62%", then "Ready".
6. **Daily use** — see §4. The home screen is an **action list**, not a wall of charts.

## 2. Ingestion pipeline (engineering design)
```
upload ─► store raw file (GridFS) ─► job: PARSE ─► DETECT/MAP ─► VALIDATE ─► MATCH PRODUCTS ─► QUARANTINE|STAGE ─► PREVIEW ─► COMMIT ─► post-commit jobs
```
| Step | Decision | Why |
|---|---|---|
| Raw file kept (GridFS in MongoDB), SHA-256 recorded | Never lose the source; allows reprocess and audit; keeps "MongoDB only" storage rule | Debuggability, DPDP data-return/erasure |
| Streaming/chunked parsing (csv + xlsx), size limit 100 MB, 2M rows per file | Memory-safe on small servers | Real stores have years of bills |
| **Data types supported:** (a) Sales lines — *required*: date, item, quantity (price/bill no. optional); (b) Item master — optional: name, barcode/SKU, category, cost, selling price, MRP, pack size; (c) Current stock — optional; (d) Purchases/receipts — optional; (e) Batches/expiry — optional | Minimum viable input = sales history only. Everything else unlocks extra features | Lowers the barrier to entry; honest degradation |
| **Column detection:** header synonym dictionary (EN: "Qty", "Quantity", "Qnty", "Sold"…), value sniffing (date formats DD/MM/YYYY vs MM/DD/YYYY via majority/ambiguity check, numeric with commas, currency symbols), confidence score per column; owner confirms/overrides; **mapping saved per tenant** and reused on the next upload | Automatic when possible, correctable always | Non-technical users |
| **Row validation rules:** parseable date, not in the future, quantity numeric (returns allowed as negative but flagged), price ≥ 0, item present, duplicate-row detection, outlier detection (e.g., qty > 20× item median) | Rules are data, listed in the report | Prevent poisoned forecasts |
| **Product matching:** barcode/SKU exact → normalised exact name → fuzzy name (token-set ratio ≥ threshold) **proposed, not auto-applied** below high confidence; unmatched items listed for "create new / merge with…" | Identity mismatch is the #1 data-quality risk (Report 1) | Human-in-the-loop only where uncertain |
| **Quarantine, don't drop:** bad rows go to `import_errors` with reason and downloadable CSV | Transparency | Trust |
| **Idempotent commit:** row fingerprint = hash(tenant, store, bill_no/date, sku, qty, price); re-uploading overlapping periods upserts, never doubles; each import has an id and **Undo import** | Owners will re-upload the same month | Correctness |
| **Atomic visibility:** data is staged, then committed per import batch; failed batch leaves production data untouched | MongoDB 7 transactions require replica set → run Mongo as a single-node replica set (decision E-3) | Safe rollbacks |
| Store-local dates (IST) stored as `YYYY-MM-DD` + UTC timestamp | Daily aggregation correct around midnight | Subtle but common bug |
| Money as integer paise (not float) | Avoid rounding drift | Accounting accuracy |

**Preview screen** shows: rows found, rows OK, rows fixed automatically, rows rejected (with top reasons), new products to create, date range found, "this will add 412,318 sales lines for 1 Jan 2025 – 30 Sep 2026".

## 3. Automatic learning (training lifecycle)
**The owner never presses "train".** Every successful commit enqueues jobs.

```
COMMIT ─► job: AGGREGATE (daily series per store×SKU, fill zeros on open days, flag stock-out days)
       ─► job: PROFILE   (history length, demand pattern: smooth / intermittent / lumpy via ADI & CV²)
       ─► job: BACKTEST  (rolling-origin on last N weeks; candidate models per SKU class)
       ─► job: FORECAST  (next 28 days, with prediction interval)
       ─► job: RECOMMEND (reorder, expiry, slow-mover) ─► notify
```
| Decision | Detail | Why |
|---|---|---|
| **Job queue = MongoDB `jobs` collection**, worker leases a job with atomic `findOneAndUpdate`, heartbeat, retry with backoff, idempotent job keys | No Redis/RabbitMQ: fewer moving parts, stays inside the "MongoDB for storage" rule, easy to demo and log | At SMB scale this is enough; documented swap-out path (Cloud Tasks/Pub-Sub) |
| **Worker is a separate Python process** (pandas, statsmodels, scikit-learn) that talks only to Mongo — not to the Node API | Best language for forecasting; failure isolation; API stays responsive | Clean boundary |
| **Model selection per SKU class, by backtest — not by assumption.** Candidates: seasonal-naive, moving average, ETS (smooth demand), Croston/SBA (intermittent), global gradient-boosting model with weekday/promo/holiday/price features (many SKUs). Winner = lowest WAPE/MASE on rolling backtest; naive baseline always kept | The honest-results rule: the system proves a model beats the baseline for *that* shop, else it uses the baseline and says so | Explainability, trust |
| **Cold start rules:** < 14 days history → no forecast, show "learning"; 14–56 days → moving average + category pattern; ≥ 56 days → weekly seasonality models; ≥ 365 days → yearly seasonality/festivals | Explicit thresholds shown as a "Data readiness meter" per feature | Prevents confident nonsense |
| **Hierarchy:** forecast at category level and distribute to sparse SKUs by recent share | Many kirana SKUs sell 0–2 units/day | Accuracy for sparse items |
| **Stock-out censoring:** days with zero stock are marked; demand on those days is not treated as zero | Otherwise forecasts under-predict popular items (classic retail bug) | Needs stock data → degraded if absent, and says so |
| **Retraining:** nightly incremental refresh; full re-selection weekly or on ≥ 20% new data; drift monitor on rolling error; automatic fall back to baseline if the model is worse for 7 days | Self-maintaining | SaaS reality |
| **Isolation:** one model set per tenant; no cross-tenant data use in v1 (pooled benchmarks = opt-in future) | Privacy/DPDP | Trust |
| **Where Hadoop fits** | Heavy batch: historical backfill for large chains, category benchmarks across tenants (future, opt-in), review/sales aggregates for insights. Not on the per-shop hot path | Honest architecture: Hadoop earns its place only at chain/portfolio scale |

## 4. Daily use: the "Today" screen (what makes it simple)
1. **Banner:** data freshness ("Last sales upload: yesterday ✅" / "3 days old — recommendations are less reliable").
2. **Order today** — list grouped by supplier: item, suggested qty, why ("Sells ~14/day, 6 left, supplier delivers in 2 days"), cost; one-tap **Approve**, **Edit qty**, **Skip (reason)**; **Share order** as text/PDF (WhatsApp-ready). RetailPulse does not place orders itself (v1).
3. **Expiring soon** — batches with a suggested action (move to front, pause reorder, consider markdown).
4. **Stock-out risk this week**; **slow movers tying up cash** (₹ value).
5. **Yesterday vs. expected** — one small chart.
6. Everything else (sales analytics, product pages, forecasts, review insights, data quality) is one click away in the left menu.
**Daily refresh = "Upload today's sales"**: uses the saved mapping, runs in seconds, no questions asked unless something is odd.
**Feedback loop:** approve/edit/skip + reason, and "received quantity" are stored in `recommendations` and used to measure (a) whether suggestions were followed, (b) outcome (stock-out/overstock after), (c) per-SKU adjustment later. This is the evidence for the "owner trust" metrics in Report 1 §9.

## 5. Making it usable for non-technical users (UX rules we will test)
- Mobile-first responsive design; touch targets ≥ 44 px; works on a low-end phone.
- Plain language and units the owner uses (“cases”, “packs”, “₹”), English only in v1.
- Every empty page tells you the next step with one primary button; **downloadable sample CSVs** for each data type.
- Every number is explainable on tap ("Why this?").
- Charts: few, large, labelled in words, consistent colour meaning (see §7). No chart without a one-line takeaway ("Milk sells 30% more on weekends").
- Errors say what to do, not what failed ("Row 214: date 31/02/2026 doesn't exist — fix it or skip it").
- Undo for imports and for approvals.

## 6. Multi-tenant SaaS foundations (v1 scope = designed + core built)
| Concern | Decision |
|---|---|
| Isolation | `tenantId` on every document; API middleware injects it from the JWT; automated tests try cross-tenant reads and must fail |
| Auth | JWT access + refresh, bcrypt, rate limiting, account lockout; roles (owner/manager/staff) with permission map |
| Plans | `plan` field + feature flags + usage counters (SKUs, stores, rows) — billing integration is future scope |
| Data rights | per-tenant **export all** and **delete all** (DPDP) with audit entries |
| Observability | structured logs, job status page, import history, `/health` endpoints |
| Backups | `mongodump` script + documented restore test |
| Limits | upload size/rows, request rate, job concurrency per tenant |

## 7. Chart & visual design standards (user requirement: neat, professional, easy to understand)
- Library: **Recharts** (React-native, clean defaults, good accessibility with custom tooltips) in Bootstrap layout.
- Colour: one neutral palette + one meaning-bearing set (green = healthy, amber = watch, red = act); colour-blind-safe pairs; always icon/label as well as colour.
- Chart set: KPI cards with sparkline; line (sales trend with forecast band); bars (top products, category share sorted); heat-map (weekday × hour/category); waterfall-style "stock cover" bars; tables with inline bars for reorder lists. No 3-D, no pie charts beyond ≤ 5 slices, no dual axes.
- Every chart: title that states the takeaway, labelled axes, readable tooltips, empty and loading states, export as image/CSV.
- Dark/light theme later; light first.

## 8. How this is demonstrated for each subject
| Subject | What the examiner sees from this design |
|---|---|
| Full Stack | Real upload wizard, validation preview, import undo, auth/roles, job progress, action list, charts, CRUD |
| Big Data | Batch tier: Hadoop jobs over reviews/sales; MR outputs feed the "Customer insight" screens; explanation of why single-shop forecasting runs in Python and Hadoop serves batch scale |
| Cloud | The same import pipeline's validation/ETL logic packaged as a serverless function reacting to a storage upload; Dockerised services; CI/CD |
End-to-end demo script: export *Demo A* from the simulator as a Vyapar-style CSV → upload through the wizard (real parse/validate/match/commit) → watch the learning job → open Today screen → approve an order → show Mongo documents.

## 9. Engineering decisions recorded
| ID | Decision | Alternatives rejected |
|---|---|---|
| E-1 | Async job queue in MongoDB; Python worker | Redis/Bull, Celery+RabbitMQ (extra infra; violates "Mongo storage" simplicity) |
| E-2 | Raw uploads in GridFS | Local disk (not portable, not auditable), S3 (needs cloud account) |
| E-3 | MongoDB single-node **replica set** (enables transactions/change streams) | Standalone (no multi-document transactions) |
| E-4 | Automatic training, no manual button | Expose "Train model" (owners can't judge) |
| E-5 | Backtest-based model selection per SKU class, baseline always retained | One fixed model (can't be defended) |
| E-6 | Minimal required input = sales history; other data optional with feature gating | Demand full ERP export (kills adoption) |
| E-7 | Propose-not-apply for uncertain product matches | Fully automatic fuzzy merge (silent errors) |
| E-8 | Money as integer paise; store-local dates | Floats; UTC-only dates |
| E-9 | Recommendations are advisory; no auto-ordering | Auto-order (liability, trust) |
| E-10 | Per-tenant models; cross-tenant learning is opt-in future work | Pooled by default (privacy) |

## 10. Open items for the user
- **U-1** Which billing exports should the templates mimic first? (Proposal: Vyapar-style, Marg-style, generic POS CSV.) We have no real exports — the simulator will emit synthetic files in those layouts; real samples from a friendly shop owner would greatly improve realism.
- **U-2** Do you know a real shop owner willing to try the app (even with their anonymised data) near the end? It would turn the paper from "simulation" into "pilot".
