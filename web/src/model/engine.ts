/**
 * Scenario engine: builds ONI trajectories (official forecast, What-If
 * scenario or historical analog) and recomputes every grid column and city.
 */
import type { AppData, CityData, GridData, Level, Recommendation } from '../data/types';
import { level, recommendations, response, risks } from './climate';

export type Mode = { kind: 'forecast' } | { kind: 'analog'; index: number };

export interface Trajectory {
  kind: 'forecast' | 'scenario' | 'analog';
  title: string;
  oni: number[];
  lower: number[] | null;
  upper: number[] | null;
  decimalYear: number[];
  keys: string[];
  labels: string[];
  short: string[];
  /** calendar month (0-11) used for teleconnection coefficients */
  m0: number[];
}

export interface Fields {
  n: number;
  months: number;
  temp: Float32Array[];
  rain: Float32Array[];
  agri: Float32Array[];
  energy: Float32Array[];
  health: Float32Array[];
  bt: Float32Array[];
}

export interface LocRow {
  key: string;
  label: string;
  short: string;
  oni: number;
  tempAnom: number;
  rainPct: number;
  temp: number;
  precip: number | null;
  agri: number;
  energy: number;
  health: number;
}

export const CLIM_MID = 2006.0;

export function officialMean(grid: GridData): number {
  return grid.months.reduce((s, m) => s + m.oni, 0) / grid.months.length;
}

export function buildTrajectory(data: AppData, mode: Mode, scenarioMean: number | null): Trajectory {
  const months = data.grid.months;
  const base = {
    m0: months.map((m) => m.m0),
  };
  if (mode.kind === 'analog') {
    const a = data.analogs.analogs[mode.index];
    return {
      ...base,
      kind: 'analog',
      title: `Ciclo ${a.label}`,
      oni: a.months.map((m) => m.oni),
      lower: null,
      upper: null,
      decimalYear: a.months.map((m) => m.decimalYear),
      keys: a.months.map((m) => m.key),
      labels: a.months.map((m) => m.label),
      short: a.months.map((m) => `${m.short} ${String(m.key.slice(2, 4))}`),
    };
  }
  const official = officialMean(data.grid);
  const offset = scenarioMean === null ? 0 : scenarioMean - official;
  const isScenario = Math.abs(offset) > 0.004;
  return {
    ...base,
    kind: isScenario ? 'scenario' : 'forecast',
    title: isScenario ? 'Escenario What-If' : 'Proyección oficial',
    oni: months.map((m) => m.oni + offset),
    lower: months.map((m) => m.lower + offset),
    upper: months.map((m) => m.upper + offset),
    decimalYear: months.map((m) => m.decimalYear),
    keys: months.map((m) => m.key),
    labels: months.map((m) => m.label),
    short: months.map((m) => m.short),
  };
}

export function computeGrid(grid: GridData, traj: Trajectory): Fields {
  const n = grid.n;
  const M = grid.months.length;
  const out: Fields = { n, months: M, temp: [], rain: [], agri: [], energy: [], health: [], bt: [] };
  for (let k = 0; k < M; k++) {
    const f = grid.fields[k];
    const T = new Float32Array(n);
    const R = new Float32Array(n);
    const A = new Float32Array(n);
    const E = new Float32Array(n);
    const H = new Float32Array(n);
    const oni = traj.oni[k];
    const dy = traj.decimalYear[k] - grid.clim_mid;
    for (let i = 0; i < n; i++) {
      const [t, r] = response(oni, { rP: f.rP[i], rN: f.rN[i], tP: f.tP[i], tN: f.tN[i] }, grid.slope[i] * dy);
      const [a, e, h] = risks(t, r, f.bt[i], f.ea[i], grid.eh[i], grid.u[i], grid.elev[i]);
      T[i] = t;
      R[i] = r;
      A[i] = a;
      E[i] = e;
      H[i] = h;
    }
    out.temp.push(T);
    out.rain.push(R);
    out.agri.push(A);
    out.energy.push(E);
    out.health.push(H);
    out.bt.push(Float32Array.from(f.bt));
  }
  return out;
}

export function computeCity(city: CityData, traj: Trajectory): LocRow[] {
  return traj.oni.map((oni, k) => {
    const m0 = traj.m0[k];
    const c = city.coef[k];
    const [t, r] = response(oni, c, city.slope * (traj.decimalYear[k] - CLIM_MID));
    const [a, e, h] = risks(t, r, city.climT[m0], c.ea, city.eh, 1, city.elevation);
    return {
      key: traj.keys[k],
      label: traj.labels[k],
      short: traj.short[k],
      oni,
      tempAnom: t,
      rainPct: r,
      temp: city.climT[m0] + t,
      precip: Math.max(0, city.climP[m0] * (1 + r / 100)),
      agri: a,
      energy: e,
      health: h,
    };
  });
}

export function cellRows(fields: Fields, traj: Trajectory, idx: number[]): LocRow[] {
  const rows: LocRow[] = [];
  for (let k = 0; k < fields.months; k++) {
    let t = 0,
      r = 0,
      a = 0,
      e = 0,
      h = 0,
      b = 0;
    for (const i of idx) {
      t += fields.temp[k][i];
      r += fields.rain[k][i];
      a += fields.agri[k][i];
      e += fields.energy[k][i];
      h += fields.health[k][i];
      b += fields.bt[k][i];
    }
    const n = idx.length;
    rows.push({
      key: traj.keys[k],
      label: traj.labels[k],
      short: traj.short[k],
      oni: traj.oni[k],
      tempAnom: t / n,
      rainPct: r / n,
      temp: (b + t) / n,
      precip: null,
      agri: a / n,
      energy: e / n,
      health: h / n,
    });
  }
  return rows;
}

export function sample(arr: Float32Array[], i: number, t: number): number {
  const k = Math.min(Math.floor(t), arr.length - 1);
  const k2 = Math.min(k + 1, arr.length - 1);
  const f = t - k;
  return arr[k][i] * (1 - f) + arr[k2][i] * f;
}

export function lerpRow(rows: LocRow[], t: number): LocRow {
  const k = Math.min(Math.floor(t), rows.length - 1);
  const k2 = Math.min(k + 1, rows.length - 1);
  const f = t - k;
  const a = rows[k];
  const b = rows[k2];
  const mix = (x: number, y: number) => x * (1 - f) + y * f;
  return {
    ...(f < 0.5 ? a : b),
    oni: mix(a.oni, b.oni),
    tempAnom: mix(a.tempAnom, b.tempAnom),
    rainPct: mix(a.rainPct, b.rainPct),
    temp: mix(a.temp, b.temp),
    precip: a.precip === null || b.precip === null ? null : mix(a.precip, b.precip),
    agri: mix(a.agri, b.agri),
    energy: mix(a.energy, b.energy),
    health: mix(a.health, b.health),
  };
}

export function rowRecommendations(rows: LocRow[], crop: string | null, dam: string | null): Recommendation[] {
  const peak = (key: 'agri' | 'energy' | 'health') => {
    let best = rows[0];
    for (const r of rows) if (r[key] > best[key]) best = r;
    return { risk: best[key], rain: best.rainPct, temp: best.tempAnom, monthName: best.label };
  };
  return recommendations({ agri: peak('agri'), energy: peak('energy'), health: peak('health') }, crop, dam);
}

export function peakLevel(rows: LocRow[], key: 'agri' | 'energy' | 'health'): { value: number; level: Level; label: string } {
  let best = rows[0];
  for (const r of rows) if (r[key] > best[key]) best = r;
  return { value: best[key], level: level(best[key]), label: best.label };
}

/** Haversine distance in degrees of arc. */
export function arcDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = Math.PI / 180;
  const dp = (lat2 - lat1) * r;
  const dl = (lng2 - lng1) * r;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dl / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / r;
}

export function nearestCell(grid: GridData, lat: number, lng: number): { index: number; dist: number } {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < grid.n; i++) {
    const dLat = grid.lat[i] - lat;
    if (Math.abs(dLat) > bd) continue;
    const d = arcDeg(lat, lng, grid.lat[i], grid.lng[i]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { index: best, dist: bd };
}
