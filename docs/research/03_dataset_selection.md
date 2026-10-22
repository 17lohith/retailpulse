# 03 — Dataset Research & Selection (2026-10-22)

## Requirements (from Report 2 + rubrics)
Big Data: ≥ 50,000 records, **semi-structured/unstructured** (reviews, logs, product data with metadata), Kaggle suggested, processed by Hadoop MapReduce, stored in MongoDB, needs provenance + validation. Full Stack: real-looking product/sales records for CRUD. Cloud: Food-domain dataset in cloud storage, time series for BQML forecasting (deferred to teammate).

## Candidates
| Dataset | Access | Size / shape | Fit | Problems |
|---|---|---|---|---|
| **Amazon Reviews 2023 — Grocery & Gourmet Food** (McAuley Lab, UCSD) | Public on Hugging Face, **no login**. `raw/review_categories/Grocery_and_Gourmet_Food.jsonl` (5.97 GB), `raw/meta_categories/meta_Grocery_and_Gourmet_Food.jsonl` (1.38 GB) — sizes verified via HTTP headers | 14.3M ratings, 7.0M users, 603.2K items (dataset card). Review fields: rating, title, text, asin, parent_asin, user_id, timestamp, verified_purchase, helpful_vote. Metadata: title, store, main_category, categories, features, description, price, average_rating, rating_number, details (nested dict), parent_asin | **Best.** Genuinely semi-structured JSONL (nested, variable fields); true "big data" scale; reviews **join validly to product metadata** on `parent_asin` (price, brand/store, categories) — fixes the "can't join reviews to products" weakness of the Fine Foods set; grocery domain; gives product master data for the CRUD module | Licence not stated on card (cite Hou et al. 2024, arXiv 2403.03952; academic use). 7.3 GB total; many price values missing (to be profiled) |
| Amazon Fine Food Reviews (SNAP / Kaggle) | SNAP mirror public: `finefoods.txt.gz` 122 MB. Kaggle API URL returned 404 without auth | 568,454 reviews (Report 2) | Good **fast dev sample**; matches existing report text | No product metadata (no price/category) |
| Store Sales – Time Series Forecasting (Kaggle, Favorita) | **Kaggle login + rules acceptance required** | daily sales by store × product family; with oil, holidays, stores, transactions | Cloud forecasting module (Report 2 plan); structured, clean for BQML ARIMA_PLUS | Needs Kaggle token; Ecuador, product *families* not SKUs |
| Favorita Grocery Sales Forecasting (Kaggle) | Kaggle only; ~980 MB raw, 125M-row scale per Nixtla docs | item-level daily sales, 371k series 2013–2017 | Item-level, big; ideal for Hadoop sales aggregation (Q-004) | Kaggle only; licence per competition rules |
| Instacart Market Basket | Kaggle only | 3.35M orders, 33.8M product lines, 49.7K products | Basket analysis (co-purchase MapReduce) | No stock/prices; licence unverified (non-commercial per Instacart, **verify**) |
| Zenodo "Supermarket Grocery Sales–Retail" | Open CSV 905 kB | small | Tiny demo data only | Columns unverified; too small for rubric |
| Dunnhumby Complete Journey, M5 Walmart | not researched in detail | — | candidates | skipped |
| Public stock/expiry/waste data | **None found** | — | — | Confirms D-006: expiry/stock must be SIMULATED & labelled |

## Decision (recommended — D-013)
1. **Big Data + Full Stack primary: Amazon Reviews 2023 Grocery & Gourmet Food (reviews + metadata).** Work on the full files in Hadoop (real big-data scale), and a 1–2M-review sample for fast Mongo/UI work. Keep SNAP Fine Foods as small dev/test set and for continuity with Report 2.
2. **Hadoop jobs (reviews+meta):** token frequency by rating; review count/avg rating per product; monthly volume; **price-band vs rating**; **brand/store (`store`) rankings**; helpful-vote analysis; verified-vs-unverified. Optional reduce-side **join** of reviews with metadata (good MapReduce teaching content).
3. **Cloud forecasting module: Store Sales (Kaggle)** — needs Kaggle token; teammate/you download. Product "sales demand" for the dashboard/forecast should use this, never reviews counts as sales (reviews ≠ sales; could be used as a *demand proxy* only if clearly labelled).
4. **Stock/expiry/purchases: SIMULATED**, generated from sales with documented rules, flagged `simulated: true`.
5. **Licence/attribution** to include in reports: McAuley Lab Amazon Reviews 2023 (Hou et al., 2024); Kaggle competition rules for Store Sales.

## Open risks
- 6 GB JSONL through Hadoop Streaming (Python) on a single node: expect tens of minutes per job; mitigate with `mapreduce.input.fileinputformat.split.maxsize`, 12 cores, and combiner. Record timings (good report data).
- MongoDB load of 14.3M docs ≈ 10+ GB storage; load only a sample into the operational DB, store job outputs (small) in full.
- Kaggle login: cannot be automated safely with a username/password; use API token (`~/.kaggle/kaggle.json`) or manual download.
