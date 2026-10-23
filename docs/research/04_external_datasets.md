# 04 — External Datasets: search, download, analysis, decisions (2026-10-23)

Goal (user request): find datasets similar to our domain, download and analyse them, create synthetic data only where nothing real exists, and use them for testing, the Hadoop demo and the staff presentation — across Full Stack, Big Data and Cloud.

**Method.** Web search (vendor pages, UCI, Kaggle mirrors) → direct Kaggle API search with the user's token (exact sizes, licences, columns) → download → profile every file with `data_prep/profile_external.py` (`evidence/data_profile/external_*.json`) → verify usefulness → decide. Facts below come from those profile files and the Kaggle/UCI listings.

## 1. What was found and what we did with it
| # | Dataset (source) | Size / rows | Licence (as listed) | Real? | Verdict & use |
|---|---|---|---|---|---|
| 1 | **Instacart Market Basket** (Kaggle mirror) | 665 MB; 3,421,083 orders, 206,209 users, 49,688 products, **32,434,489 order-product rows** | CC0 on mirror; Instacart terms say research use — *verify* | real | **Used** – Hadoop X1–X3 (basket analysis, reorder rate, order timing) |
| 2 | **Dunnhumby – The Complete Journey** (Kaggle) | 808 MB; **2,595,732** transactions, 2,500 households, 276,484 baskets, 92,339 products, 582 stores, 102 weeks; causal file 36.8 M rows | DbCL 1.0 | real | **Used** – X4 (discount depth, basket sizes) |
| 3 | **Online Retail II** (UCI / Kaggle mirror) | 91 MB; **1,067,371** invoice lines, 53,628 invoices, 5,305 products, 43 countries | CC BY 4.0 (UCI) / CC0 (mirror) | real, **bill-level** | **Used** – X5 (returns) + importer stress test on genuine messy billing data |
| 4 | **M5 Forecasting – Walmart** (competition needs rules acceptance → used MIT-licensed parquet mirror) | 46,796,220 daily points, **30,490 item-store series × 1,913 days**, prices, events | Walmart competition data via mirror — *verify rules* | real, **SKU-level** | **Used** – X6 demand classification; real SKU-level forecast benchmark |
| 5 | **Real Canadian Superstore** monthly scrapes 2025 | 252 MB; 12 CSVs, 120,361 rows, 17,494 products, **12 different schemas** | Apache-2.0 | real (scraped catalogue/prices) | **Used** – X8 price & promotion drift; schema-drift cleaning |
| 6 | **BigBasket Entire Product List** | 16 MB; 27,555 products, 2,313 brands, INR prices | CC BY-NC-SA 4.0 (non-commercial) | real (Indian catalogue) | **Used** – catalogue for new demo shop *Annapurna* (real Indian products, native ₹) |
| 7 | **Supermarket Inventory & Demand (synthetic)** | 36 MB; 100,000 rows, 100 products, 4 stores, **80,034 batches**, expiry/waste fields | CC0 (file) – Kaggle page may list CC BY-NC-SA | **synthetic** (labelled) | **Used as reference only** – X7; *its waste is 0.4 % of perishable sales vs 4.7 % in our simulation → waste rate is an assumption* |
| 8 | Grocery Inventory & Sales (Kaggle) | 136 KB; 992 rows | CC0 | synthetic/random | **Not used for results**: 495 of 992 rows have expiry before receipt, status random → dirty-data fixture only |
| 9 | Retail Store Inventory Forecasting (Kaggle) | 6 MB; 73,100 rows, 20 products, 5 stores | CC0 | synthetic | **Rejected**: only 20 % grocery, units sold never exceed inventory (no stock-outs) |
| 10 | **Open Food Facts** (India subset, barcode prefix 890) | full CSV 0.9 GB gz / 9 GB; 4.83 M products globally | ODbL / DbCL | real | **Attempted**: HuggingFace remote query rate-limited (HTTP 429); official dump streamed in background through an India filter (`data_prep/off_india_filter.py`) – slow link; optional, not on the critical path |
| 11 | Grupo Bimbo Inventory Demand; Walmart/other competitions | ~75 M rows | competition rules | real | **Not downloaded**: needs rules acceptance on the website (403) and adds little beyond M5; listed for completeness |
| 12 | Zepto/BigBasket scraped panels, Actowiz | — | commercial scraping vendors | — | Not datasets; schema reference only |

**No public dataset with real stock-on-hand, batch expiry and waste exists** (search + Kaggle API confirm). Items 7–9 are synthetic. Therefore RetailPulse's own simulation (L3) remains, now cross-referenced against #7.

## 2. Data-quality findings (all measured)
- **Online Retail II:** 34,335 exact duplicate rows; 22,950 negative quantities; 19,494 cancellation lines (1.8 %); 6,207 zero/negative prices; 22.8 % rows without customer id; 5,986 non-product codes (POST, DOT, M, BANK CHARGES…); one order of 80,995 units that is cancelled the same day.
- **Supermarket synthetic:** mixed date formats (`2025/09/07` vs `2025-01-01`), category case duplicates (`Bakery`/`bakery`), 14 % missing shelf life.
- **RC Superstore:** 12 monthly files, 12 different column sets; the `deal` text column is almost empty — promotions are only visible through a higher `wasPrice` (5.1 % of rows).
- **Dunnhumby:** 14,466 zero-quantity lines; 1,303,026 lines with loyalty discount; blank department names.
- **Instacart:** `days_since_prior_order` null for every first order (206,209).
- **Grocery Inventory (small):** 495 rows expiry < received date; 453 below reorder level; 5 blank prices.

## 3. What was built from them
**Hadoop (Big Data) – 8 job families, 13 job runs** (`hadoop/streaming/x*.py`, `hadoop/scripts/run_ext.sh`)
| Job | Technique | Input | Result |
|---|---|---|---|
| X1 → X1b → X1c | **Apriori-style 3-job chain**: item support → baskets of *frequent items only* (distributed-cache list) → pair counts (combiner + reducer threshold) | 32.4 M lines | 1,900 frequent items; 2,750,476 baskets; **57,160 frequent pairs** |
| X2 | **map-side join** with products/aisles/departments | 32.4 M lines | reorder rate by 21 departments / 134 aisles (dairy-eggs 67 %) |
| X3 | counting | 3.4 M orders | weekday × hour heat-map; recency histogram |
| X4, X4b → X4c | **map-side join**; per-basket reduce then chained histogram | 2.6 M lines | loyalty discount depth by department/quarter/brand type; basket-size distribution |
| X5 | counters as cleaning log; returns | 1.07 M lines | monthly revenue & return rate, top returned products |
| X6 → X6b | **Syntetos–Boylan demand classification** (same rule as the production engine), chained count | **46.8 M points** | 30,490 series: FOODS 8 % smooth, 61 % intermittent; 51 % of food days have zero sales |
| X7 | dirty-data normalisation in mapper | 100 k rows | waste/near-expiry by category × store (reference) |
| X8 | per-key reducer with sorting; schema drift pre-normalised | 120 k rows | price swings, promotion share per month |
All 12 validation checks **PASS with zero mismatches** against independent pandas/numpy recomputation (`evidence/validation/validation_external.md`). Timings: `evidence/hadoop/SUMMARY_EXT.txt`.

**Forecast benchmarks on real data**
- Favorita store×family (1,543 series): GBM 0.142 WAPE, **guarded selector 0.144**, plain per-series selector 0.148, best simple baseline 0.166 (`evidence/forecast/favorita_metrics.md`).
- **M5 FOODS SKU-level (4,303 eligible item-store series, CA_1/TX_1/WI_1)** — the production engine's own functions: GBM 0.660, **guarded selector 0.660**, plain selector 0.675, best baseline 0.705 → 6.4 % better than baseline, 80 % interval covered 84 % (`evidence/forecast/m5_foods_metrics.json`). By class: smooth 0.38, erratic 0.54, intermittent 0.75, lumpy 0.80 WAPE.
- **Consequence (decision D-028):** per-item model choice from a 28-day window over-fits noise on both datasets; the pipeline now keeps the global learning model unless another method wins by > 10 % on the selection window (`guarded_choice`). The 10 % margin was set after seeing M5; Favorita (independent) confirmed the direction (0.148 → 0.144) — GBM alone remains marginally best there (0.142) and that is reported.
- **Realism check of the simulation:** our simulated shops score WAPE 0.46–0.57 at SKU level; real M5 foods score 0.66. The simulated demand is therefore *not easier* than real retail demand — a point in its favour, not a proof.

**Synthetic / simulated data created because nothing real exists**
- **Demo C "Annapurna Fresh & Provisions"** (new): 1,092 real Indian products from BigBasket (native ₹ prices, brands such as Double Horse, Emami), real Favorita demand shape, simulated stock/batches/expiry/POs; `simulation/generate.py demo-c`. Fixes the earlier weakness that Demo A/B showed US gourmet items priced with an assumed USD→INR factor.
- Waste rate: kept as an explicit assumption; reference dataset #7 shows how low it can be (0.4 %).

**Full Stack (importer) hardening from real data** — `e2e/realworld_ingest.mjs` imported 300,000 rows of Online Retail II: columns auto-detected (date, description, quantity, **unit price**, invoice, stock code), 297,913 rows OK, 2,087 rejected (blank description), 6,637 return lines netted, 3,832 items created by **item code** (same code with different descriptions = one item), counts reconcile. Found and fixed: unit-price-only files, code-keyed matching, and **service lines** (postage, bank charges, manual) now skipped and reported (3 new tests).

## 4. For the staff presentation
- UI: *Insights → Retail research* (basket analysis with lift, reorder rates, shopping-time heat-map, discounts, returns, demand predictability, price drift, waste reference) and *Insights → Data sources* (every dataset, licence, real/synthetic badge).
- Message: *"Hadoop processed more than 80 million records from five real retail datasets (Instacart 32.4 M, M5 46.8 M, Dunnhumby 2.6 M, Online Retail II 1.1 M, Superstore 0.1 M); every result was re-computed independently and matched; the demand classes explain why the shop engine tests several methods per item."*

## 5. Limitations and open items
Licences for Instacart, M5 mirror and the synthetic-supermarket page should be re-checked on the source pages before any redistribution (raw data is not in git). Dunnhumby discount columns were interpreted as documented but sales values may already be net of discount. M5 competition files proper need a one-click rules acceptance on Kaggle; we used a mirror. Open Food Facts India extract pending (slow link).

## Sources
UCI Online Retail II https://archive.ics.uci.edu/dataset/502 · Open Food Facts data https://world.openfoodfacts.org/data · Instacart/Dunnhumby/BigBasket/M5 mirrors via Kaggle API (`kaggle datasets list/download`) · dunnhumby https://dunnhumby.com/sourcefiles · whylogs BigBasket licence note https://whylogs.readthedocs.io/en/latest/datasets/ecommerce.html · MongoDB/Google references unchanged from earlier research files.
