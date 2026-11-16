/** Visual layers: which field drives column height/colour and the legend. */
import type { Fields } from './engine';

export type Layer = 'climate' | 'agri' | 'energy' | 'health';
export type ClimateVar = 'rain' | 'temp';

type RGB = [number, number, number];
interface Stop {
  v: number;
  c: RGB;
}

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

function scale(stops: { v: number; c: string }[]) {
  const s: Stop[] = stops.map((x) => ({ v: x.v, c: hex(x.c) }));
  return (v: number, out: RGB = [0, 0, 0]): RGB => {
    if (v <= s[0].v) return ((out[0] = s[0].c[0]), (out[1] = s[0].c[1]), (out[2] = s[0].c[2]), out);
    for (let i = 1; i < s.length; i++) {
      if (v <= s[i].v) {
        const f = (v - s[i - 1].v) / (s[i].v - s[i - 1].v);
        for (let j = 0; j < 3; j++) out[j] = s[i - 1].c[j] + (s[i].c[j] - s[i - 1].c[j]) * f;
        return out;
      }
    }
    const l = s[s.length - 1].c;
    out[0] = l[0];
    out[1] = l[1];
    out[2] = l[2];
    return out;
  };
}

const RAIN_STOPS = [
  { v: -60, c: '#ff4f4a' },
  { v: -30, c: '#ff8a5c' },
  { v: -8, c: '#8a6a62' },
  { v: 0, c: '#3d4757' },
  { v: 8, c: '#3f6f9a' },
  { v: 30, c: '#3aa6ff' },
  { v: 80, c: '#62ecff' },
];
const TEMP_STOPS = [
  { v: -1.5, c: '#2f6bff' },
  { v: -0.5, c: '#5fa0ff' },
  { v: 0, c: '#414a5a' },
  { v: 0.6, c: '#c98a5a' },
  { v: 1.4, c: '#ff8a4c' },
  { v: 2.6, c: '#ff4552' },
];
const RISK_STOPS = [
  { v: 0, c: '#1f3f73' },
  { v: 15, c: '#2a73c2' },
  { v: 35, c: '#36b9d0' },
  { v: 55, c: '#f2c35b' },
  { v: 75, c: '#ff8748' },
  { v: 100, c: '#ff3f55' },
];

export interface LayerSpec {
  id: string;
  title: string;
  subtitle: string;
  unit: string;
  stops: { v: number; c: string }[];
  ticks: string[];
  color: (v: number, out?: RGB) => RGB;
  height: (v: number) => number; // 0..1
  field: (f: Fields) => Float32Array[];
  format: (v: number) => string;
}

const sign = (v: number, d = 0) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

export const LAYER_SPECS: Record<'rain' | 'temp' | 'agri' | 'energy' | 'health', LayerSpec> = {
  rain: {
    id: 'rain',
    title: 'Anomalía de lluvia',
    subtitle: 'Variación respecto a la media 1991-2020',
    unit: '%',
    stops: RAIN_STOPS,
    ticks: ['−60 %', 'seco', '0', 'húmedo', '+80 %'],
    color: scale(RAIN_STOPS),
    height: (v) => Math.min(Math.abs(v), 110) / 110,
    field: (f) => f.rain,
    format: (v) => `${sign(v)} %`,
  },
  temp: {
    id: 'temp',
    title: 'Anomalía de temperatura',
    subtitle: 'Respecto a la normal 1991-2020 (incluye tendencia)',
    unit: '°C',
    stops: TEMP_STOPS,
    ticks: ['−1.5 °C', '', '0', '', '+2.6 °C'],
    color: scale(TEMP_STOPS),
    height: (v) => Math.min(Math.abs(v), 3) / 3,
    field: (f) => f.temp,
    format: (v) => `${sign(v, 1)} °C`,
  },
  agri: {
    id: 'agri',
    title: 'Riesgo agropecuario',
    subtitle: 'Sequía, exceso hídrico y calor sobre cultivos clave',
    unit: '/100',
    stops: RISK_STOPS,
    ticks: ['0', 'bajo', 'moderado', 'alto', '100'],
    color: scale(RISK_STOPS),
    height: (v) => v / 100,
    field: (f) => f.agri,
    format: (v) => `${v.toFixed(0)}/100`,
  },
  energy: {
    id: 'energy',
    title: 'Riesgo energético e hídrico',
    subtitle: 'Caudal en grandes represas y picos de demanda por calor',
    unit: '/100',
    stops: RISK_STOPS,
    ticks: ['0', 'bajo', 'moderado', 'alto', '100'],
    color: scale(RISK_STOPS),
    height: (v) => v / 100,
    field: (f) => f.energy,
    format: (v) => `${v.toFixed(0)}/100`,
  },
  health: {
    id: 'health',
    title: 'Riesgo de salud urbana',
    subtitle: 'Estrés térmico y condiciones para el dengue',
    unit: '/100',
    stops: RISK_STOPS,
    ticks: ['0', 'bajo', 'moderado', 'alto', '100'],
    color: scale(RISK_STOPS),
    height: (v) => v / 100,
    field: (f) => f.health,
    format: (v) => `${v.toFixed(0)}/100`,
  },
};

export function activeSpec(layer: Layer, climateVar: ClimateVar): LayerSpec {
  return layer === 'climate' ? LAYER_SPECS[climateVar] : LAYER_SPECS[layer];
}

export const LAYERS: { id: Layer; label: string; short: string }[] = [
  { id: 'climate', label: 'Clima general', short: 'Clima' },
  { id: 'agri', label: 'Agro y cosechas', short: 'Agro' },
  { id: 'energy', label: 'Energía y represas', short: 'Energía' },
  { id: 'health', label: 'Salud urbana', short: 'Salud' },
];

export const PHASE_COLOR = { nino: '#ff6a3d', nina: '#36d6ff', neutral: '#b8c2d0' } as const;

export function phaseOf(oni: number): 'nino' | 'nina' | 'neutral' {
  return oni >= 0.5 ? 'nino' : oni <= -0.5 ? 'nina' : 'neutral';
}

export function categoryOf(oni: number): string {
  if (oni >= 1.5) return 'El Niño fuerte';
  if (oni >= 0.5) return 'El Niño';
  if (oni <= -1.5) return 'La Niña fuerte';
  if (oni <= -0.5) return 'La Niña';
  return 'Neutral';
}

export const LEVEL_COLOR = { bajo: '#36b9d0', moderado: '#f2c35b', alto: '#ff8748', extremo: '#ff3f55' } as const;

export function fmtSigned(v: number, d = 1): string {
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;
}
