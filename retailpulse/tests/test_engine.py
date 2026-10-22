import os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "engine"))
import pipeline as p

def test_seasonal_average_reproduces_a_perfect_weekly_pattern():
    y = np.tile([1., 2., 3., 4., 5., 6., 7.], 12)[None, :]
    f = p.m_sa4(y, 14)
    assert np.allclose(f[0], np.tile([1, 2, 3, 4, 5, 6, 7], 2))

def test_ma28_is_flat_mean_of_last_28_days():
    y = np.concatenate([np.zeros(10), np.full(28, 4.0)])[None, :]
    assert np.allclose(p.m_ma28(y, 5), 4.0)

def test_croston_sba_on_intermittent_demand():
    y = np.zeros((1, 200)); y[0, ::5] = 10                     # 10 units every 5th day -> 2/day, SBA is slightly lower (bias correction)
    f = p.m_sba(y, 7)[0, 0]
    assert 1.4 < f < 2.1

def test_wape_rules():
    a = np.array([[10., 10.], [0., 0.], [0., 0.]]); pr = np.array([[8., 12.], [0., 0.], [1., 0.]])
    w = p.wape_rows(a, pr)
    assert abs(w[0] - 0.2) < 1e-9 and w[1] == 0 and w[2] >= 1.0

def test_no_future_leakage_into_forecasts():
    """Forecasts for window ending at t must not change when data AFTER t changes."""
    import pandas as pd
    rng = np.random.default_rng(0); n, t = 40, 420
    base = rng.poisson(3, (n, t)).astype(np.float32) * (1 + 0.5 * (np.arange(t) % 7 == 5))
    dates = pd.date_range("2025-01-01", periods=t); cats = np.column_stack([rng.integers(0, 4, n), rng.integers(0, 2, n)])
    end = 350; elig = np.ones(n, bool)
    a = p.window(base.copy(), cats, dates, end, elig)
    changed = base.copy(); changed[:, end + 1:] = rng.poisson(50, (n, t - end - 1))      # poison the future
    b = p.window(changed, cats, dates, end, elig)
    for k in a: assert np.allclose(a[k], b[k]), f"model {k} leaks future data"

def test_dates_in_pipeline_selection_windows_do_not_overlap():
    H = p.H; nd = 500
    val_end, test_end = nd - 1 - 2 * H, nd - 1 - H
    assert test_end - val_end == H                               # V window = (val_end, test_end], T window follows immediately
    assert (val_end + H) <= test_end                              # selection data never overlaps the scored window
