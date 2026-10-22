# 08 — User Problems & Mitigations (pre-mortem)

Status: DESIGN 2026-10-23. Rows marked **[V1]** are planned for the first build; **[LATER]** documented as future scope; **[LIMIT]** cannot be fixed, only handled honestly.

## A. What the owner uploads (clarification)
- v1 input = **Excel (.xlsx) or CSV exported from their billing software**: an *item-wise sales report* (date, item, quantity, optionally price/bill no.). Their real data.
- First upload = history (6–24 months); afterwards small daily/weekly files.
- **Not supported v1:** PDF (table-in-picture, error-prone), scanned bills/OCR, photos [LATER], live POS sync/agent/API [LATER].
- **Unverified assumption:** exact export layouts of Vyapar/Marg/GoFrugal/Tally have not been checked against real files → need samples (U-1). Templates will be labelled "unverified" until tested.
- Alternative doors: **Demo store** (our simulated data, instant, badged SIMULATED) and **Manual entry** (products, opening stock, deliveries, daily sales form/template for shops without software).

## B. Problem → fix table
### B1. Getting the file
| # | Problem | Mitigation | |
|---|---|---|---|
| 1 | Owner doesn't know how to export | Per-software illustrated guide inside the upload screen; "need help?" fallback to send file for a check | V1 |
| 2 | Exports the wrong report (bill totals, no items) | Detect missing item/quantity columns → message naming the correct report | V1 |
| 3 | Software only offers PDF/print | Explain; suggest Excel option or manual template; PDF table import | LATER |
| 4 | Owner uses only a phone | Export to phone → share/upload via file picker; responsive upload; Google Drive picker | V1/LATER |
| 5 | History limited (software keeps/prints few months) | Accept short history; readiness meter shows what is possible | V1 |
| 6 | Owner has no billing software | Manual entry + downloadable template | V1 |
| 7 | Multiple files (per month, per store) | Multi-file upload; files merged by date; store chosen per file or from a column | V1 |

### B2. File quality
| # | Problem | Mitigation | |
|---|---|---|---|
| 8 | Title rows, totals rows, merged/hidden cells above the table | Header-row detection; skip total/subtotal lines; list what was skipped | V1 |
| 9 | Ambiguous dates (03/04), text dates, Excel serial numbers | Whole-column inference; ask only if still ambiguous; show parsed sample | V1 |
| 10 | Encoding/decimal issues (BOM, Latin-1, comma decimals, ₹/Rs symbols, lakh-style commas) | Encoding sniffing; locale-aware numeric parsing | V1 |
| 11 | Legacy .xls, .xlsb, password-protected, corrupt, formulas without cached values | Detect + plain instruction (re-save as .xlsx/CSV) | V1 |
| 12 | Very large files / slow mobile data | Chunked resumable upload, gzip, streaming parse, row/size limits with auto-split advice | V1 |
| 13 | Duplicate / overlapping uploads | Row fingerprints, upsert, **Undo import** | V1 |
| 14 | Same item, different names or units (kg/g/pack, spelling) | Barcode/SKU first → exact → fuzzy *proposal*; unit conversion table per item; never auto-merge | V1 |
| 15 | Item renamed/repacked over time | Merge tool with history; alias list | V1 |
| 16 | Returns, free items, discounts, delivery/service lines, weighed items | Returns = negative qty flagged; non-product lines ignored with report; weighed items in kg | V1 |
| 17 | Backdated or edited bills | Latest upload wins per fingerprint; changes reported | V1 |
| 18 | Prices include/exclude GST | Ask once; store ex-tax and inc-tax if known | V1 |
| 19 | Outliers / typos (qty 1000 instead of 10) | Outlier flag vs item history; owner can accept/ignore; excluded from training if ignored | V1 |
| 20 | Wrong columns mapped | Mapping preview with sample rows + confidence; saved mapping editable | V1 |

### B3. Making the numbers meaningful
| # | Problem | Mitigation | |
|---|---|---|---|
| 21 | Stock-outs look like low demand | Mark zero-stock days when stock data exists; otherwise warn "sales may understate demand" | V1 / [LIMIT] |
| 22 | No stock, expiry, cost data supplied | Feature gating; "add X to unlock Y" prompts; simple stock-count screen | V1 |
| 23 | New items, short history | "Learning" label; category-level estimate; no false precision | V1 |
| 24 | Festivals, weather, local events, promotions | Owner can tag dates/promotions; calendar of Indian festivals bundled; forecast ranges shown | V1 / LATER |
| 25 | Supplier lead time, MOQ, pack size, credit terms unknown | Defaults + per-supplier setup; recommendations state the assumption used | V1 |
| 26 | Seasonal shock / lockdown / price change distorts history | "Ignore this period" control for training | V1 |
| 27 | Forecast wrong → money lost | Advisory only; interval shown; accuracy history visible; baseline fallback; no savings claims | V1 / [LIMIT] |

### B4. Trust, habit, usability
| # | Problem | Mitigation | |
|---|---|---|---|
| 28 | "Why should I trust this?" | Every suggestion shows inputs and reason; editable; reject with reason | V1 |
| 29 | Owner forgets to upload → stale data | Freshness banner, confidence downgrade, reminders (email now, WhatsApp/SMS later) | V1 / LATER |
| 30 | Too much jargon/too many screens | One "Today" action list; plain words; tooltips; guided empty states | V1 |
| 31 | Language | English v1 (decision R-4); regional languages | LATER |
| 32 | Staff misuse / sees margins | Roles: staff can't see cost/margin or approve orders; audit log | V1 |
| 33 | Shared login, lost password | Per-user accounts, password reset by email | V1 |
| 34 | Privacy worries | Plain data-ownership statement; export-all and delete-all; no customer personal data collected; encryption in transit/at rest on deployment | V1 / DPDP review |
| 35 | Internet down in shop | Upload can wait; viewing cached last Today list [LATER offline PWA] | LATER |
| 36 | Multi-store owner confusion | Store switcher; per-store and combined views | V1 |

### B5. System behaviour we must guarantee
| # | Risk | Guard |
|---|---|---|
| 37 | Silent data loss/corruption | Quarantine not drop; counts reconcile (rows in = ok + fixed + rejected); tests assert this |
| 38 | Cross-shop data leak | `tenantId` enforced in middleware; automated cross-tenant tests |
| 39 | Long job blocks UI | Async jobs with progress, retry, timeout; UI never waits on training |
| 40 | Worker crash mid-import | Staged commit + transactions (single-node replica set); job leases re-queue |
| 41 | Model silently degrades | Drift monitor; auto-fallback to baseline; visible accuracy |
| 42 | Hadoop/Python/Node version breakage | Pinned versions, Docker images, CI |

## C. Things we deliberately will NOT do (v1)
Auto-place orders with suppliers · promise savings · parse PDFs/photos of bills · collect end-customer personal data · cross-shop learning without opt-in.

## D. Test plan for this document
- Build a **fixture library** of messy files (title rows, bad dates, duplicates, negative qty, mixed units, 100k+ rows, BOM/Latin-1, .xls) and automated tests asserting rows-in = ok + fixed + rejected.
- Usability check with 2–3 non-technical people using the demo script and a stopwatch (targets in plan/07 §0).
