# External-dataset Hadoop jobs vs independent pandas recomputation

| Check | Keys (Hadoop) | Mismatches | Max abs diff | Status |
|---|---|---|---|---|
| X1 item support >= 3000 (Instacart) | 1900 | 0 | 0.0 | PASS |
| X1b baskets with >= 2 frequent items | 1 | 0 | 0.0 | PASS |
| X1c frequent pair counts >= 300 | 57160 | 0 | 0.0 | PASS |
| X2 reorder rate by department & aisle (map-side join) | 155 | 0 | 0.0 | PASS |
| X3 order timing (weekday x hour, recency) | 199 | 0 | 0.0 | PASS |
| X4 discount depth by dept x quarter x brand type (map-side join) | 376 | 0 | 7.275957614183426e-12 | PASS |
| X4b/X4c basket size histogram | 6 | 0 | 2.3283064365386963e-10 | PASS |
| X5 online retail: monthly revenue / returns / country / product | 4977 | 0 | 6.9998204708099365e-06 | PASS |
| X6 M5 demand class per series (30,490) | 30490 | 0 | 5.000000000143778e-07 | PASS |
| X6b series count by department x class | 12 | 0 | 0.0 | PASS |
| X7 waste by category x store (dirty case normalised) | 52 | 0 | 0.0 | PASS |
| X8 price drift across 12 monthly scrapes | 17506 | 0 | 8.881784197001252e-16 | PASS |