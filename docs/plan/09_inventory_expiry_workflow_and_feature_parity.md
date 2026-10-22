# 09 — Purchase / Receiving / Expiry Workflow & Feature Parity

Status: DESIGN FOR REVIEW 2026-10-23. Not built. Evidence: GoFrugal features page and Vyapar pricing page fetched 2026-10-23 (vendor claims); Marg page fetch failed (certificate error) so Marg is covered from earlier research only.

## 1. The core insight (why expiry is hard)
- Sales files from billing software say *what sold*, almost never *which batch* sold.
- Expiry dates exist only at the moment goods arrive (printed on the pack / on the supplier invoice).
- So **the receiving step is where expiry must be captured**, and batch-level stock afterwards is *computed* (FEFO assumption) and *corrected* (stock counts).

## 2. Stock model (source of truth = a movement ledger)
`stock_movements(tenant, store, sku, batchId, type, qty, cost, date, ref)`; types: `RECEIPT, SALE, RETURN_TO_SUPPLIER, CUSTOMER_RETURN, ADJUSTMENT(damage/theft/count), EXPIRY_WRITEOFF, TRANSFER_OUT/IN, OPENING`.
- `batches(sku, batchNo?, mfgDate?, expiryDate, expirySource: entered|estimated, cost, receivedQty, remainingQty, supplier, invoiceNo)`.
- On-hand = Σ movements. **Batch depletion by sales = FEFO (first-expiry-first-out) assumption**, marked as an assumption; every stock count produces a variance record and re-aligns batch quantities.
- Money as integer paise; dates store-local.

## 3. How expiry and purchase data get in (ranked by owner effort)
| # | Method | Who/When | Notes |
|---|---|---|---|
| 1 | **Receive against a PO** (core) | Staff, at delivery, on a phone | PO already lists items/qty (created from our recommendation). Staff taps *Receive*, confirms qty, and enters expiry **only for expiry-tracked items**. Date picker; or enter MFD and auto-add shelf life; quick-copy "same expiry for all cartons". |
| 2 | **Upload purchase report/invoice export** | Owner/accountant | Excel/CSV purchase register from billing software; if it has batch/expiry columns they are mapped, else items arrive "expiry pending". |
| 3 | **Receive now, add expiry later** | Busy staff | Receipt is saved immediately; item shows a *pending expiry* chip; dashboard counter "12 items need expiry". Nothing blocks the delivery. |
| 4 | **Expiry sweep (shelf walk)** | Weekly, 10 minutes | List of strict-tracking items; staff enters nearest expiry seen on shelf → creates/corrects batch. This also fixes shops that never captured expiry before. |
| 5 | **Opening stock wizard** | Onboarding | Upload current stock report or count on phone; expiry asked only for strict categories. |
| 6 | **Estimated expiry (policy)** | Automatic | For low-risk categories use `received date + category default shelf life`, flagged `estimated`, lower confidence in alerts. |
| 7 | Barcode/GS1 date scan, camera OCR of date | — | [LATER] — most Indian packs have no machine-readable expiry. |

### Tracking policy per category (reduces data-entry burden)
| Policy | Meaning | Typical categories (assumed defaults, editable) |
|---|---|---|
| **Strict batch** | Expiry required at receiving; alerts by batch | dairy, bakery, fresh produce, meat/fish, ready-to-eat, baby food |
| **Estimate** | Auto-estimate from shelf-life default; occasional sweep | biscuits, snacks, beverages, packaged staples |
| **Off** | No expiry tracking | cleaning, hardware, utensils |
Defaults are *assumptions documented in the report*, not measured facts.

## 4. The reorder logic the owner described (made explicit)
For each item and store, daily:
- `daily_demand` = forecast (from automatic training)
- `days_of_cover = on_hand_sellable / daily_demand` where `on_hand_sellable` excludes batches that will expire before they can be sold
- `stockout_date = today + days_of_cover`
- `order_by_date = stockout_date − lead_time − safety_days`
- **Order now** if `order_by_date ≤ today`; quantity = `forecast(lead_time + review_period) + safety_stock − on_hand_sellable − on_order`, rounded to pack/MOQ, and capped by shelf life (never order more than can be sold before expiry for strict items).
- Expiry risk per batch: `expected_sales_until_expiry < remaining_qty` → *At risk*, with suggested action (move to front, pause reorder, supplier return, markdown/bundle, donate).
- Plain-language reason shown: "Sells ~14/day · 6 left (≈ 0.4 days) · supplier takes 2 days → order today."

## 5. Order lifecycle
`Recommendation → Approved/Edited → Purchase Order (draft → shared → partly received → closed/cancelled) → Receipt (GRN) → Batches created → Invoice number/amount recorded → Variance (ordered vs received, price change)`
Supplier **expiry returns** (common practice with distributors) are a movement type with a return-credit note record.

## 6. Problems the user will face here, and fixes
| Problem | Fix |
|---|---|
| Staff won't type expiry at receiving | Only strict categories require it; "add later" path; pending-expiry counter; weekly sweep; category estimate policy |
| Deliveries arrive partial, substituted, damaged, or with extra items | Receive screen supports short/over/damaged/substitute lines; variance report to supplier |
| Several expiry dates inside one delivery | Multiple batch lines per item with "split batch" button |
| POS doesn't record batch sold | FEFO assumption + stock-count reconciliation + visible "assumed" tag |
| Stock drifts (theft, breakage, billing errors) | Cycle-count screen (phone), adjustment reasons, shrinkage report |
| Cases vs pieces vs kg | Per-item unit conversion (purchase unit ↔ selling unit) |
| Supplier changes price/pack | Cost history per supplier; alert on cost change > x% |
| Owner has no stock data at all | Opening-stock wizard; features gated until done; honest "can't recommend quantities yet" |
| Multiple stores, one supplier | One consolidated PO split per store on receipt; transfers between stores |
| Alerts ignored (too many) | Prioritise by ₹ value at risk; daily cap; snooze with reason |
| Wrong expiry typed (typos) | Validation (not in past by > N, not > shelf-life × 2), confirm prompt |
| Backdated receipts | Allowed with audit trail |

## 7. Feature parity — honest scope
User request: "all the features existing software provides". **Plain assessment:** GoFrugal-class suites combine billing/POS, GST filing, accounting, CRM/loyalty, cash-shift management, warehouse, ONDC/payment integrations, and a dozen apps — decades of work and, for GST/e-invoicing, legal accuracy obligations. A student team cannot and should not clone all of it. The defensible target: **full parity on inventory, purchasing, expiry/batch, supplier and reporting; superiority on forecasting and explainable ordering; and a lite path for sales entry. Billing/GST/accounting stay in the shop's existing tool.**

| Feature area (source) | GoFrugal [V] | Vyapar [V] | Marg [earlier research] | RetailPulse plan |
|---|---|---|---|---|
| Counter billing / POS, exchanges, multi-price | ✔ | ✔ | ✔ | **Out of v1.** Lite "quick sale / end-of-day entry" only (for shops without software) |
| GST invoices, GSTR returns, e-invoice | ✔ | ✔ | ✔ | **Out** (compliance risk) – ingest their sales instead |
| Accounting: ledgers, day book, trial balance, bank rec | ✔ | partial | ✔ | **Out** |
| Item master, categories, units, barcodes | ✔ | ✔ | ✔ | **V1** (+ unit conversions, aliases) |
| Real-time stock, low-stock alerts, auto-adjust | ✔ | ✔ | ✔ | **V1** |
| Batch & expiry tracking, expiry reports | (not on page) | ✔ (general) | ✔ | **V1 – primary strength**, with risk scoring |
| Purchase orders, goods receiving (GRN) | ✔ | ✔ | ✔ | **V1** |
| 3-way match PO–GRN–invoice | ✔ | – | – | **V1-lite** (PO vs GRN + invoice amount); full 3-way [LATER] |
| Supplier master, supplier price history, returns/credit notes | ✔ | partial | ✔ | **V1** (payables/payments out) |
| Reorder points & auto-replenishment | ✔ ("AI autonomous") | alerts | ✔ | **V1 advisory + explainable**; never auto-orders |
| Demand forecasting | claimed | – | – | **V1 core differentiator** (backtested, honest) |
| Slow/dead stock, clearance suggestions | ✔ | – | ✔ | **V1** |
| Multi-store consolidated view, inter-store transfers, single PO | ✔ | – | partial | **V1** (transfers P1) |
| Stock counting app / goods-inward app | ✔ (GoSure) | – | – | **V1 PWA** screens (count, receive) |
| Reports: sales, margin/profit, ABC, valuation, scheduled email | ✔ | ✔ | ✔ | **V1** (profit uses cost where provided) |
| Barcode label design/printing | ✔ | – | ✔ | **P2** (PDF label sheet) |
| Roles, backup/restore | ✔ | ✔ | ✔ | **V1** |
| Loyalty, CRM, offers, SMS/WhatsApp marketing | ✔ | partial | ✔ | **Out** (customer PII; future) |
| Cash drawer / shift / petty cash | ✔ | – | – | **Out** |
| Integrations (ONDC, payments, banks) | ✔ | – | – | **Out/future** |
| Mobile apps | native apps | ✔ | ✔ | **Responsive PWA** |

## 8. Impact on the build plan (additions to 06/07)
New collections/modules: `suppliers, purchase_orders, receipts, batches, stock_movements, stock_counts, adjustments, supplier_returns, transfers, unit_conversions, category_policies`. New screens: *Receive delivery*, *Expiry sweep*, *Stock count*, *Pending expiry*, *Supplier & cost history*, *Purchase orders*, *Expiry board*, *Stock valuation*, *ABC/slow/dead stock*, *Quick sale entry (lite)*. Simulator (L3) must emit purchase orders, receipts with batches/expiry, adjustments and write-offs, plus Vyapar/Marg-style purchase and sales export files so the whole workflow can be demonstrated.

## 9. Decision requested (D-017)
Approve the scope boundary: **"Inventory, Purchase & Expiry Intelligence System" (full parity in those areas) — billing/GST/accounting excluded, with a lite quick-sale entry for shops without billing software.** Alternative: add a basic counter-billing screen (no GST filing) as a Full Stack showcase — larger effort, recommended only after P0/P1 are done.

---
## 10. ADDENDUM 2026-10-23 — Simplified expiry (supersedes §3–§4 where they conflict; decision D-018)
User decision: do **not** attempt batch-level depletion intelligence. RetailPulse **records batches, notifies, and asks the owner**; the owner's answers are the ground truth.

**Batch lifecycle:** `Received → Active (estimate shown as "about N left") → Confirmed (owner states remaining) → Finished | Expired-unresolved → Resolved (sold / discarded / returned to supplier)`.

**Prompts (all one-tap, never blocking):**
| Trigger | Message | Answers |
|---|---|---|
| New batch received while older batch of the same item has stock | "About 18 left from the older batch (exp 12 Nov). Sell these first." | Noted · Finished · Still have N · Damaged/expired N |
| Before a recommended reorder for an expiry-tracked item | "How many are left from the older batch?" | same |
| Expiry within the category's alert window | "N units expire in D days. Sell first / mark down / return to supplier?" | Acknowledge · action chosen |
| Expiry date passed, batch unresolved | "What happened to these N units?" | Sold · Discarded · Returned to supplier |
| Stock count | counts override all estimates | — |

**Rules:** estimates are labelled "about"/"estimated"; max questions per day capped and prioritised by ₹ value; ignored prompts never block ordering; unanswered batches keep an *unconfirmed* tag; every answer is stored (`batch_confirmations`) and used for (a) waste reporting, (b) checking forecast sell-through, (c) owner-responsiveness metrics.

**Removed from v1:** automatic expiry-risk optimisation, expected-sales-before-expiry scoring, order-quantity caps by shelf life (kept only as a simple rule: "don't order more if unconfirmed older batch is within alert window").
