"""City-level climatology, ERA5-calibrated ENSO sensitivity and validation."""
from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

import numpy as np

from . import config
from .forecast import BASE_YEAR, to_index
from .model import coefficients, response

CLIM_START, CLIM_END = 1991, 2020
CLIM_MID = 2006.0


def monthly_arrays(era: dict) -> Tuple[np.ndarray, np.ndarray]:
    last = to_index(tuple(int(v) for v in era["last"].split("-")))
    T = np.full(last + 1, np.nan)
    P = np.full(last + 1, np.nan)
    for k, (t, p) in era["monthly"].items():
        i = to_index(tuple(int(v) for v in k.split("-")))
        T[i], P[i] = t, p
    return T, P


def climatology(T: np.ndarray, P: np.ndarray):
    ct, cp = np.zeros(12), np.zeros(12)
    for m in range(12):
        idx = [(y - BASE_YEAR) * 12 + m for y in range(CLIM_START, CLIM_END + 1)]
        ct[m] = np.nanmean(T[idx])
        cp[m] = np.nanmean(P[idx])
    return ct, cp


def warming_trend(T: np.ndarray) -> float:
    """Linear trend (°C/year) of the annual mean, 1980 to last complete year."""
    ys, vals = [], []
    for y in range(1980, BASE_YEAR + len(T) // 12):
        seg = T[(y - BASE_YEAR) * 12:(y - BASE_YEAR) * 12 + 12]
        if len(seg) == 12 and not np.isnan(seg).any():
            ys.append(y)
            vals.append(seg.mean())
    return float(np.polyfit(ys, vals, 1)[0])


def decimal_year(i: int) -> float:
    return BASE_YEAR + i // 12 + (i % 12 + 0.5) / 12


def _fit_piecewise(oni: np.ndarray, y: np.ndarray):
    """y = c + bP*max(oni,0) + bN*min(oni,0); returns (bP, bN, seP, seN)."""
    X = np.column_stack([np.ones_like(oni), np.maximum(oni, 0), np.minimum(oni, 0)])
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - np.einsum("nf,f->n", X, coef)
    dof = max(1, len(y) - 3)
    s2 = float(np.sum(resid * resid)) / dof
    cov = s2 * np.linalg.pinv(np.einsum("nf,ng->fg", X, X))
    return coef[1], coef[2], math.sqrt(max(cov[1, 1], 1e-9)), math.sqrt(max(cov[2, 2], 1e-9))


def _posterior(prior: float, prior_sd: float, est: float, se: float) -> float:
    a, b = 1.0 / prior_sd ** 2, 1.0 / se ** 2
    return (a * prior + b * est) / (a + b)


def calibrate(city: dict, T: np.ndarray, P: np.ndarray, oni: np.ndarray, slope: float) -> dict:
    """Blend kernel-model coefficients with the ERA5 empirical ENSO regression."""
    ct, cp = city["clim_t"], city["clim_p"]
    n = min(len(T), len(oni))
    out = {"rP": [], "rN": [], "tP": [], "tN": [], "emp": []}
    val_obs, val_mod, val_obs_t, val_mod_t = [], [], [], []
    for m in range(12):
        model = coefficients([city["lat"]], [city["lng"]], [city["elevation"]], m)
        mP, mN, tP0, tN0 = (float(model[k][0]) for k in ("rP", "rN", "tP", "tN"))
        mm = [(m - 1) % 12, m, (m + 1) % 12]
        clim3 = sum(cp[k] for k in mm)
        rows_o, rows_r, rows_t = [], [], []
        for i in range(1, n - 1):
            if i % 12 != m or np.isnan(oni[i]):
                continue
            seg_p, seg_t = P[i - 1:i + 2], T[i - 1:i + 2]
            if np.isnan(seg_p).any() or np.isnan(seg_t).any():
                continue
            ta = float(seg_t.mean() - np.mean([ct[k] for k in mm]) - slope * (decimal_year(i) - CLIM_MID))
            rows_o.append(oni[i]); rows_t.append(ta)
            rows_r.append(float(np.clip(100 * (seg_p.sum() / clim3 - 1), -100, 300)) if clim3 >= 20 else np.nan)
        o, r, t = np.asarray(rows_o), np.asarray(rows_r), np.asarray(rows_t)
        bTP, bTN, seTP, seTN = _fit_piecewise(o, t)
        tP = _posterior(tP0, 0.6 * abs(tP0) + 0.12, bTP, seTP)
        tN = _posterior(tN0, 0.6 * abs(tN0) + 0.12, bTN, seTN)
        ok = ~np.isnan(r)
        if ok.sum() >= 30:
            bRP, bRN, seRP, seRN = _fit_piecewise(o[ok], r[ok])
            rP = _posterior(mP, 0.6 * abs(mP) + 4.0, bRP, seRP)
            rN = _posterior(mN, 0.6 * abs(mN) + 4.0, bRN, seRN)
            for oo, rr in zip(o[ok], r[ok]):
                val_obs.append(rr); val_mod.append(response(oo, mP, mN, 0, 0, 0)[1])
        else:  # dry season: percentages are not meaningful, keep the model prior
            bRP = bRN = float("nan")
            rP, rN = mP, mN
        for oo, tt in zip(o, t):
            val_obs_t.append(tt); val_mod_t.append(response(oo, 0, 0, tP0, tN0, 0)[0])
        out["rP"].append(rP); out["rN"].append(rN); out["tP"].append(tP); out["tN"].append(tN)
        out["emp"].append(dict(model_rP=round(mP, 2), era5_rP=None if math.isnan(bRP) else round(float(bRP), 2),
                               model_tP=round(tP0, 3), era5_tP=round(float(bTP), 3)))

    def corr(a, b):
        a, b = np.asarray(a), np.asarray(b)
        if len(a) < 10 or a.std() < 1e-9 or b.std() < 1e-9:
            return None
        return round(float(np.corrcoef(a, b)[0, 1]), 3)

    out["validation"] = dict(rain_r=corr(val_obs, val_mod), temp_r=corr(val_obs_t, val_mod_t),
                             n_rain=len(val_obs), n_temp=len(val_obs_t))
    return out


# ------------------------------------------------------------ recommendations
def recommendations(peak: dict, crop: Optional[Tuple[str, str]], dam: Optional[Tuple[float, str]]) -> List[dict]:
    """Practical recommendations from the month with the highest risk per sector."""
    recs = []
    a, e, h = peak["agri"], peak["energy"], peak["health"]
    rain, temp = a["rain"], a["temp"]
    crop_name = crop[1] if crop else "los cultivos de la zona"
    if a["risk"] >= 25:
        if rain <= -10:
            txt = (f"Déficit hídrico previsto en {a['month_name']}: planificar riego suplementario, escalonar fechas "
                   f"de siembra y priorizar variedades tolerantes a sequía de {crop_name}.")
        elif rain >= 20:
            txt = (f"Exceso de lluvias previsto en {a['month_name']}: reforzar drenajes, vigilar enfermedades fúngicas "
                   f"en {crop_name} y planificar la logística de cosecha ante caminos anegados.")
        else:
            txt = (f"Estrés térmico previsto en {a['month_name']}: ajustar calendarios de riego y aplicaciones, y "
                   f"monitorear el llenado de grano/fruto de {crop_name}.")
        recs.append(dict(sector="agro", level=_lvl(a["risk"]), text=txt))
    if e["risk"] >= 25:
        if e["rain"] <= -10 and dam:
            txt = (f"Menor aporte hídrico a {dam[1]} hacia {e['month_name']}: anticipar despacho térmico, "
                   f"gestionar reservas y preparar campañas de ahorro energético.")
        elif e["rain"] >= 40 and dam:
            txt = (f"Caudales altos esperados en {dam[1]}: revisar protocolos de vertimiento y alertas aguas abajo.")
        else:
            txt = (f"Picos de demanda eléctrica por calor en {e['month_name']}: reforzar respaldo en horas punta "
                   f"y promover eficiencia en climatización.")
        recs.append(dict(sector="energia", level=_lvl(e["risk"]), text=txt))
    if h["risk"] >= 25:
        if h["temp"] >= 0.4 or h["rain"] >= 10:
            txt = (f"Condiciones favorables al Aedes aegypti en {h['month_name']}: intensificar la eliminación de "
                   f"criaderos, la vigilancia de dengue y las campañas de prevención.")
        else:
            txt = (f"Riesgo sanitario urbano en {h['month_name']}: activar planes de calor (hidratación, pausas en "
                   f"trabajo al aire libre, atención a adultos mayores) y vigilancia epidemiológica.")
        recs.append(dict(sector="salud", level=_lvl(h["risk"]), text=txt))
    if not recs:
        recs.append(dict(sector="general", level="bajo",
                         text="Condiciones cercanas a lo normal: mantener el monitoreo de los boletines oficiales del servicio meteorológico nacional."))
    return recs


def _lvl(v: float) -> str:
    return "bajo" if v < 25 else "moderado" if v < 50 else "alto" if v < 75 else "extremo"
