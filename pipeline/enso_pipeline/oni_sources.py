"""Acquisition of the Oceanic Niño Index (ONI) with a layered fallback chain.

Order of preference:
  1. NOAA CPC  ``oni.ascii.txt``   (official table, SEAS YR TOTAL ANOM)
  2. NOAA PSL  ``oni.data``         (same index, year x 12 matrix)
  3. Last validated snapshot committed in ``pipeline/data/fallback``
  4. Reconstruction calibrated with the catalogue of real ENSO episodes

Every candidate goes through the same validation; the first that passes wins.
The ONI is stored as a monthly series keyed by the *centre* month of each
3-month season (DJF -> January, JFM -> February ... NDJ -> December).
"""
from __future__ import annotations

import json
import math
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from . import config

MonthKey = Tuple[int, int]  # (year, month)


@dataclass
class OniSeries:
    values: Dict[MonthKey, float]
    source: str
    source_url: Optional[str]
    retrieved_at: str
    attempts: List[dict] = field(default_factory=list)

    @property
    def first(self) -> MonthKey:
        return min(self.values)

    @property
    def last(self) -> MonthKey:
        return max(self.values)


class OniValidationError(ValueError):
    pass


# --------------------------------------------------------------------- parsing
def parse_cpc(text: str) -> Dict[MonthKey, float]:
    out: Dict[MonthKey, float] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 4 or parts[0] not in config.SEASONS:
            continue
        season, year, _total, anom = parts
        month = config.SEASONS.index(season) + 1
        out[(int(year), month)] = float(anom)
    return out


def parse_psl(text: str) -> Dict[MonthKey, float]:
    out: Dict[MonthKey, float] = {}
    lines = text.splitlines()
    for line in lines[1:]:
        parts = line.split()
        if len(parts) != 13 or not parts[0].isdigit():
            continue
        year = int(parts[0])
        for m, raw in enumerate(parts[1:], start=1):
            v = float(raw)
            if v > -90:  # -99.9 marks missing values
                out[(year, m)] = v
    return out


PARSERS = {"cpc": parse_cpc, "psl": parse_psl}


# ------------------------------------------------------------------ validation
def validate(values: Dict[MonthKey, float], min_records: int = 700) -> None:
    if len(values) < min_records:
        raise OniValidationError(f"only {len(values)} records (< {min_records})")
    keys = sorted(values)
    if keys[0] != (1950, 1):
        raise OniValidationError(f"series starts at {keys[0]}, expected 1950-01")
    for (y0, m0), (y1, m1) in zip(keys, keys[1:]):
        if (y1 * 12 + m1) - (y0 * 12 + m0) != 1:
            raise OniValidationError(f"gap between {y0}-{m0:02d} and {y1}-{m1:02d}")
    bad = [k for k, v in values.items() if not (-3.5 <= v <= 3.8) or math.isnan(v)]
    if bad:
        raise OniValidationError(f"{len(bad)} values outside the physical range, e.g. {bad[0]}")
    # Known anchors: the 1997-98 and 2015-16 super El Niños and the 1988-89 La Niña.
    anchors = {(1997, 12): (2.0, 2.8), (2015, 12): (2.2, 3.0), (1988, 12): (-2.2, -1.4)}
    for k, (lo, hi) in anchors.items():
        if k in values and not (lo <= values[k] <= hi):
            raise OniValidationError(f"anchor {k} = {values[k]} outside [{lo}, {hi}]")


# --------------------------------------------------------------------- network
def _http_get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
    with urllib.request.urlopen(req, timeout=config.HTTP_TIMEOUT) as resp:
        return resp.read().decode("utf-8", errors="replace")


# ------------------------------------------------------------- reconstruction
def reconstruct_from_events(until: MonthKey) -> Dict[MonthKey, float]:
    """Rebuild a plausible ONI from the catalogue of real ENSO episodes.

    Each episode is a smooth asymmetric bump (sin^2 growth, cosine decay)
    between its documented start, peak and end months, scaled to the
    documented peak value. Neutral months are 0. This reproduces timing and
    amplitude of every major event and is only used if every other source
    fails (correlation with the real ONI is reported in the tests).
    """
    def idx(s: str) -> int:
        y, m = s.split("-")
        return int(y) * 12 + int(m) - 1

    start_i, end_i = 1950 * 12, until[0] * 12 + until[1] - 1
    series = {i: 0.0 for i in range(start_i, end_i + 1)}
    for s, p, e, peak in config.ENSO_EVENTS:
        a, b, c = idx(s) - 2, idx(p), idx(e) + 2
        for i in range(max(a, start_i), min(c, end_i) + 1):
            if i <= b:
                x = (i - a) / max(1, b - a)
                shape = math.sin(x * math.pi / 2) ** 2
            else:
                x = (i - b) / max(1, c - b)
                shape = math.cos(x * math.pi / 2) ** 1.5
            if abs(peak * shape) > abs(series[i]):
                series[i] = peak * shape
    return {(i // 12, i % 12 + 1): round(v, 2) for i, v in series.items()}


# ------------------------------------------------------------------ snapshot
SNAPSHOT = config.FALLBACK_DIR / "oni_snapshot.json"


def save_snapshot(series: OniSeries) -> None:
    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "source": series.source,
        "source_url": series.source_url,
        "retrieved_at": series.retrieved_at,
        "values": {f"{y}-{m:02d}": v for (y, m), v in sorted(series.values.items())},
    }
    SNAPSHOT.write_text(json.dumps(payload, indent=0))


def load_snapshot() -> Optional[Tuple[Dict[MonthKey, float], dict]]:
    if not SNAPSHOT.exists():
        return None
    payload = json.loads(SNAPSHOT.read_text())
    values = {}
    for k, v in payload["values"].items():
        y, m = k.split("-")
        values[(int(y), int(m))] = float(v)
    return values, payload


# ---------------------------------------------------------------------- main
def fetch_oni(offline: bool = False) -> OniSeries:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    attempts: List[dict] = []

    if not offline:
        for name, url, kind in config.ONI_SOURCES:
            try:
                values = PARSERS[kind](_http_get(url))
                validate(values)
                attempts.append({"source": name, "ok": True, "records": len(values)})
                series = OniSeries(values, name, url, now, attempts)
                save_snapshot(series)
                return series
            except Exception as exc:  # network errors, format changes, validation
                attempts.append({"source": name, "ok": False, "error": str(exc)[:200]})

    snap = load_snapshot()
    if snap is not None:
        values, meta = snap
        try:
            validate(values)
            attempts.append({"source": "snapshot", "ok": True, "records": len(values)})
            return OniSeries(values, f"Snapshot validado ({meta['source']}, {meta['retrieved_at'][:10]})",
                             meta.get("source_url"), now, attempts)
        except OniValidationError as exc:
            attempts.append({"source": "snapshot", "ok": False, "error": str(exc)})

    today = datetime.now(timezone.utc)
    last_event_end = max(config.ENSO_EVENTS, key=lambda e: e[2])[2]
    ly, lm = (int(x) for x in last_event_end.split("-"))
    until = min((today.year, today.month), (ly, lm))
    values = reconstruct_from_events(until)
    attempts.append({"source": "event-reconstruction", "ok": True, "records": len(values)})
    return OniSeries(values, "Reconstrucción calibrada con eventos ENSO históricos", None, now, attempts)
