"""Analog-year search engine.

The query is a 12-month ONI trajectory made of the most recent observations
followed by the projection, ending on the last month shown in the app. It is
compared against every historical 12-month window that ends in the same
calendar month (±1 month of phase shift, slightly penalised). Two metrics are
combined:

* weighted RMSE (amplitude match; forecast months are down-weighted by their
  hindcast uncertainty)
* weighted Pearson correlation (shape / phase match)

``similarity = 100 * [0.5 * exp(-(rmse/0.75)^2) + 0.5 * max(r, 0)] - shift_penalty``

This is a k-nearest-neighbour search in trajectory space; the top-3
non-overlapping windows are the analogs.
"""
from __future__ import annotations

from typing import Dict, List

import numpy as np

from . import config
from .forecast import from_index


def _wcorr(a: np.ndarray, b: np.ndarray, w: np.ndarray) -> float:
    ma, mb = np.average(a, weights=w), np.average(b, weights=w)
    cov = np.average((a - ma) * (b - mb), weights=w)
    va, vb = np.average((a - ma) ** 2, weights=w), np.average((b - mb) ** 2, weights=w)
    if va <= 1e-9 or vb <= 1e-9:
        return 0.0
    return float(cov / np.sqrt(va * vb))


def find_analogs(x: np.ndarray, last_obs: int, query: np.ndarray, query_end: int,
                 query_weights: np.ndarray, n: int = config.N_ANALOGS) -> List[Dict]:
    W = len(query)
    q_start = query_end - W + 1
    cands = []
    for j in range(W - 1, last_obs + 1):
        shift = (j - query_end) % 12
        shift = min(shift, 12 - shift)
        if shift > 1:
            continue
        if j >= q_start - 6:  # must not overlap the current window
            continue
        w = x[j - W + 1:j + 1]
        if np.isnan(w).any():
            continue
        rmse = float(np.sqrt(np.sum(query_weights * (w - query) ** 2) / query_weights.sum()))
        r = _wcorr(w, query, query_weights)
        sim = 100 * (0.5 * np.exp(-(rmse / 0.75) ** 2) + 0.5 * max(r, 0.0)) - 3.0 * shift
        cands.append(dict(end=j, rmse=rmse, r=r, similarity=float(sim), shift=shift))
    cands.sort(key=lambda c: -c["similarity"])
    chosen: List[Dict] = []
    for c in cands:
        if all(abs(c["end"] - o["end"]) >= 18 for o in chosen):
            chosen.append(c)
        if len(chosen) == n:
            break
    return chosen


def _event_in_window(start: int, end: int):
    best = None
    for s, p, e, peak in config.ENSO_EVENTS:
        py, pm = (int(v) for v in p.split("-"))
        pi = (py - 1950) * 12 + pm - 1
        if start - 2 <= pi <= end + 2 and (best is None or abs(peak) > abs(best[3])):
            best = (s, p, e, peak)
    return best


def describe(x: np.ndarray, cand: Dict, W: int) -> Dict:
    end = cand["end"]
    start = end - W + 1
    window = x[start:end + 1]
    sy, sm = from_index(start)
    ey, em = from_index(end)
    label = f"{sy}-{ey}" if sy != ey else str(sy)
    k_peak = int(np.argmax(np.abs(window)))
    peak_val = float(window[k_peak])
    py, pm = from_index(start + k_peak)
    ev = _event_in_window(start, end)
    narrative = None
    if ev is not None:
        ev_start_year = int(ev[0][:4])
        ev_peak_year = int(ev[1][:4])
        narrative = (config.EVENT_NARRATIVES.get(ev_start_year)
                     or config.EVENT_NARRATIVES.get(ev_peak_year)
                     or config.EVENT_NARRATIVES.get(ev_start_year + 1))
    kind = "El Niño" if peak_val >= 0.5 else "La Niña" if peak_val <= -0.5 else "condiciones neutrales"
    intensity = ("extremo" if abs(peak_val) >= 2.0 else "fuerte" if abs(peak_val) >= 1.5
                 else "moderado" if abs(peak_val) >= 1.0 else "débil" if abs(peak_val) >= 0.5 else "")
    summary = (f"Entre {config.MONTHS_ES[sm-1]} de {sy} y {config.MONTHS_ES[em-1]} de {ey} el ONI pasó de "
               f"{window[0]:+.1f} a {window[-1]:+.1f} °C, con un pico de {peak_val:+.1f} °C en "
               f"{config.MONTHS_ES[pm-1]} de {py}: un episodio de {kind}{' ' + intensity if intensity and kind != 'condiciones neutrales' else ''}.")
    if narrative is None:
        if kind == "El Niño":
            narrative = ("Patrón típico de El Niño: más lluvia en la Cuenca del Plata y la costa norte de Perú y Ecuador, "
                         "y déficit en la Amazonía, el nordeste brasileño, Colombia, Venezuela y Centroamérica.")
        elif kind == "La Niña":
            narrative = ("Patrón típico de La Niña: déficit de lluvias en la Pampa, Uruguay y el sur de Brasil, "
                         "y excesos en Colombia, Venezuela y el norte de Sudamérica.")
        else:
            narrative = "Ciclo sin un episodio ENSO dominante: la variabilidad regional estuvo gobernada por otros forzantes."
    return dict(
        label=label,
        start=f"{sy}-{sm:02d}", end=f"{ey}-{em:02d}",
        similarity=round(cand["similarity"], 1),
        rmse=round(cand["rmse"], 3), correlation=round(cand["r"], 3), phase_shift=cand["shift"],
        peak=dict(value=round(peak_val, 2), month=f"{py}-{pm:02d}"),
        kind=kind, intensity=intensity,
        summary=summary, narrative=narrative,
        oni=[dict(month=f"{from_index(start + k)[0]}-{from_index(start + k)[1]:02d}", value=round(float(v), 2))
             for k, v in enumerate(window)],
    )
