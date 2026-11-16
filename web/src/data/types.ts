// Shapes of the JSON files produced by pipeline/run.py

export type Phase = 'nino' | 'nina' | 'neutral';
export type Level = 'bajo' | 'moderado' | 'alto' | 'extremo';
export type Sector = 'agri' | 'energy' | 'health';

export interface MonthMeta {
  key: string;
  year: number;
  m0: number;
  label: string;
  short: string;
  decimalYear: number;
  oni: number;
  lower: number;
  upper: number;
  observed: boolean;
  phase: Phase;
  category: string;
}

export interface GridMonthFields {
  rP: number[];
  rN: number[];
  tP: number[];
  tN: number[];
  ea: number[];
  bt: number[];
  temp: number[];
  rain: number[];
  agri: number[];
  energy: number[];
  health: number[];
}

export interface GridData {
  n: number;
  spacing: number;
  countries: string[];
  lat: number[];
  lng: number[];
  elev: number[];
  country: number[];
  eh: number[];
  u: number[];
  slope: number[];
  clim_mid: number;
  months: MonthMeta[];
  fields: GridMonthFields[];
}

export interface OniData {
  source: string;
  sourceUrl: string | null;
  retrievedAt: string;
  attempts: { source: string; ok: boolean; records?: number; error?: string }[];
  lastObserved: { key: string; season: string; value: number; phase: Phase; category: string };
  history: (number | null)[];
  historyStart: string;
  forecast: { key: string; mean: number; lower: number; upper: number }[];
  hindcast: { lead: number; month: string; rmse: number; corr: number; regressionWeight: number; regression: number; knn: number }[];
  method: string;
}

export interface CityMonth {
  key: string;
  label: string;
  short: string;
  tempAnom: number;
  rainPct: number;
  climT: number;
  climP: number;
  temp: number;
  precip: number;
  agri: number;
  energy: number;
  health: number;
  levels: Record<Sector, Level>;
}

export interface Recommendation {
  sector: 'agro' | 'energia' | 'salud' | 'general';
  level: Level;
  text: string;
}

export interface ObservedMonth {
  key: string;
  temp: number | null;
  precip: number | null;
  tempAnom: number | null;
  rainPct: number | null;
}

export interface CityData {
  id: string;
  name: string;
  country: string;
  lat: number;
  lng: number;
  population: number;
  elevation: number;
  climT: number[];
  climP: number[];
  trendPerDecade: number;
  slope: number;
  eh: number;
  crop: { region: string; crop: string } | null;
  dam: { name: string; distanceDeg: number } | null;
  coef: { rP: number; rN: number; tP: number; tN: number; ea: number }[];
  months: CityMonth[];
  recommendations: Recommendation[];
  analogObserved: ObservedMonth[][];
  validation: { rain_r: number | null; temp_r: number | null; n_rain: number; n_temp: number };
  era5: { first: string; last: string; status: string };
}

export interface AnalogMonth {
  key: string;
  label: string;
  short: string;
  oni: number;
  decimalYear: number;
}

export interface Analog {
  label: string;
  start: string;
  end: string;
  similarity: number;
  rmse: number;
  correlation: number;
  phase_shift: number;
  peak: { value: number; month: string };
  kind: string;
  intensity: string;
  summary: string;
  narrative: string;
  oni: { month: string; value: number }[];
  months: AnalogMonth[];
  offset: number;
}

export interface AnalogData {
  query: { start: string; end: string; values: number[]; weights: number[] };
  analogs: Analog[];
}

export interface ModelData {
  kernels: { id: string; name: string; lat: number; lng: number }[];
  nino34: { lat_min: number; lat_max: number; lng_min: number; lng_max: number; lat: number; lng: number };
  crops: { name: string; crop: string; lat: number; lng: number }[];
  dams: { name: string; lat: number; lng: number; capacityGW: number }[];
  countries: { iso: string; name: string; lat: number; lng: number; population: number }[];
  params: { rainCapWet: number; rainCapDry: number };
  baseTemperatureRmse: number;
}

export interface Manifest {
  generatedAt: string;
  referenceDate: string;
  oni: { source: string; last: string; records: number };
  era5: { cities: number; statuses: string[] };
  elevation: string;
  gridPoints: number;
  validation: { meanRainCorrelation: number; meanTempCorrelation: number; cities: number; note: string };
  runtimeSeconds: number;
  files: Record<string, number>;
}

export interface CountryFeature {
  type: 'Feature';
  properties: { n: string; l: 0 | 1; iso?: string };
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}

export interface AppData {
  oni: OniData;
  grid: GridData;
  cities: CityData[];
  analogs: AnalogData;
  model: ModelData;
  countries: { type: 'FeatureCollection'; features: CountryFeature[] };
  manifest: Manifest;
}
