# Hadoop vs independent recomputation

Generated 2026-10-22T21:29:43.327985+00:00 - runtime 125 s

| Check | Keys (Hadoop) | Mismatches | Max abs diff | Status |
|---|---|---|---|---|
| J1 token frequency (bucket|token >= 50) | 57402 | 0 | 0.0 | PASS |
| J2 per-product count/rating-sum/verified/helpful/histogram | 603182 | 0 | 1.0 | PASS |
| J3 monthly review volume | 263 | 0 | 0.0 | PASS |
| J6 verified / length-bucket helpfulness | 6 | 0 | 0.0 | PASS |
| J4 reduce-side join (per-product reviews, rating sum) | 603182 | 0 | 0.0 | PASS |
| J4b price band x category | 701 | 0 | 0.0 | PASS |
| J5 brand ranking | 80350 | 0 | 0.0 | PASS |
| J4 join integrity | - | - | - | PASS |
| J7 sales by family x month (pandas) | 1848 | 0 | 5.00003807246685e-07 | PASS |
| J8 promo vs non-promo (pandas) | 65 | 0 | 5.00120222568512e-07 | PASS |
| J9 weekday profile (pandas) | 609 | 0 | 1.300126314163208e-06 | PASS |
| J10 waste by family (map-side join) vs pandas | 115 | 0 | 0.0 | PASS |