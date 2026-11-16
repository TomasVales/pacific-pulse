import { create } from 'zustand';
import type { AppData } from './data/types';
import { buildTrajectory, computeGrid, type Fields, type Mode, type Trajectory } from './model/engine';
import type { ClimateVar, Layer } from './model/layers';

export type Selection =
  | { kind: 'city'; id: string }
  | { kind: 'cell'; index: number }
  | { kind: 'country'; name: string };

export interface FlyRequest {
  lat: number;
  lng: number;
  altitude: number;
  duration?: number;
  id: number;
}

interface State {
  data: AppData | null;
  traj: Trajectory | null;
  fields: Fields | null;
  layer: Layer;
  climateVar: ClimateVar;
  t: number;
  playing: boolean;
  scenarioMean: number | null;
  mode: Mode;
  selection: Selection | null;
  spotlightOpen: boolean;
  whatIfOpen: boolean;
  compareOpen: boolean;
  windOn: boolean;
  tourStep: number | null;
  fly: FlyRequest | null;

  init: (d: AppData) => void;
  setLayer: (l: Layer) => void;
  setClimateVar: (v: ClimateVar) => void;
  setT: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setScenario: (v: number | null) => void;
  setMode: (m: Mode) => void;
  select: (s: Selection | null) => void;
  flyTo: (lat: number, lng: number, altitude?: number, duration?: number) => void;
  toggle: (k: 'spotlightOpen' | 'whatIfOpen' | 'compareOpen' | 'windOn', v?: boolean) => void;
  setTour: (s: number | null) => void;
}

let flyId = 0;

function recompute(data: AppData, mode: Mode, scenarioMean: number | null) {
  const traj = buildTrajectory(data, mode, scenarioMean);
  return { traj, fields: computeGrid(data.grid, traj) };
}

export const useStore = create<State>((set, get) => ({
  data: null,
  traj: null,
  fields: null,
  layer: 'climate',
  climateVar: 'rain',
  t: 0,
  playing: false,
  scenarioMean: null,
  mode: { kind: 'forecast' },
  selection: null,
  spotlightOpen: false,
  whatIfOpen: false,
  compareOpen: false,
  windOn: true,
  tourStep: null,
  fly: null,

  init: (data) => set({ data, ...recompute(data, { kind: 'forecast' }, null) }),
  setLayer: (layer) => set({ layer }),
  setClimateVar: (climateVar) => set({ climateVar }),
  setT: (t) => set({ t: Math.max(0, Math.min(t, (get().data?.grid.months.length ?? 6) - 1)) }),
  setPlaying: (playing) => set({ playing }),
  setScenario: (scenarioMean) => {
    const { data } = get();
    if (!data) return;
    set({ scenarioMean, mode: { kind: 'forecast' }, ...recompute(data, { kind: 'forecast' }, scenarioMean) });
  },
  setMode: (mode) => {
    const { data, scenarioMean } = get();
    if (!data) return;
    set({ mode, ...recompute(data, mode, mode.kind === 'forecast' ? scenarioMean : null) });
  },
  select: (selection) => set({ selection }),
  flyTo: (lat, lng, altitude = 1.1, duration) => set({ fly: { lat, lng, altitude, duration, id: ++flyId } }),
  toggle: (k, v) => set({ [k]: v ?? !get()[k] } as Partial<State>),
  setTour: (tourStep) => set({ tourStep }),
}));
