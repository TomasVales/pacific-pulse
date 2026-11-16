#!/usr/bin/env python3
"""ENSO 3D data pipeline: fetch -> clean -> model -> export JSON.

Usage:
    python pipeline/run.py                 # live sources with fallbacks
    python pipeline/run.py --offline       # only snapshots / caches
    ENSO_REFERENCE_DATE=2026-11-16 python pipeline/run.py
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from enso_pipeline import config, geo, era5  # noqa: E402
from enso_pipeline.analogs import describe, find_analogs  # noqa: E402
from enso_pipeline.cities import (CLIM_MID, calibrate, climatology, decimal_year,  # noqa: E402
                                  monthly_arrays, recommendations, warming_trend)
from enso_pipeline.forecast import classify, from_index, phase, project, to_array, to_index  # noqa: E402
from enso_pipeline.model import (BaseTemperature, agri_exposure, coefficients, dominant_crop,  # noqa: E402
                                 hydro_exposure, idw, level, nearest_hydro, response, risks,
                                 urban_exposure)
from enso_pipeline.oni_sources import fetch_oni  # noqa: E402

MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def r(v, nd=2):
    return None if v is None or (isinstance(v, float) and math.isnan(v)) else round(float(v), nd)


def arr(a, nd=2):
    return [round(float(v), nd) for v in a]


def month_key(i: int) -> str:
    y, m = from_index(i)
    return f"{y}-{m:02d}"


def write_json(name: str, payload) -> int:
    config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = config.OUTPUT_DIR / name
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    path.write_text(text, encoding="utf-8")
    return len(text)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="never hit the network")
    args = ap.parse_args()
    t0 = time.time()

    ref = os.environ.get("ENSO_REFERENCE_DATE")
    today = date.fromisoformat(ref) if ref else date.today()
    log(f"Fecha de referencia: {today.isoformat()}")

    # ------------------------------------------------------------------ ONI
    oni = fetch_oni(offline=args.offline)
    x = to_array(oni.values)
    last_obs = len(x) - 1
    log(f"ONI: {len(oni.values)} registros {month_key(0)}..{month_key(last_obs)} · fuente: {oni.source}")

    disp_start = to_index((today.year, today.month))
    disp = list(range(disp_start, disp_start + config.FORECAST_MONTHS))
    max_lead = max(1, disp[-1] - last_obs)
    fc = project(oni.values, max_lead)
    combined = np.concatenate([x, fc.mean])
    sd = np.concatenate([np.zeros(len(x)), fc.rmse])
    log("Proyección: " + ", ".join(f"{month_key(last_obs + L)}={v:+.2f}" for L, v in zip(fc.leads, fc.mean)))

    def oni_at(i: int):
        if i <= last_obs:
            return float(x[i]), float(x[i]), float(x[i]), True
        L = i - last_obs - 1
        return float(fc.mean[L]), float(fc.lower[L]), float(fc.upper[L]), False

    months_meta = []
    for i in disp:
        v, lo, hi, observed = oni_at(i)
        y, m = from_index(i)
        months_meta.append(dict(key=month_key(i), year=y, m0=m - 1, label=f"{config.MONTHS_ES[m-1]} {y}",
                                short=MONTHS_SHORT[m - 1], decimalYear=round(decimal_year(i), 4),
                                oni=r(v), lower=r(lo), upper=r(hi), observed=observed,
                                phase=phase(v), category=classify(v)))

    # -------------------------------------------------------------- analogs
    q_end = disp[-1]
    query = combined[q_end - config.ANALOG_WINDOW + 1:q_end + 1]
    q_w = 1.0 / (1.0 + (sd[q_end - config.ANALOG_WINDOW + 1:q_end + 1] / 0.4) ** 2)
    analog_c = find_analogs(x, last_obs, query, q_end, q_w)
    analogs = []
    for c in analog_c:
        d = describe(x, c, config.ANALOG_WINDOW)
        offset = c["end"] - q_end  # maps display months onto the analog period
        d["months"] = []
        for i in disp:
            j = i + offset
            yy, mm = from_index(j)
            d["months"].append(dict(key=month_key(j), label=f"{config.MONTHS_ES[mm-1]} {yy}",
                                    short=MONTHS_SHORT[mm - 1], oni=r(x[j]),
                                    decimalYear=round(decimal_year(j), 4)))
        d["offset"] = offset
        analogs.append(d)
    for a in analogs:
        log(f"Análogo {a['label']}: {a['similarity']}% (r={a['correlation']}, rmse={a['rmse']})")

    # --------------------------------------------------------------- cities
    city_rows, city_status, city_data = [], {}, {}
    for cid, name, country, lat, lng, pop in config.CITIES:
        try:
            city_data[cid], city_status[cid] = era5.load_city(cid, lat, lng, today, offline=args.offline)
        except RuntimeError as exc:
            log(f"  ! ERA5 {name}: {exc}")
    if not args.offline:  # quota permitting, extend the satellite-era caches back to 1950
        for cid in list(city_data):
            if era5.backfill_city(cid):
                city_data[cid], _ = era5.load_city(cid, 0, 0, today, offline=True)
                log(f"  ERA5 {cid}: serie extendida a 1950")
    if era5.quota_exhausted():
        log("  ! Cuota de Open-Meteo agotada en esta ejecución: se usan las cachés disponibles")
    for cid, name, country, lat, lng, pop in config.CITIES:
        if cid not in city_data:
            continue
        data, status = city_data[cid], city_status[cid]
        T, P = monthly_arrays(data)
        ct, cp = climatology(T, P)
        city_rows.append(dict(id=cid, name=name, country=country, lat=lat, lng=lng, population=pop,
                              elevation=float(data.get("elevation") or 0.0), clim_t=ct, clim_p=cp,
                              slope=warming_trend(T), T=T, P=P, era_first=data["first"], era_last=data["last"]))
    if len(city_rows) < 10:
        raise SystemExit("ERA5 unavailable for most cities and no cache present")
    log(f"ERA5: {len(city_rows)} ciudades ({sorted(set(city_status.values()))})")
    bt_model = BaseTemperature(city_rows)
    log(f"Temperatura base: RMSE regresión = {bt_model.rmse:.2f} °C")

    # ----------------------------------------------------------------- grid
    pts = geo.build_grid()
    lat = np.array([p["lat"] for p in pts])
    lng = np.array([p["lng"] for p in pts])
    elev_list, elev_status = geo.fetch_elevations(list(zip(lat.tolist(), lng.tolist())), offline=args.offline)
    elev = np.array(elev_list)
    log(f"Malla: {len(pts)} puntos sobre tierra · elevación: {elev_status}")
    countries = sorted({p["country"] for p in pts})
    c_index = {c: k for k, c in enumerate(countries)}
    eh = hydro_exposure(lat, lng)
    u = urban_exposure(lat, lng)
    slope = idw(lat, lng, city_rows, "slope")

    grid_months = []
    for meta, i in zip(months_meta, disp):
        m0 = meta["m0"]
        co = coefficients(lat, lng, elev, m0)
        ea = agri_exposure(lat, lng, m0)
        bt = bt_model.predict(lat, lng, elev, m0)
        trend = slope * (meta["decimalYear"] - CLIM_MID)
        T_, R_, A_, E_, H_ = [], [], [], [], []
        for k in range(len(pts)):
            t, rr = response(meta["oni"], co["rP"][k], co["rN"][k], co["tP"][k], co["tN"][k], trend[k])
            a, e, h = risks(t, rr, bt[k], ea[k], eh[k], u[k], elev[k])
            T_.append(t); R_.append(rr); A_.append(a); E_.append(e); H_.append(h)
        grid_months.append(dict(rP=arr(co["rP"], 2), rN=arr(co["rN"], 2), tP=arr(co["tP"], 3), tN=arr(co["tN"], 3),
                                ea=arr(ea, 3), bt=arr(bt, 2), temp=arr(T_, 2), rain=arr(R_, 1),
                                agri=arr(A_, 1), energy=arr(E_, 1), health=arr(H_, 1)))

    # ------------------------------------------------------- city products
    cities_out = []
    validation = []
    for c in city_rows:
        cal = calibrate(c, c["T"], c["P"], x, c["slope"])
        validation.append(cal["validation"])
        crop = dominant_crop(c["lat"], c["lng"])
        dam = nearest_hydro(c["lat"], c["lng"])
        c_eh = float(hydro_exposure([c["lat"]], [c["lng"]])[0])
        months_out, coefs = [], []
        for meta in months_meta:
            m0 = meta["m0"]
            ea = float(agri_exposure([c["lat"]], [c["lng"]], m0)[0])
            trend = c["slope"] * (meta["decimalYear"] - CLIM_MID)
            cf = dict(rP=cal["rP"][m0], rN=cal["rN"][m0], tP=cal["tP"][m0], tN=cal["tN"][m0], ea=ea)
            coefs.append({k: round(v, 3) for k, v in cf.items()})
            t, rr = response(meta["oni"], cf["rP"], cf["rN"], cf["tP"], cf["tN"], trend)
            a, e, h = risks(t, rr, c["clim_t"][m0], ea, c_eh, 1.0, c["elevation"])
            months_out.append(dict(key=meta["key"], label=meta["label"], short=meta["short"],
                                   tempAnom=r(t), rainPct=r(rr, 1), climT=r(c["clim_t"][m0], 1),
                                   climP=r(c["clim_p"][m0], 1), temp=r(c["clim_t"][m0] + t, 1),
                                   precip=r(max(0.0, c["clim_p"][m0] * (1 + rr / 100)), 1),
                                   agri=r(a, 1), energy=r(e, 1), health=r(h, 1),
                                   levels=dict(agri=level(a), energy=level(e), health=level(h))))

        def peak_of(key):
            k = int(np.argmax([mo[key] for mo in months_out]))
            mo = months_out[k]
            return dict(risk=mo[key], rain=mo["rainPct"], temp=mo["tempAnom"], month_name=mo["label"])
        recs = recommendations(dict(agri=peak_of("agri"), energy=peak_of("energy"), health=peak_of("health")),
                               crop, dam)
        # What actually happened (ERA5) in each analog period.
        obs = []
        for a in analogs:
            rows = []
            for mo in a["months"]:
                i = to_index(tuple(int(v) for v in mo["key"].split("-")))
                m0 = i % 12
                if i < len(c["T"]) and not np.isnan(c["T"][i]):
                    t_obs, p_obs = float(c["T"][i]), float(c["P"][i])
                    rows.append(dict(key=mo["key"], temp=r(t_obs, 1), precip=r(p_obs, 1),
                                     tempAnom=r(t_obs - c["clim_t"][m0]),
                                     rainPct=r(100 * (p_obs / c["clim_p"][m0] - 1), 1) if c["clim_p"][m0] >= 5 else None))
                else:
                    rows.append(dict(key=mo["key"], temp=None, precip=None, tempAnom=None, rainPct=None))
            obs.append(rows)
        cities_out.append(dict(
            id=c["id"], name=c["name"], country=c["country"], lat=c["lat"], lng=c["lng"],
            population=c["population"], elevation=r(c["elevation"], 0),
            climT=arr(c["clim_t"], 1), climP=arr(c["clim_p"], 1), trendPerDecade=r(c["slope"] * 10, 3),
            slope=round(c["slope"], 5), eh=round(c_eh, 3),
            crop=dict(region=crop[0], crop=crop[1]) if crop else None,
            dam=dict(name=dam[1], distanceDeg=r(dam[0], 1)) if dam else None,
            coef=coefs, months=months_out, recommendations=recs, analogObserved=obs,
            validation=cal["validation"], calibration=cal["emp"],
            era5=dict(first=c["era_first"], last=c["era_last"], status=city_status[c["id"]]),
        ))

    # ---------------------------------------------------------------- export
    hindcast = [dict(lead=L, month=month_key(last_obs + L), rmse=r(e, 3), corr=r(cc, 3), regressionWeight=r(w, 2),
                     regression=r(rg), knn=r(kn))
                for L, e, cc, w, rg, kn in zip(fc.leads, fc.rmse, fc.corr, fc.blend_weight, fc.regression, fc.knn)]
    oni_json = dict(
        source=oni.source, sourceUrl=oni.source_url, retrievedAt=oni.retrieved_at, attempts=oni.attempts,
        lastObserved=dict(key=month_key(last_obs), season=config.SEASONS[last_obs % 12], value=r(x[last_obs]),
                          phase=phase(float(x[last_obs])), category=classify(float(x[last_obs]))),
        history=[r(v) for v in x], historyStart="1950-01",
        forecast=[dict(key=month_key(last_obs + L), mean=r(m), lower=r(lo), upper=r(hi))
                  for L, m, lo, hi in zip(fc.leads, fc.mean, fc.lower, fc.upper)],
        hindcast=hindcast,
        method=("Ensamble híbrido: regresión lineal estacional (ONI y tendencia de 3 meses) + k-NN de análogos "
                "(ventanas de 12 meses); peso y banda del 80 % calibrados por hindcast leave-one-year-out 1980-presente."),
    )
    grid_json = dict(
        n=len(pts), spacing=config.GRID_SPACING_DEG, countries=countries,
        lat=arr(lat, 3), lng=arr(lng, 3), elev=arr(elev, 0), country=[c_index[p["country"]] for p in pts],
        eh=arr(eh, 3), u=arr(u, 3), slope=arr(slope, 5), clim_mid=CLIM_MID,
        months=months_meta, fields=grid_months,
    )
    world, country_meta = geo.export_countries()
    present = set(p["iso"] for p in pts)
    model_json = dict(
        kernels=[dict(id=K["id"], name=K["name"], lat=K["lat"], lng=K["lng"]) for K in config.KERNELS
                 if K["id"] != "tropical_background"],
        nino34=config.NINO34,
        crops=[dict(name=c[0], crop=c[1], lat=c[2], lng=c[3]) for c in config.CROP_REGIONS],
        dams=[dict(name=d[0], lat=d[1], lng=d[2], capacityGW=d[3]) for d in config.HYDRO_SITES],
        countries=[m for m in country_meta if m["iso"] in present],
        params=dict(rainCapWet=150, rainCapDry=85),
        baseTemperatureRmse=r(bt_model.rmse, 2),
    )
    rv = [v["rain_r"] for v in validation if v["rain_r"] is not None]
    tv = [v["temp_r"] for v in validation if v["temp_r"] is not None]
    manifest = dict(
        generatedAt=datetime.now(timezone.utc).isoformat(timespec="seconds"), referenceDate=today.isoformat(),
        oni=dict(source=oni.source, last=month_key(last_obs), records=len(oni.values)),
        era5=dict(cities=len(city_rows), statuses=sorted(set(city_status.values()))),
        elevation=elev_status, gridPoints=len(pts),
        validation=dict(meanRainCorrelation=r(float(np.mean(rv)), 3), meanTempCorrelation=r(float(np.mean(tv)), 3),
                        cities=len(rv),
                        note="Correlación entre el modelo de teleconexiones (sin calibrar) y las anomalías ERA5 observadas 1950-presente."),
        runtimeSeconds=None,
    )
    sizes = {
        "oni.json": write_json("oni.json", oni_json),
        "grid.json": write_json("grid.json", grid_json),
        "cities.json": write_json("cities.json", dict(cities=cities_out, months=months_meta)),
        "analogs.json": write_json("analogs.json", dict(query=dict(
            start=month_key(q_end - config.ANALOG_WINDOW + 1), end=month_key(q_end),
            values=arr(query), weights=arr(q_w, 3)), analogs=analogs)),
        "model.json": write_json("model.json", model_json),
        "countries.json": write_json("countries.json", world),
    }
    manifest["runtimeSeconds"] = round(time.time() - t0, 1)
    manifest["files"] = sizes
    write_json("manifest.json", manifest)
    for k, v in sizes.items():
        log(f"  → {k:15s} {v/1024:8.1f} KB")
    log(f"Validación ERA5: r lluvia medio = {manifest['validation']['meanRainCorrelation']}, "
        f"r temperatura medio = {manifest['validation']['meanTempCorrelation']}")
    log(f"Listo en {manifest['runtimeSeconds']} s")


if __name__ == "__main__":
    main()
