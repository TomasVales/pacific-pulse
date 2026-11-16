import type { AppData, CityData, ObservedMonth, Recommendation } from '../data/types';
import type { Selection } from '../store';
import { arcDeg, cellRows, computeCity, rowRecommendations, type Fields, type LocRow, type Trajectory } from './engine';

export interface LocationSummary {
  kind: 'city' | 'cell' | 'country';
  key: string;
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  elevation: number | null;
  rows: LocRow[];
  crop: string | null;
  cropRegion: string | null;
  dam: string | null;
  recs: Recommendation[];
  city: CityData | null;
  observed: ObservedMonth[] | null;
  cells: number;
}

function nearestCrop(data: AppData, lat: number, lng: number) {
  let best: { name: string; crop: string } | null = null;
  let bd = 4.5;
  for (const c of data.model.crops) {
    const d = arcDeg(lat, lng, c.lat, c.lng);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

function nearestDam(data: AppData, lat: number, lng: number) {
  let best: string | null = null;
  let bd = 5;
  for (const c of data.model.dams) {
    const d = arcDeg(lat, lng, c.lat, c.lng);
    if (d < bd) {
      bd = d;
      best = c.name;
    }
  }
  return best;
}

const fmtCoord = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'O'}`;

export function summarize(
  data: AppData,
  sel: Selection,
  traj: Trajectory,
  fields: Fields,
  analogIndex: number | null,
): LocationSummary | null {
  if (sel.kind === 'city') {
    const city = data.cities.find((c) => c.id === sel.id);
    if (!city) return null;
    const rows = computeCity(city, traj);
    const crop = city.crop?.crop ?? null;
    const dam = city.dam?.name ?? null;
    return {
      kind: 'city',
      key: `city:${city.id}`,
      title: city.name,
      subtitle: `${city.country} · ${city.population.toFixed(1)} M hab. · ${Math.round(city.elevation)} m`,
      lat: city.lat,
      lng: city.lng,
      elevation: city.elevation,
      rows,
      crop,
      cropRegion: city.crop?.region ?? null,
      dam,
      recs: rowRecommendations(rows, crop, dam),
      city,
      observed: analogIndex !== null ? city.analogObserved[analogIndex] ?? null : null,
      cells: 1,
    };
  }
  if (sel.kind === 'cell') {
    const i = sel.index;
    const lat = data.grid.lat[i];
    const lng = data.grid.lng[i];
    const rows = cellRows(fields, traj, [i]);
    const crop = nearestCrop(data, lat, lng);
    const dam = nearestDam(data, lat, lng);
    return {
      kind: 'cell',
      key: `cell:${i}`,
      title: data.grid.countries[data.grid.country[i]],
      subtitle: `${fmtCoord(lat, lng)} · ${Math.round(data.grid.elev[i])} m`,
      lat,
      lng,
      elevation: data.grid.elev[i],
      rows,
      crop: crop?.crop ?? null,
      cropRegion: crop?.name ?? null,
      dam,
      recs: rowRecommendations(rows, crop?.crop ?? null, dam),
      city: null,
      observed: null,
      cells: 1,
    };
  }
  const ci = data.grid.countries.indexOf(sel.name);
  const meta = data.model.countries.find((c) => c.name === sel.name);
  if (ci < 0 || !meta) return null;
  const idx: number[] = [];
  for (let i = 0; i < data.grid.n; i++) if (data.grid.country[i] === ci) idx.push(i);
  const rows = cellRows(fields, traj, idx);
  const crop = nearestCrop(data, meta.lat, meta.lng);
  const dam = nearestDam(data, meta.lat, meta.lng);
  return {
    kind: 'country',
    key: `country:${sel.name}`,
    title: sel.name,
    subtitle: `Promedio de ${idx.length} celdas · ${(meta.population / 1e6).toFixed(1)} M hab.`,
    lat: meta.lat,
    lng: meta.lng,
    elevation: null,
    rows,
    crop: crop?.crop ?? null,
    cropRegion: crop?.name ?? null,
    dam,
    recs: rowRecommendations(rows, crop?.crop ?? null, dam),
    city: null,
    observed: null,
    cells: idx.length,
  };
}
