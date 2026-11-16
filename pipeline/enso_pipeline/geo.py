"""Geospatial utilities: land mask, hexagonal grid, countries and elevation."""
from __future__ import annotations

import json
import math
import time
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

import numpy as np

from . import config

Ring = np.ndarray  # (n, 2) lng/lat


# ------------------------------------------------------------------ geometry
def _polygons(geom: dict) -> List[List[Ring]]:
    if geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    elif geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    else:
        return []
    return [[np.asarray(r, dtype=float) for r in poly] for poly in polys]


def _ring_contains(ring: Ring, lng: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Vectorised even-odd ray casting."""
    x, y = ring[:, 0], ring[:, 1]
    x2, y2 = np.roll(x, -1), np.roll(y, -1)
    inside = np.zeros(lng.shape, dtype=bool)
    for xa, ya, xb, yb in zip(x, y, x2, y2):
        cond = (ya > lat) != (yb > lat)
        if not cond.any():
            continue
        with np.errstate(divide="ignore", invalid="ignore"):
            xi = xa + (lat - ya) * (xb - xa) / (yb - ya)
        inside ^= cond & (lng < xi)
    return inside


class PolygonIndex:
    def __init__(self, features: List[dict]):
        self.items = []
        for f in features:
            for poly in _polygons(f["geometry"]):
                outer = poly[0]
                bbox = (outer[:, 0].min(), outer[:, 1].min(), outer[:, 0].max(), outer[:, 1].max())
                self.items.append((f, poly, bbox))

    def locate(self, lng: np.ndarray, lat: np.ndarray) -> np.ndarray:
        """Return the feature index (into self.items) containing each point, -1 if none."""
        out = np.full(lng.shape, -1, dtype=int)
        for k, (_f, poly, (x0, y0, x1, y1)) in enumerate(self.items):
            sel = (out < 0) & (lng >= x0) & (lng <= x1) & (lat >= y0) & (lat <= y1)
            if not sel.any():
                continue
            ins = _ring_contains(poly[0], lng[sel], lat[sel])
            for hole in poly[1:]:
                ins &= ~_ring_contains(hole, lng[sel], lat[sel])
            idx = np.where(sel)[0][ins]
            out[idx] = k
        return out


def load_geojson(name: str) -> dict:
    return json.loads((config.RAW_DIR / f"{name}.geojson").read_text())


def haversine_deg(lat1, lng1, lat2, lng2):
    """Great-circle distance in degrees of arc (vectorised)."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dl = np.radians(np.asarray(lng2) - np.asarray(lng1))
    dp = p2 - p1
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return np.degrees(2 * np.arcsin(np.sqrt(np.clip(a, 0, 1))))


# --------------------------------------------------------------- countries
def latam_country_features() -> List[dict]:
    feats = load_geojson("ne_50m_admin_0_countries")["features"]
    out = []
    for f in feats:
        p = f["properties"]
        if p["ISO_A3"] in config.EXCLUDED_ISO:
            continue
        if p["SUBREGION"] in config.LATAM_SUBREGIONS or p["ADM0_A3"] == "FRA":
            out.append(f)
    return out


def _country_name(f: dict, lng: float, lat: float) -> Tuple[str, str]:
    p = f["properties"]
    if p["ADM0_A3"] == "FRA":
        if lat > 0 and lng < -50 and lng > -55:
            return "Guayana Francesa", "GUF"
        return "Antillas Francesas", "FRA"
    return p["NAME_ES"], p["ADM0_A3"]


# --------------------------------------------------------------------- grid
def build_grid() -> List[Dict]:
    """Staggered (hexagonal) lattice of land points over Latin America."""
    d = config.GRID_SPACING_DEG
    row_step = d * math.sqrt(3) / 2
    lats, lngs = [], []
    lat = config.LAT_MIN
    row = 0
    while lat <= config.LAT_MAX:
        step = d / max(math.cos(math.radians(lat)), 0.2)
        offset = (step / 2) if row % 2 else 0.0
        lng = config.LNG_MIN + offset
        while lng <= config.LNG_MAX:
            lats.append(lat)
            lngs.append(lng)
            lng += step
        lat += row_step
        row += 1
    lats, lngs = np.asarray(lats), np.asarray(lngs)

    land = PolygonIndex(load_geojson("ne_50m_land")["features"])
    on_land = land.locate(lngs, lats) >= 0

    countries = latam_country_features()
    cindex = PolygonIndex(countries)
    cidx = cindex.locate(lngs, lats)
    keep = on_land & (cidx >= 0)

    pts = []
    for la, lo, k in zip(lats[keep], lngs[keep], cidx[keep]):
        name, iso = _country_name(cindex.items[k][0], lo, la)
        pts.append(dict(lat=round(float(la), 3), lng=round(float(lo), 3), country=name, iso=iso))

    # Small islands (e.g. Puerto Rico, Jamaica, Trinidad) may fall between lattice
    # nodes: add one point per uncovered Latin American polygon larger than ~2000 km².
    covered = {(p["iso"]) for p in pts}
    for f, poly, (x0, y0, x1, y1) in cindex.items:
        name, iso = _country_name(f, (x0 + x1) / 2, (y0 + y1) / 2)
        area_deg2 = (x1 - x0) * (y1 - y0)
        if iso in covered or area_deg2 < 0.15:
            continue
        lo, la = f["properties"]["LABEL_X"], f["properties"]["LABEL_Y"]
        if not (x0 <= lo <= x1 and y0 <= la <= y1):
            lo, la = float(poly[0][:, 0].mean()), float(poly[0][:, 1].mean())
        pts.append(dict(lat=round(la, 3), lng=round(lo, 3), country=name, iso=iso))
        covered.add(iso)
    for i, p in enumerate(pts):
        p["id"] = i
    return pts


# ---------------------------------------------------------------- elevation
ELEV_CACHE = config.CACHE_DIR / "elevation.json"


def _key(lat: float, lng: float) -> str:
    return f"{lat:.3f},{lng:.3f}"


def fetch_elevations(points: List[Tuple[float, float]], offline: bool = False) -> Tuple[List[float], str]:
    """Copernicus DEM (90 m) elevations from the Open-Meteo elevation API, cached on disk."""
    cache: Dict[str, float] = json.loads(ELEV_CACHE.read_text()) if ELEV_CACHE.exists() else {}
    missing = [p for p in points if _key(*p) not in cache]
    status = "cache"
    if missing and not offline:
        status = "open-meteo"
        quota = False
        for k in range(0, len(missing), 100):
            if quota:
                break
            chunk = missing[k:k + 100]
            url = ("https://api.open-meteo.com/v1/elevation?latitude="
                   + ",".join(f"{a:.3f}" for a, _ in chunk)
                   + "&longitude=" + ",".join(f"{b:.3f}" for _, b in chunk))
            for attempt in range(3):
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
                    with urllib.request.urlopen(req, timeout=config.HTTP_TIMEOUT) as r:
                        elev = json.loads(r.read())["elevation"]
                    for (a, b), e in zip(chunk, elev):
                        cache[_key(a, b)] = float(e)
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code == 429:  # quota exhausted: keep what we have, retry next run
                        quota = True
                        break
                    time.sleep(2 + 3 * attempt)
                except Exception:
                    time.sleep(2 + 3 * attempt)
        ELEV_CACHE.parent.mkdir(parents=True, exist_ok=True)
        ELEV_CACHE.write_text(json.dumps(cache))
    out = []
    for p in points:
        out.append(max(0.0, cache.get(_key(*p), 0.0)))
    if any(_key(*p) not in cache for p in points):
        status = "partial (sin elevación para algunos puntos: se asume nivel del mar)"
    return out, status


# ----------------------------------------------------------- frontend borders
def _round_geom(geom: dict, nd: int = 2) -> dict:
    def rr(ring):
        out, prev = [], None
        for x, y in ring:
            pt = (round(x, nd), round(y, nd))
            if pt != prev:
                out.append(list(pt))
            prev = pt
        return out
    if geom["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [rr(r) for r in geom["coordinates"]]}
    return {"type": "MultiPolygon", "coordinates": [[rr(r) for r in p] for p in geom["coordinates"]]}


def export_countries() -> Tuple[dict, List[dict]]:
    """World borders (110m) with Latin America replaced by the 50m geometry."""
    latam = latam_country_features()
    latam_iso = {f["properties"]["ADM0_A3"] for f in latam if f["properties"]["ADM0_A3"] != "FRA"}
    feats = []
    for f in load_geojson("ne_110m_admin_0_countries")["features"]:
        p = f["properties"]
        if p["ADM0_A3"] in latam_iso or p["ADM0_A3"] == "ATA":
            continue
        feats.append({"type": "Feature", "properties": {"n": p["NAME_ES"], "l": 0},
                      "geometry": _round_geom(f["geometry"], 2)})
    meta = []
    for f in latam:
        p = f["properties"]
        if p["ADM0_A3"] == "FRA":
            continue
        feats.append({"type": "Feature", "properties": {"n": p["NAME_ES"], "l": 1, "iso": p["ADM0_A3"]},
                      "geometry": _round_geom(f["geometry"], 2)})
        meta.append(dict(iso=p["ADM0_A3"], name=p["NAME_ES"], lat=p["LABEL_Y"], lng=p["LABEL_X"],
                         population=p["POP_EST"]))
    return {"type": "FeatureCollection", "features": feats}, meta
