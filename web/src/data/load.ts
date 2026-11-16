import type { AppData } from './types';

const FILES = ['oni', 'grid', 'cities', 'analogs', 'model', 'countries', 'manifest'] as const;

export async function loadData(onProgress: (loaded: number, total: number) => void): Promise<AppData> {
  let done = 0;
  const base = `${import.meta.env.BASE_URL}data/`;
  const parts = await Promise.all(
    FILES.map(async (f) => {
      const res = await fetch(`${base}${f}.json`);
      if (!res.ok) throw new Error(`No se pudo cargar ${f}.json (HTTP ${res.status})`);
      const json = await res.json();
      onProgress(++done, FILES.length);
      return json;
    }),
  );
  const [oni, grid, cities, analogs, model, countries, manifest] = parts;
  return { oni, grid, cities: cities.cities, analogs, model, countries, manifest } as AppData;
}
