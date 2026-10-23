# Favorita (Store Sales) 28-day hold-out — REAL data
Series: 1543 (store × family). Test window 2017-07-19 → 2017-08-15.

| Model | WAPE | MAE | RMSE | MASE | Bias % |
|---|---|---|---|---|---|
| gbm | 0.142 | 74.9 | 257.1 | 1.13 | -0.1 |
| selector_guarded | 0.144 | 76.2 | 259.9 | 1.17 | -0.2 |
| selector | 0.148 | 78.0 | 264.6 | 1.21 | +0.2 |
| ets | 0.162 | 85.5 | 288.7 | 1.26 | +1.7 |
| seasonal_avg4 | 0.166 | 87.6 | 296.9 | 1.31 | +1.8 |
| snaive7 | 0.174 | 91.5 | 327.7 | 1.43 | -1.6 |
| ma7 | 0.217 | 114.6 | 374.5 | 1.46 | -1.6 |
| ma28 | 0.221 | 116.6 | 364.4 | 1.47 | +1.8 |
| naive | 0.259 | 136.6 | 462.1 | 1.71 | -12.4 |

Best model: **gbm** (WAPE 0.142); best baseline: **seasonal_avg4** (WAPE 0.166); change vs best baseline: +14.5%.
WAPE = Σ|error| / Σ actual (lower is better). MASE scaled by in-sample seasonal-naive(7) error.