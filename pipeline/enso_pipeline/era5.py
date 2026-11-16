"""ERA5 reanalysis (via the Open-Meteo archive API) for the 30 cities.

Daily 2 m mean temperature and precipitation are aggregated to monthly values
and cached as compact JSON in ``pipeline/data/cache/era5``.

The free Open-Meteo tier weighs long requests heavily (a 76-year daily
series costs ~400 "calls"), so downloads are quota-aware:

1. ``load_city`` guarantees the satellite era (1979 onwards) and appends new
   months incrementally (a few calls per city each month).
2. ``backfill_city`` extends a cached city back to 1950 when quota remains.
   A per-minute 429 is waited out (65 s) and retried.
3. An hourly or daily 429 stops every further download in the run; cached data
   is used instead and the next scheduled run continues where this one ended.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from datetime import date, timedelta
from typing import Dict, Tuple

from . import config

CACHE = config.CACHE_DIR / "era5"
FULL_START = date(1950, 1, 1)
MODERN_START = date(1979, 1, 1)


class QuotaExceeded(RuntimeError):
    pass


_state = {"quota": False}


def quota_exhausted() -> bool:
    return _state["quota"]


def _last_complete_month(today: date) -> date:
    first = today.replace(day=1)
    last_month_end = first - timedelta(days=1)
    if today.day < 8:  # ERA5 has ~5 days of latency
        last_month_end = last_month_end.replace(day=1) - timedelta(days=1)
    return last_month_end


def _download(lat: float, lng: float, start: date, end: date) -> dict:
    if _state["quota"]:
        raise QuotaExceeded("quota already exhausted in this run")
    url = ("https://archive-api.open-meteo.com/v1/archive"
           f"?latitude={lat:.4f}&longitude={lng:.4f}"
           f"&start_date={start.isoformat()}&end_date={end.isoformat()}"
           "&daily=temperature_2m_mean,precipitation_sum&timezone=UTC&models=era5")
    last_err: Exception = RuntimeError("unknown")
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as exc:
            if exc.code == 429:
                reason = exc.read().decode("utf-8", "replace")
                if "Minutely" in reason and attempt < 3:  # short window: wait it out
                    time.sleep(65)
                    continue
                _state["quota"] = True  # hourly/daily window: stop for this run
                raise QuotaExceeded(f"Open-Meteo API quota exceeded (HTTP 429): {reason[:120]}") from exc
            last_err = exc
        except Exception as exc:  # timeouts, DNS, truncated payloads
            last_err = exc
        time.sleep(2 + 4 * attempt)
    raise RuntimeError(f"ERA5 download failed: {last_err}")


def _monthly(payload: dict) -> Dict[str, list]:
    acc: Dict[str, list] = {}
    d = payload["daily"]
    for t, tm, pr in zip(d["time"], d["temperature_2m_mean"], d["precipitation_sum"]):
        if tm is None or pr is None:
            continue
        a = acc.setdefault(t[:7], [0.0, 0.0, 0])
        a[0] += tm
        a[1] += pr
        a[2] += 1
    out = {}
    for k, (ts, ps, n) in acc.items():
        y, m = (int(v) for v in k.split("-"))
        days = (date(y + (m == 12), m % 12 + 1, 1) - date(y, m, 1)).days
        if n >= days:  # keep complete months only
            out[k] = [round(ts / n, 2), round(ps, 1)]
    return out


def _save(city_id: str, lat: float, lng: float, monthly: Dict[str, list], payload_meta: dict) -> dict:
    keys = sorted(monthly)
    out = dict(city=city_id, lat=lat, lng=lng, elevation=payload_meta.get("elevation"),
               grid_lat=payload_meta.get("grid_lat"), grid_lng=payload_meta.get("grid_lng"),
               first=keys[0], last=keys[-1], monthly={k: monthly[k] for k in keys})
    CACHE.mkdir(parents=True, exist_ok=True)
    (CACHE / f"{city_id}.json").write_text(json.dumps(out, separators=(",", ":")))
    return out


def _read(city_id: str):
    p = CACHE / f"{city_id}.json"
    return json.loads(p.read_text()) if p.exists() else None


def _month_after(key: str) -> date:
    y, m = (int(v) for v in key.split("-"))
    return date(y + (m == 12), m % 12 + 1, 1)


def load_city(city_id: str, lat: float, lng: float, today: date, offline: bool = False) -> Tuple[dict, str]:
    cached = _read(city_id)
    end = _last_complete_month(today)
    end_key = f"{end.year}-{end.month:02d}"
    if cached and (offline or cached["last"] >= end_key):
        return cached, "cache"
    if offline:
        raise RuntimeError(f"no ERA5 cache for {city_id} (offline)")
    start = _month_after(cached["last"]) if cached else MODERN_START
    try:
        payload = _download(lat, lng, start, end)
    except RuntimeError:
        if cached:
            return cached, "cache (sin cuota para actualizar)"
        raise
    monthly = dict(cached["monthly"]) if cached else {}
    monthly.update(_monthly(payload))
    meta = dict(elevation=payload.get("elevation"), grid_lat=payload.get("latitude"),
                grid_lng=payload.get("longitude"))
    if cached:
        meta = {k: cached.get(k) for k in ("elevation", "grid_lat", "grid_lng")}
    return _save(city_id, lat, lng, monthly, meta), "open-meteo ERA5"


def backfill_city(city_id: str) -> bool:
    """Extend a cached city back to 1950 (returns True if data was added)."""
    cached = _read(city_id)
    if not cached or cached["first"] <= "1950-01" or _state["quota"]:
        return False
    y, m = (int(v) for v in cached["first"].split("-"))
    end = date(y, m, 1) - timedelta(days=1)
    try:
        payload = _download(cached["lat"], cached["lng"], FULL_START, end)
    except RuntimeError:
        return False
    monthly = _monthly(payload)
    monthly.update(cached["monthly"])
    _save(city_id, cached["lat"], cached["lng"], monthly,
          {k: cached.get(k) for k in ("elevation", "grid_lat", "grid_lng")})
    return True
