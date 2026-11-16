"""Statistical ONI projection.

Hybrid ensemble of two classical ENSO forecasting approaches:

* **Seasonal linear regression** (Markov-like, one model per start month and
  lead): ``ONI(t+L) = a + b*ONI(t) + c*[ONI(t) - ONI(t-3)]``. The tendency term
  captures growth/decay phase; fitting per calendar start month captures the
  spring predictability barrier and the boreal-winter phase locking.
* **Analog k-NN**: the last 12 months are matched (weighted Euclidean
  distance, recent months weigh more) against every historical window that
  ends in the same calendar month; the continuations of the K nearest windows
  are averaged with Gaussian kernel weights.

For each lead the blend weight is chosen by leave-one-year-out hindcasting
(1980-present) and the residual RMSE of that hindcast defines the 80 %
uncertainty band.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np

MonthKey = Tuple[int, int]
BASE_YEAR = 1950
Z80 = 1.2816


def to_index(key: MonthKey) -> int:
    return (key[0] - BASE_YEAR) * 12 + key[1] - 1


def from_index(i: int) -> MonthKey:
    return (BASE_YEAR + i // 12, i % 12 + 1)


def to_array(values: Dict[MonthKey, float]) -> np.ndarray:
    last = to_index(max(values))
    arr = np.full(last + 1, np.nan)
    for k, v in values.items():
        arr[to_index(k)] = v
    return arr


@dataclass
class Forecast:
    start: int                       # index of last observation
    leads: List[int]
    mean: np.ndarray
    lower: np.ndarray
    upper: np.ndarray
    rmse: np.ndarray
    corr: np.ndarray
    blend_weight: np.ndarray         # weight of the regression member
    regression: np.ndarray
    knn: np.ndarray


# ----------------------------------------------------------------- regression
def _regression_samples(x: np.ndarray, start_month: int, lead: int, exclude: Tuple[int, int] = (-1, -1)):
    rows, ys = [], []
    for i in range(3, len(x) - lead):
        if i % 12 != start_month or exclude[0] <= i <= exclude[1]:
            continue
        if np.isnan(x[i]) or np.isnan(x[i - 3]) or np.isnan(x[i + lead]):
            continue
        rows.append([1.0, x[i], x[i] - x[i - 3]])
        ys.append(x[i + lead])
    return np.asarray(rows), np.asarray(ys)


def regression_predict(x: np.ndarray, i: int, lead: int, exclude=(-1, -1)) -> float:
    A, y = _regression_samples(x, i % 12, lead, exclude)
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    return float(np.sum(coef * np.array([1.0, x[i], x[i] - x[i - 3]])))


# ------------------------------------------------------------------------ kNN
WINDOW = 12
K = 8
_WEIGHTS = np.linspace(0.35, 1.0, WINDOW)


def knn_predict(x: np.ndarray, i: int, lead: int, exclude_radius: int = 24, limit: int = None) -> float:
    q = x[i - WINDOW + 1:i + 1]
    limit = len(x) if limit is None else limit
    cands = []
    for j in range(WINDOW - 1, limit - lead):
        if j % 12 != i % 12 or abs(j - i) <= exclude_radius:
            continue
        w = x[j - WINDOW + 1:j + 1]
        if np.isnan(w).any() or np.isnan(x[j + lead]):
            continue
        d = np.sqrt(np.sum(_WEIGHTS * (w - q) ** 2) / _WEIGHTS.sum())
        cands.append((d, x[j + lead]))
    cands.sort(key=lambda c: c[0])
    top = cands[:K]
    h = max(np.median([d for d, _ in top]), 0.05)
    wts = np.array([np.exp(-0.5 * (d / h) ** 2) for d, _ in top])
    vals = np.array([v for _, v in top])
    return float(np.sum(wts * vals) / np.sum(wts))


# ------------------------------------------------------------------- hindcast
def hindcast(x: np.ndarray, start_month: int, lead: int, first_year: int = 1980):
    """Leave-one-year-out hindcast of both members for one start month."""
    obs, reg, knn = [], [], []
    for i in range(to_index((first_year, 1)), len(x) - lead):
        if i % 12 != start_month or np.isnan(x[i + lead]):
            continue
        excl = (i - 12, i + 12)
        reg.append(regression_predict(x, i, lead, exclude=excl))
        # kNN only sees the past + future outside a 2-year exclusion radius.
        knn.append(knn_predict(x, i, lead, exclude_radius=24))
        obs.append(x[i + lead])
    return np.asarray(obs), np.asarray(reg), np.asarray(knn)


def project(values: Dict[MonthKey, float], max_lead: int) -> Forecast:
    x = to_array(values)
    i = len(x) - 1
    leads = list(range(1, max_lead + 1))
    mean, rmse, corr, wbest, regs, knns = [], [], [], [], [], []
    for L in leads:
        obs, reg_h, knn_h = hindcast(x, i % 12, L)
        best = (1e9, 1.0)
        for w in np.linspace(0, 1, 11):
            err = np.sqrt(np.mean((w * reg_h + (1 - w) * knn_h - obs) ** 2))
            if err < best[0]:
                best = (err, w)
        err, w = best
        blend_h = w * reg_h + (1 - w) * knn_h
        r = float(np.corrcoef(blend_h, obs)[0, 1])
        reg_now = regression_predict(x, i, L)
        knn_now = knn_predict(x, i, L)
        mean.append(w * reg_now + (1 - w) * knn_now)
        rmse.append(err)
        corr.append(r)
        wbest.append(w)
        regs.append(reg_now)
        knns.append(knn_now)
    mean, rmse = np.asarray(mean), np.asarray(rmse)
    return Forecast(
        start=i, leads=leads, mean=mean,
        lower=mean - Z80 * rmse, upper=mean + Z80 * rmse,
        rmse=rmse, corr=np.asarray(corr), blend_weight=np.asarray(wbest),
        regression=np.asarray(regs), knn=np.asarray(knns),
    )


def classify(oni: float) -> str:
    if oni >= 1.5:
        return "El Niño fuerte"
    if oni >= 0.5:
        return "El Niño"
    if oni <= -1.5:
        return "La Niña fuerte"
    if oni <= -0.5:
        return "La Niña"
    return "Neutral"


def phase(oni: float) -> str:
    return "nino" if oni >= 0.5 else "nina" if oni <= -0.5 else "neutral"
