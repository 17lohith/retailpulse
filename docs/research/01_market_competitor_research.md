# 01 — Market & Competitor Research (RetailPulse)

*Research pass 1 — 2026-10-22. Method: web search + the two supplied Word reports. Evidence quality is marked on every claim: **[V]** vendor page, **[3P]** third-party aggregator/review site, **[G]** government/institutional, **[?]** unverified. Nothing here is primary research; see "What we could not verify".*

## 1. The headline finding (premise check)

The working assumption was: *"existing products are expensive and used only by big supermarket chains."* The evidence says this is **only half true**:

| Tier | Examples | Price evidence | Who actually uses it |
|---|---|---|---|
| Cheap billing/inventory (India) | Vyapar, Marg ERP, GoFrugal | Vyapar desktop ≈ ₹3,399/yr, mobile ≈ ₹699–942/yr [3P]; Marg one-time ≈ ₹8k–26k + 18% GST, cloud ≈ ₹17.8k/yr [3P]; GoFrugal ≈ ₹8,999/yr [3P, from a competitor's blog] to ≈ ₹18,000/yr [3P, CB Insights] | Small shops, pharmacies, wholesalers, supermarkets — i.e. **already small-store friendly** |
| Enterprise planning / forecasting | RELEX, Blue Yonder, Afresh, ToolsGroup | Quote-only, no public price [3P] | Large grocery chains (RELEX: Morrisons, Coop Denmark, Sprouts etc.) |
| Grocery forecasting for SMB | Forecasto, Prediko (Shopify-type) | Listed on Capterra, 0 / 1 reviews — immature [3P] | Unclear |

**Implication:** we cannot sell "affordable software for small stores" — that already exists at ₹3–20k/year. The true gap, if there is one, is **affordable, explainable demand forecasting + reorder advice**, which today lives either (a) in the enterprise tier (expensive, quote-only) or (b) as a thin "AI" add-on inside POS suites (GoFrugal advertises AI purchasing/forecast [V]) whose real quality is unknown.

## 2. Competitor profiles

### Indian POS / billing suites (the incumbents we must coexist with)
- **GoFrugal** — billing, inventory, purchase/reorder, BI, accounting, cloud POS, advertises AI demand forecasting [V]. Capterra: ~198 reviews, overall 4.4, **support 3.9** (lowest score); reviewers say support is good mainly via local partner/reseller, slow to reach experts [3P]. Pain = *support*, not features.
- **Marg ERP** — GST billing, barcode, reorder, **expiry/batch**, fast/slow reports [V]. Desktop-first one-time licence; AMC ≈ ₹2–5k/yr and implementation ₹3k–50k [3P]. Desktop lock-in is a weakness for cloud-era owners (inference).
- **Vyapar** — very cheap mobile/desktop billing, GST, low-stock alerts, expiry/batch [V]. Strength: price + simplicity. Likely weak at analytics depth [?].
- **Ginesys** — supermarket ERP with sell-through-based replenishment rules [V]; aimed at larger/multi-outlet retail.

### Enterprise forecasting
- **RELEX** — ML forecasting at store/SKU/day level, 700+ customers, subscription quote [3P].
- **Afresh** — fresh-food ordering, waste reduction; no public pricing [3P].
- **Blue Yonder, ToolsGroup, Shelf Engine, Upshop** — exist; **no pricing/customer data gathered (gap).**

### Adjacent Indian kirana-tech (cautionary tales)
- **1K Kirana** raised ≈ $7M (A, 2021) + $25M (B, 2022) then reportedly headed to bankruptcy/distress sale [3P, Inc42 headline, **not verified further**].
- **ShopKirana/Direct** raised $38M Series C (2022) — B2B procurement model, not analytics.
- **KiranaPro** (2024) — AI interface for kirana stores, seed stage.
- Lesson: the kirana segment burns capital when the model needs logistics/credit; a **pure software** model avoids that but has a low ARPU ceiling.

## 3. Market & user facts
- India has an estimated **15M+ kirana stores** [3P, Redseer, date unclear]; **98% single-person operated** [G, Invest India blog].
- Digital adoption claims conflict (¾ lack tech exposure for payments/procurement [Redseer] vs 84% "adopted tech to some extent" [other survey]) → *adoption depends on definition; treat both as soft.*
- Reported pain points (Flourish/Bain via search summary [3P]): ordering/checking/receiving stock 74%, inventory & placement 60%; 26% struggle to learn new tools, 16% cite cost.
- NITI Aayog 2025: cited study says 60% of kiranas lack systematic inventory control [G, quoted in Report 1 — it is a *cited* figure, not a census].

## 4. Problems users still face (synthesis)
1. **Reports ≠ decisions.** Incumbents show what happened; owner still decides quantity manually (Report 1 §2).
2. **Support & onboarding friction** (GoFrugal support 3.9/5; 26% struggle to learn tools).
3. **Fragmented data** across billing, purchase invoices, spreadsheets.
4. **Expiry/overstock** — features exist (Marg/Vyapar) but need disciplined batch entry, which small stores often skip (inference).
5. **Trust in "AI"** — unexplained forecasts are ignored; explainability is a plausible differentiator (hypothesis H2).
6. **Price cliff** between ₹3k billing apps and quote-only enterprise planners.

## 5. Positioning options (decision pending — see DECISIONS.md D-004)
| Option | Pitch | Risk |
|---|---|---|
| A. "Intelligence layer" (recommended) | Upload exports from *any* POS (Vyapar/Marg/GoFrugal/Tally) → forecasts + explainable reorder list. Does not replace billing. | Export formats vary; value depends on data quality |
| B. Full POS + analytics | Compete head-on | Crowded, low price, big support burden — **not recommended** |
| C. Enterprise planner | Compete with RELEX | Needs integrations, sales cycle, credibility — **not viable now** |

**On serving "big companies too":** treat as a *phase-2 tier* (multi-store, API ingestion, SSO), not an initial promise. Report 1 already excluded hypermarket chains from v1; this research agrees.

## 6. Pricing hypothesis (UNVALIDATED — for interviews, not for claims)
Anchor: Vyapar ≈ ₹280/month-equivalent; GoFrugal ≈ ₹750–1,500/month-equivalent. Candidate tiers: **Starter ₹299–499/mo** (1 store, weekly insights), **Growth ₹999–1,499/mo** (forecast + reorder + expiry), **Chain** custom (multi-store, API). Free tier for ≤ N SKUs as acquisition. Must be tested in owner interviews (willingness-to-pay).

## 7. What we could NOT verify (honest gaps)
- Blue Yonder / Afresh / RELEX pricing; Gofrugal's AI forecasting actual quality; any real *user complaints* about Vyapar/Marg beyond GoFrugal support.
- Market share of any Indian product (Report 1 also noted none exists).
- Exact current prices (sources disagree by 2×) — ask vendors/dealers.
- 1K Kirana outcome beyond a headline.

**Next research tasks:** trial Vyapar/Marg/GoFrugal demos; read 50+ Capterra/Play-Store reviews and code complaints by theme; 10–15 owner interviews; check Tally/Busy export formats.

## Sources
- GoFrugal pricing — https://blog.petpooja.com/industry-business-guides/retail-billing-software-price-india/ (competitor blog, May 2026), https://www.cbinsights.com/company/gofrugal, https://www.capterra.in/software/71693/gofrugal-pos-software
- Marg — https://itforsme.in/pricing/marg-erp-india, https://www.erpresearch.com/pricing/marg-erp, https://vasyerp.com/the-retail-guru/?p=61665
- Vyapar — https://www.itforsme.in/pricing/vyapar-india, https://www.techjockey.com/detail/vyapar
- RELEX/Afresh — https://erpresearch.com/erp-add-ons/demand-planning/relex, https://www.cbinsights.com/company/afresh-technologies
- Forecasto/Prediko — https://www.capterra.com/p/10039789/Forecasto/
- Kirana — https://www.investindia.gov.in/team-india-blogs/modernization-kirana-stores-india, https://businessworld.in/article/indian-kirana-stores-rapidly-adopting-digital-solutions-redseer-533445, https://inc42.com/?p=470284, https://commmerce.com/blog/how-indian-kirana-stores-cut-dead-stock-demand-forecasting/
- NITI Aayog report and vendor pages: see Report 1 references [1]–[6].
