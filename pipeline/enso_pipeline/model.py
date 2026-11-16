"""Teleconnection response model and sector risk indices.

IMPORTANT: ``response`` and ``risks`` are mirrored 1:1 in
``web/src/model/climate.ts`` so the What-If simulator can recompute every
column and city in the browser. A parity test (``npm test``) checks that the
TypeScript implementation reproduces the exported Python values.
"""
from __future__ import annotations

import math
from typing import Dict, List, Sequence

import numpy as np

from . import config
from .geo import haversine_deg

RAIN_CAP_WET = 150.0
RAIN_CAP_DRY = 85.0


# --------------------------------------------------------------- coefficients
def kernel_weights(lat: np.ndarray, lng: np.ndarray, elev: np.ndarray) -> np.ndarray:
    """(n_kernels, n_points) footprint weights."""
    W = np.zeros((len(config.KERNELS), len(lat)))
    for k, K in enumerate(config.KERNELS):
        w = np.exp(-0.5 * (((lat - K["lat"]) / K["sig_lat"]) ** 2 + ((lng - K["lng"]) / K["sig_lng"]) ** 2))
        if "max_elev" in K:
            w = w * np.where(elev > K["max_elev"], np.exp(-(elev - K["max_elev"]) / 500.0), 1.0)
        if "min_elev" in K:
            w = w * np.where(elev < K["min_elev"], np.exp(-(K["min_elev"] - elev) / 500.0), 1.0)
        W[k] = w
    return W


def coefficients(lat, lng, elev, month0: int) -> Dict[str, np.ndarray]:
    """Sensitivity coefficients for calendar month ``month0`` (0 = January)."""
    lat, lng, elev = (np.asarray(a, dtype=float) for a in (lat, lng, elev))
    W = kernel_weights(lat, lng, elev)
    rain = np.array([K["rain"][month0] for K in config.KERNELS])
    temp = np.array([K["temp"][month0] for K in config.KERNELS])
    nr = np.array([K["neg_rain"] for K in config.KERNELS])
    nt = np.array([K["neg_temp"] for K in config.KERNELS])
    dot = lambda v: np.einsum("k,kn->n", v, W)  # einsum avoids spurious BLAS FP warnings on macOS
    return dict(rP=dot(rain), rN=dot(rain * nr), tP=dot(temp), tN=dot(temp * nt))


# ------------------------------------------------------------------ response
def response(oni: float, rP: float, rN: float, tP: float, tN: float, trend: float):
    """Expected (temperature anomaly °C, rain anomaly %) for a given ONI."""
    lin = (rP if oni >= 0 else rN) * oni
    rain = RAIN_CAP_WET * math.tanh(lin / RAIN_CAP_WET) if lin >= 0 else -RAIN_CAP_DRY * math.tanh(-lin / RAIN_CAP_DRY)
    temp = (tP if oni >= 0 else tN) * oni + trend
    return temp, rain


def _soft(x: float) -> float:
    return 1.0 - math.exp(-max(0.0, x))


def _clamp(x, a, b):
    return a if x < a else b if x > b else x


def risks(temp: float, rain: float, base_t: float, ea: float, eh: float, u: float, elev: float):
    """Agro, energy/hydro and urban-health risk indices (0-100)."""
    # Agro: drought stress, waterlogging/flooding and heat stress on crops.
    h_agri = (max(0.0, -rain) / 30.0 + 0.8 * max(0.0, rain - 20.0) / 45.0
              + 0.5 * max(0.0, temp - 0.3) / 1.2)
    agri = 100.0 * ea * _soft(1.3 * h_agri)
    # Energy: reservoir inflow deficit (or flood spill) + cooling-demand peaks.
    hydro = eh * (max(0.0, -rain) / 28.0 + 0.35 * max(0.0, rain - 50.0) / 60.0)
    demand = u * max(0.0, temp - 0.2) * _clamp((base_t + temp - 18.0) / 10.0, 0.0, 1.0)
    energy = 100.0 * _soft(1.4 * hydro + demand)
    # Health: heat stress + Aedes aegypti suitability (dengue).
    t_eff = base_t + temp
    heat = max(0.0, t_eff - 26.0) / 5.0
    suit = math.exp(-((t_eff - 28.0) / 5.5) ** 2) if t_eff >= 15.0 else 0.0
    moist = _clamp(1.0 + rain / 120.0, 0.4, 1.8)
    alt = 1.0 if elev < 2000 else math.exp(-(elev - 2000.0) / 400.0)
    dengue = suit * moist * alt * (1.0 + 0.5 * max(0.0, temp))
    health = 100.0 * _soft((0.3 + 0.7 * u) * (0.9 * heat + 0.8 * dengue))
    return agri, energy, health


def level(risk: float) -> str:
    return "bajo" if risk < 25 else "moderado" if risk < 50 else "alto" if risk < 75 else "extremo"


# ---------------------------------------------------------------- exposures
def agri_exposure(lat, lng, month0: int) -> np.ndarray:
    lat, lng = np.asarray(lat, float), np.asarray(lng, float)
    e = np.zeros_like(lat)
    for _name, _crop, clat, clng, slat, slng, weight, season in config.CROP_REGIONS:
        e += weight * season[month0] * np.exp(-0.5 * (((lat - clat) / slat) ** 2 + ((lng - clng) / slng) ** 2))
    return np.clip(e, 0, 1)


def dominant_crop(lat: float, lng: float):
    best, bw = None, 0.0
    for name, crop, clat, clng, slat, slng, weight, _s in config.CROP_REGIONS:
        w = weight * math.exp(-0.5 * (((lat - clat) / slat) ** 2 + ((lng - clng) / slng) ** 2))
        if w > bw:
            best, bw = (name, crop), w
    return best if bw > 0.15 else None


def hydro_exposure(lat, lng) -> np.ndarray:
    lat, lng = np.asarray(lat, float), np.asarray(lng, float)
    e = np.zeros_like(lat)
    for _n, hl, hg, cap in config.HYDRO_SITES:
        d = haversine_deg(lat, lng, hl, hg)
        e += min(1.0, math.sqrt(cap / 6.0)) * np.exp(-0.5 * (d / 2.6) ** 2)
    return np.clip(e, 0, 1)


def nearest_hydro(lat: float, lng: float):
    d = [(float(haversine_deg(lat, lng, hl, hg)), n) for n, hl, hg, _c in config.HYDRO_SITES]
    d.sort()
    return d[0] if d[0][0] < 6 else None


URBAN_EXTRA = [  # additional large metro areas (lat, lng, millions) for exposure only
    (-8.05, -34.88, 4.1), (-3.73, -38.52, 4.1), (-12.97, -38.50, 3.9), (-19.92, -43.94, 6.0),
    (-30.03, -51.23, 4.4), (-3.12, -60.02, 2.3), (-1.46, -48.50, 2.6), (-16.68, -49.25, 2.6),
    (10.97, -74.80, 2.4), (10.39, -75.51, 1.1), (10.65, -71.64, 2.3), (10.16, -68.00, 2.0),
    (14.07, -87.19, 1.6), (13.69, -89.22, 1.2), (12.11, -86.24, 1.4), (19.04, -98.21, 3.2),
    (32.51, -117.04, 2.2), (31.69, -106.42, 1.5), (21.16, -86.85, 0.9), (20.97, -89.62, 1.3),
    (-8.11, -79.03, 1.0), (-6.77, -79.84, 0.9), (-32.89, -68.83, 1.2), (-26.81, -65.22, 0.9),
    (-36.83, -73.05, 1.0), (-2.90, -79.00, 0.6), (18.54, -72.34, 2.8), (17.99, -76.79, 1.2),
    (20.02, -75.82, 0.5), (10.66, -61.51, 0.5), (5.85, -55.20, 0.3), (6.80, -58.16, 0.3),
]


def urban_exposure(lat, lng) -> np.ndarray:
    lat, lng = np.asarray(lat, float), np.asarray(lng, float)
    e = np.zeros_like(lat)
    pts = [(c[3], c[4], c[5]) for c in config.CITIES] + URBAN_EXTRA
    for cl, cg, pop in pts:
        d = haversine_deg(lat, lng, cl, cg)
        e += min(1.0, math.sqrt(pop / 8.0)) * np.exp(-0.5 * (d / 0.8) ** 2)
    return np.clip(e, 0, 1)


# --------------------------------------------------------- base temperature
def _bt_features(lat, elev, month0):
    lat, elev = np.asarray(lat, float), np.asarray(elev, float)
    ang = 2 * np.pi * (np.asarray(month0, float)) / 12.0
    la = lat / 30.0
    return np.column_stack([
        np.ones_like(lat), la, la ** 2, la ** 3, elev / 1000.0,
        np.cos(ang) * la, np.sin(ang) * la, np.cos(ang) * la * np.abs(la), np.sin(ang) * la * np.abs(la),
    ])


class BaseTemperature:
    """Climatological 2 m temperature: regression on ERA5 city normals
    (latitude, elevation, hemispheric seasonal cycle) + Gaussian-weighted
    kriging of the city residuals."""

    def __init__(self, city_rows: Sequence[dict]):
        lat, elev, m0, y, clat, clng = [], [], [], [], [], []
        for c in city_rows:
            for m in range(12):
                lat.append(c["lat"]); elev.append(c["elevation"]); m0.append(m)
                y.append(c["clim_t"][m]); clat.append(c["lat"]); clng.append(c["lng"])
        X = _bt_features(lat, elev, m0)
        self.coef, *_ = np.linalg.lstsq(X, np.asarray(y), rcond=None)
        pred = np.einsum("nf,f->n", X, self.coef)
        self.rmse = float(np.sqrt(np.mean((pred - np.asarray(y)) ** 2)))
        self.cities = city_rows
        self.resid = {}
        for c in city_rows:
            Xc = _bt_features([c["lat"]] * 12, [c["elevation"]] * 12, list(range(12)))
            self.resid[c["id"]] = np.asarray(c["clim_t"]) - np.einsum("nf,f->n", Xc, self.coef)

    def predict(self, lat, lng, elev, month0: int) -> np.ndarray:
        lat, lng, elev = (np.asarray(a, float) for a in (lat, lng, elev))
        base = np.einsum("nf,f->n", _bt_features(lat, elev, np.full(lat.shape, month0)), self.coef)
        num = np.zeros_like(lat)
        den = np.zeros_like(lat)
        for c in self.cities:
            # Elevation-aware: residuals only spread to points at similar height.
            w = (np.exp(-0.5 * (haversine_deg(lat, lng, c["lat"], c["lng"]) / 2.0) ** 2)
                 * np.exp(-np.abs(elev - c["elevation"]) / 800.0))
            num += w * self.resid[c["id"]][month0]
            den += w
        return base + num / (den + 0.35)


def idw(lat, lng, src: List[dict], key: str, scale: float = 8.0) -> np.ndarray:
    lat, lng = np.asarray(lat, float), np.asarray(lng, float)
    num = np.zeros_like(lat)
    den = np.zeros_like(lat)
    for s in src:
        w = 1.0 / (haversine_deg(lat, lng, s["lat"], s["lng"]) ** 2 + scale)
        num += w * s[key]
        den += w
    return num / den
