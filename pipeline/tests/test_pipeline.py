"""Unit tests for the ENSO 3D pipeline (stdlib unittest, no network)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from enso_pipeline import config  # noqa: E402
from enso_pipeline.analogs import find_analogs  # noqa: E402
from enso_pipeline.forecast import project, to_array, to_index  # noqa: E402
from enso_pipeline.model import coefficients, response, risks  # noqa: E402
from enso_pipeline.oni_sources import (OniValidationError, load_snapshot, parse_cpc, parse_psl,  # noqa: E402
                                       reconstruct_from_events, validate)

CPC_SAMPLE = """ SEAS  YR   TOTAL   ANOM
  DJF 1950  25.01  -1.32
  JFM 1950  25.36  -1.20
"""
PSL_SAMPLE = """ 1950         2026
1950  -1.32 -1.20 -1.12 -1.08 -1.10 -0.90 -0.62   -0.57  -0.56  -0.62  -0.66 -0.79
2026  -0.40 -0.21 0.11 0.46 0.95 1.39 1.80 2.16 2.46 -99.90 -99.90 -99.90
  -99.9
"""


def snapshot_values():
    snap = load_snapshot()
    if snap is None:
        raise unittest.SkipTest("no ONI snapshot yet: run pipeline/run.py once")
    return snap[0]


class OniSources(unittest.TestCase):
    def test_parse_cpc(self):
        v = parse_cpc(CPC_SAMPLE)
        self.assertEqual(v[(1950, 1)], -1.32)
        self.assertEqual(v[(1950, 2)], -1.20)

    def test_parse_psl_skips_missing(self):
        v = parse_psl(PSL_SAMPLE)
        self.assertEqual(v[(2026, 9)], 2.46)
        self.assertNotIn((2026, 10), v)

    def test_validation_rejects_short_and_gappy_series(self):
        with self.assertRaises(OniValidationError):
            validate(parse_cpc(CPC_SAMPLE))
        vals = {(1950 + i // 12, i % 12 + 1): 0.0 for i in range(800)}
        del vals[(1960, 5)]
        with self.assertRaises(OniValidationError):
            validate(vals)

    def test_snapshot_is_valid(self):
        validate(snapshot_values())

    def test_event_reconstruction_tracks_real_oni(self):
        real = snapshot_values()
        rec = reconstruct_from_events(max(real))
        keys = [k for k in real if k in rec and k[0] <= 2025]
        r = np.corrcoef([real[k] for k in keys], [rec[k] for k in keys])[0, 1]
        self.assertGreater(r, 0.75, f"reconstruction correlation too low: {r:.2f}")
        self.assertAlmostEqual(rec[(2015, 12)], 2.6, delta=0.05)


class Forecast(unittest.TestCase):
    def test_projection_is_bounded_and_uncertainty_grows(self):
        fc = project(snapshot_values(), 6)
        self.assertTrue(np.all(np.abs(fc.mean) < 4.0))
        self.assertTrue(np.all(fc.upper > fc.mean) and np.all(fc.lower < fc.mean))
        self.assertGreater(fc.rmse[-1], fc.rmse[0])
        self.assertGreater(fc.corr[0], 0.9)  # 1-month persistence skill

    def test_analogs_recover_a_known_event(self):
        """Querying with the real 1997-98 trajectory: the window itself ranks first (100 %
        match) and the next analog is another super El Niño (1982-83 or 2015-16)."""
        x = to_array(snapshot_values())
        end = to_index((1998, 4))
        q = x[end - 11:end + 1]
        found = find_analogs(x[:to_index((2025, 12)) + 1], to_index((2025, 12)), q, to_index((2027, 4)), np.ones(12))
        labels = [f"{1950 + (f['end'] - 11) // 12}" for f in found]
        self.assertEqual(len(found), 3)
        self.assertEqual(labels[0], "1997", labels)
        self.assertGreater(found[0]["similarity"], 99)
        self.assertIn(labels[1], ("1982", "2015"), labels)


class Model(unittest.TestCase):
    def test_canonical_el_nino_pattern(self):
        """El Niño: wetter La Plata (SON) and north Peru coast (FMA); drier Amazon and NE Brazil."""
        def rain(lat, lng, elev, m0, oni=2.0):
            c = coefficients([lat], [lng], [elev], m0)
            return response(oni, c["rP"][0], c["rN"][0], c["tP"][0], c["tN"][0], 0.0)[1]
        self.assertGreater(rain(-29, -57, 80, 10), 20)        # Cuenca del Plata, November
        self.assertGreater(rain(-5, -80.6, 30, 2), 60)        # Piura, March
        self.assertLess(rain(-3, -60, 50, 1), -15)            # Amazonía, February
        self.assertLess(rain(-6, -39, 300, 3), -20)           # Nordeste, April
        self.assertLess(rain(-29, -57, 80, 10, oni=-1.5), -20)  # La Niña reverses La Plata

    def test_risks_are_bounded(self):
        for t, r in [(-2, -80), (0, 0), (3, 150), (1.5, -40)]:
            for v in risks(t, r, 27.0, 1.0, 1.0, 1.0, 100.0):
                self.assertGreaterEqual(v, 0)
                self.assertLessEqual(v, 100)

    def test_rain_response_is_saturated(self):
        self.assertLessEqual(response(5.0, 400, 400, 0, 0, 0)[1], 150)
        self.assertGreaterEqual(response(-5.0, 400, 400, 0, 0, 0)[1], -85)

    def test_city_catalogue(self):
        self.assertEqual(len(config.CITIES), 30)
        self.assertEqual(len({c[0] for c in config.CITIES}), 30)


if __name__ == "__main__":
    unittest.main(verbosity=2)
