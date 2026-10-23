# RetailPulse — User Guide & Project Overview

*A short, non-technical guide for anyone using or working on RetailPulse. For numbers and proof see `docs/report/EVIDENCE_SUMMARY.md`; for decisions and history see `docs/logs/`.*

## 1. What is RetailPulse?
A decision assistant for supermarkets and kirana stores. The owner uploads what their billing software already knows (sales, items, stock). RetailPulse **learns the shop by itself** and each morning shows a simple list: **what to order, what is about to expire, what may run out, and where cash is stuck** — every suggestion with a plain-language reason.

It does **not** replace billing, GST or accounting software, and it never places orders for you.

> **Honesty note:** no public dataset has real stock/expiry/waste records, so the three demo shops use *simulated* operations data built on *real* demand patterns. Everything simulated carries a purple **SIMULATED** badge. Nothing here proves real savings.

## 2. The three demo shops (no setup needed)
| Shop | What it is | Login on the sign-in page |
|---|---|---|
| Sri Lakshmi Provision Store | 1 store, 600 items | "Single store" button |
| GreenMart Supermarkets | 3-store chain, 1,200 items | "3-store chain" button |
| Annapurna Fresh & Provisions | 1 store, real Indian products in ₹ | "Indian supermarket" button |

Manual logins: `owner@demo-a.retailpulse.test` (also `demo-b`, `demo-c`; roles `owner`, `manager`, `staff`), password `Demo@1234` (local demo only).

## 3. How to run it
- **Easiest (Docker):** `docker compose -f retailpulse/infra/docker-compose.yml --env-file retailpulse/infra/.env up --build` → open http://localhost:8080 and **register your own shop** (this stack starts empty).
- **Development setup used for the demos:** MongoDB container + API (`node retailpulse/backend/src/server.js`, port 4000) + `npm run dev` in `retailpulse/frontend` (http://localhost:5173) + Hadoop (`retailpulse/infra/stack.sh start`). Start the learning worker with `python retailpulse/engine/worker.py`.

## 4. A day in the life — the screens
| Screen | What it does | Use it to… |
|---|---|---|
| **Today** | KPIs, "What to order today" (grouped by supplier, with reasons), batch questions, items that may run out, cash tied in slow stock, "Get ready" checklist | Start every morning here |
| **Orders** | Approve / edit quantity / skip suggestions → create an order → copy it to WhatsApp → later **Record delivery** (received, damaged, expiry date) | Buy the right amount; keep a delivery record |
| **Stock & expiry** | Stock levels (days left, fast/slow), expiring batches, deliveries *missing an expiry date*, and **Count stock** | Keep stock numbers true; avoid waste |
| **Sales** | Trends, busiest weekdays, best sellers, category profit (owner/manager), quick sale entry | Understand what makes money |
| **Forecasts** | How accurate the predictions are — measured honestly on hidden days — plus a real-data benchmark | Know how far to trust the numbers |
| **Insights** | What customers say (14 M reviews), **Retail research** (basket pairs, reorder rates, shopping times, discounts, returns, demand predictability, price drift), waste demo, **Data sources**, product lookup | Learn patterns; present to staff |
| **Products** | Item list: add/edit/hide/delete; click an item for its sales, forecast range, stock and batches | Maintain the catalogue |
| **Bring in data** | The import wizard (section 6) | Feed the system |
| **Data quality** | Plain-language list of what to fix (missing costs, stale data, deliveries without expiry…) | Improve suggestions |
| **Settings** | Shop name, expiry warning days, stores, team members, activity log, **download / delete all my data** | Administer |

Roles: **Owner** (everything) · **Manager** (upload, approve orders, products) · **Staff** (record deliveries, answer batch questions, count stock; cannot see costs/profit or approve).

## 5. How it learns (no "train" button)
1. Every sales/stock upload queues a **learning job** (a background worker picks it up; takes ~30 s for a small shop).
2. For each item it tests several methods (weekday average, 28-day average, sparse-demand method, a learning model) on the shop's own history, keeps the best-proven one, and checks itself on the **last 4 weeks it did not see**.
3. It turns forecasts + current stock + supplier delivery time into **order suggestions** (`demand during delivery + safety stock − stock − already ordered`, rounded to pack size) and a reason such as *"Sells ~14/day · 6 in stock (≈ 0.4 days) · supplier delivers in 2 days · order today."*
4. New items show **Learning**; features switch on only when the data allows (Today → *Get ready*).

## 6. Bringing data in (the most important step)
Open **Bring in data** → choose what you have → upload → check → confirm.
1. **Choose** the file type: *sales* (start here), *current stock*, *item list*, *purchases*.
2. **Upload** an **Excel (.xlsx) or CSV** exported from the billing software. (PDF and old `.xls` are refused with instructions.) Pick the store.
3. **Match columns** — RetailPulse guesses (title lines skipped, "sure"/"guess" labels); fix anything wrong and confirm how dates are written (day/month vs month/day).
4. **Check & confirm** — you see: rows ready / **cannot use** (download "rows to fix") / skipped on purpose (totals, zero quantity, postage & bank-charge lines) and items it does not recognise. It **never merges items on its own**: choose *same as…*, *create new*, or *skip*. Tick *add items I don't have yet* to auto-create.
5. **Import** — then you can **Undo** the whole upload later. Re-uploading the same period replaces, never duplicates.

**Daily routine:** upload yesterday's sales (mapping is remembered) → read *Today* → approve orders → when goods arrive, *Record delivery* → answer the 1-tap batch questions.

## 7. Expiry: notify and ask
RetailPulse cannot know which batch a sale came from, so it **records batches, warns you, and asks you** (one tap): when a new batch arrives while an older one is still in stock, when expiry is near, before a reorder, and after expiry ("sold / thrown away / returned?"). Your answer becomes the truth; unanswered batches stay marked *estimated*. Nothing ever blocks you.

## 8. What data should we import? (and from where)
**For a real shop (best):** export from the shop's billing software — 6–24 months of **item-wise sales** (date, item, quantity, price/amount), a **closing-stock report**, and the **item list with cost prices**; later the purchase register. A report that only shows *bill totals* will not work.

**To test or demo without a shop** (files on this laptop, `retailpulse/data/…`, not in git):
| Purpose | File | Upload as |
|---|---|---|
| Ready-made Vyapar-style files for Demo A | `data/clean/sim/demo-a/exports/vyapar_style_item_list.csv` → `vyapar_style_item_sales_demo-a-S1.csv` → `stock_style_closing_stock_demo-a-S1.csv` | items → sales → stock (in this order) |
| Purchases with batch & expiry | `data/clean/sim/demo-a/exports/marg_style_purchase_register.csv` | purchases (tick "add recent deliveries to my stock") |
| Messy-file test | `retailpulse/e2e/fixtures/messy_sales.csv` | sales (tick auto-create) |
| **Real billing data** (300 k rows) | `data/clean/ext/online_retail_sample.csv` (from the public Online Retail II dataset) | sales (tick auto-create) |
| Blank templates | *Bring in data → Download a sample file* | any |
Tip: use a **new registered shop** for uploads so the demo shops stay clean.

**Public datasets already processed by Hadoop** (no upload needed — they power *Insights*): Amazon grocery reviews, Store Sales (Favorita), Instacart, Dunnhumby, Online Retail II, M5 Walmart, Real Canadian Superstore, BigBasket, a synthetic waste reference. Full list, licences and use: `docs/research/04_external_datasets.md`.

## 9. How to get the most out of it
- Upload **at least 8 weeks** of sales (a year is better) and a **stock report** — otherwise there are no order suggestions.
- Add **cost prices** (profit) and **supplier delivery times** (better order timing); set **expiry tracking** per item (exact / estimated / none).
- Keep data fresh: the banner on *Today* warns when sales are more than 1–3 days old.
- Answer batch questions and run **Count stock** weekly for fresh items.
- Check *Forecasts* to see how much to trust the numbers; use *Data quality* as your to-do list.

## 10. How it is built (one paragraph each)
- **Web app:** React + Bootstrap + Recharts (mobile-first). **API:** Node/Express with logins, roles and strict separation between shops. **Database:** MongoDB (the only place app data lives; uploaded files are kept in it for audit).
- **Learning engine:** Python worker that reads queued jobs from MongoDB, makes forecasts/order suggestions and writes them back.
- **Hadoop (batch tier):** MapReduce jobs over millions of rows (reviews, grocery sales, baskets, returns, demand classes); results are loaded into MongoDB and shown in *Insights*. Every Hadoop result was re-computed independently and matched.
- **Simulation:** real Store Sales demand shape split across items, plus simulated deliveries, expiry, shrinkage and waste (labelled SIMULATED).
- **Containers & CI:** Docker images for web/API/worker; GitHub Actions runs tests and a container smoke test on every push. **Cloud part** (Cloud Storage → function → BigQuery → Looker Studio) is written and tested locally; running it on Google Cloud is the teammate's task (`retailpulse/cloud/RUNBOOK_FOR_TEAMMATE.md`).

## 11. Project map
`docs/` plans, research, **decision / development / trial-and-error logs**, evidence summary · `retailpulse/backend` API · `frontend` web app · `engine` forecasting & worker · `hadoop` jobs & runners · `simulation` data generator · `loaders` MongoDB loaders · `validation` independent checks · `cloud` function, SQL, runbook · `e2e` end-to-end scripts · `evidence` generated proof (logs, profiles, screenshots, tests).

## 12. Known limits
Billing-export layouts (Vyapar/Marg/GoFrugal/Tally) are **not verified with real files**; the app guesses columns and always asks you to confirm. Forecasts for single items are noisy (typical error ≈ 45–65 % per item per day on simulated shops, ≈ 66 % on real Walmart items; far better for categories). English only. Cloud steps not yet executed. Demo data is simulated.
