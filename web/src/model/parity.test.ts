import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppData, CityData, GridData } from '../data/types';
import { buildTrajectory, computeCity, computeGrid, officialMean } from './engine';

const load = <T,>(f: string): T => JSON.parse(readFileSync(resolve(__dirname, '../../public/data', f), 'utf8')) as T;
const grid = load<GridData>('grid.json');
const cities = load<{ cities: CityData[] }>('cities.json').cities;
const data = { grid, cities, analogs: load('analogs.json') } as unknown as AppData;

function maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

describe('TypeScript model reproduces the Python pipeline', () => {
  const traj = buildTrajectory(data, { kind: 'forecast' }, null);
  const fields = computeGrid(grid, traj);

  it('grid fields match for every month', () => {
    grid.fields.forEach((f, k) => {
      // tolerances reflect the rounding applied when exporting JSON
      expect(maxDiff(fields.temp[k], f.temp)).toBeLessThan(0.03);
      expect(maxDiff(fields.rain[k], f.rain)).toBeLessThan(0.3);
      expect(maxDiff(fields.agri[k], f.agri)).toBeLessThan(0.6);
      expect(maxDiff(fields.energy[k], f.energy)).toBeLessThan(0.6);
      expect(maxDiff(fields.health[k], f.health)).toBeLessThan(0.6);
    });
  });

  it('city projections match', () => {
    for (const c of cities) {
      const rows = computeCity(c, traj);
      rows.forEach((r, k) => {
        const p = c.months[k];
        expect(Math.abs(r.tempAnom - p.tempAnom)).toBeLessThan(0.03);
        expect(Math.abs(r.rainPct - p.rainPct)).toBeLessThan(0.3);
        expect(Math.abs(r.agri - p.agri)).toBeLessThan(0.6);
        expect(Math.abs(r.energy - p.energy)).toBeLessThan(0.6);
        expect(Math.abs(r.health - p.health)).toBeLessThan(0.6);
      });
    }
  });

  it('What-If scenario equal to the official mean is a no-op, and stronger El Niño dries the Amazon', () => {
    const same = buildTrajectory(data, { kind: 'forecast' }, officialMean(grid));
    expect(same.kind).toBe('forecast');
    const strong = computeGrid(grid, buildTrajectory(data, { kind: 'forecast' }, 2.5));
    const weak = computeGrid(grid, buildTrajectory(data, { kind: 'forecast' }, -1.5));
    const i = grid.lat.findIndex((la, k) => Math.abs(la + 3) < 1 && Math.abs(grid.lng[k] + 60) < 1.5);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(strong.rain[1][i]).toBeLessThan(0);
    expect(weak.rain[1][i]).toBeGreaterThan(0);
  });
});
