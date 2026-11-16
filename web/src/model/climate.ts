/**
 * Browser mirror of pipeline/enso_pipeline/model.py (response + risks) and
 * pipeline/enso_pipeline/cities.py (recommendations). Keep them in sync:
 * `npm test` verifies parity against the JSON exported by the pipeline.
 */
import type { Level, Recommendation } from '../data/types';

export const RAIN_CAP_WET = 150;
export const RAIN_CAP_DRY = 85;

export interface Coef {
  rP: number;
  rN: number;
  tP: number;
  tN: number;
}

/** Expected temperature anomaly (°C) and rain anomaly (%) for a given ONI. */
export function response(oni: number, c: Coef, trend: number): [number, number] {
  const lin = (oni >= 0 ? c.rP : c.rN) * oni;
  const rain = lin >= 0 ? RAIN_CAP_WET * Math.tanh(lin / RAIN_CAP_WET) : -RAIN_CAP_DRY * Math.tanh(-lin / RAIN_CAP_DRY);
  const temp = (oni >= 0 ? c.tP : c.tN) * oni + trend;
  return [temp, rain];
}

const soft = (x: number) => 1 - Math.exp(-Math.max(0, x));
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** Agro, energy/hydro and urban-health risk indices (0-100). */
export function risks(
  temp: number,
  rain: number,
  baseT: number,
  ea: number,
  eh: number,
  u: number,
  elev: number,
): [number, number, number] {
  const hAgri = Math.max(0, -rain) / 30 + (0.8 * Math.max(0, rain - 20)) / 45 + (0.5 * Math.max(0, temp - 0.3)) / 1.2;
  const agri = 100 * ea * soft(1.3 * hAgri);

  const hydro = eh * (Math.max(0, -rain) / 28 + (0.35 * Math.max(0, rain - 50)) / 60);
  const demand = u * Math.max(0, temp - 0.2) * clamp((baseT + temp - 18) / 10, 0, 1);
  const energy = 100 * soft(1.4 * hydro + demand);

  const tEff = baseT + temp;
  const heat = Math.max(0, tEff - 26) / 5;
  const suit = tEff >= 15 ? Math.exp(-(((tEff - 28) / 5.5) ** 2)) : 0;
  const moist = clamp(1 + rain / 120, 0.4, 1.8);
  const alt = elev < 2000 ? 1 : Math.exp(-(elev - 2000) / 400);
  const dengue = suit * moist * alt * (1 + 0.5 * Math.max(0, temp));
  const health = 100 * soft((0.3 + 0.7 * u) * (0.9 * heat + 0.8 * dengue));
  return [agri, energy, health];
}

export function level(risk: number): Level {
  return risk < 25 ? 'bajo' : risk < 50 ? 'moderado' : risk < 75 ? 'alto' : 'extremo';
}

export interface PeakInfo {
  risk: number;
  rain: number;
  temp: number;
  monthName: string;
}

/** Practical recommendations from the peak-risk month of each sector. */
export function recommendations(
  peak: { agri: PeakInfo; energy: PeakInfo; health: PeakInfo },
  crop: string | null,
  dam: string | null,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const { agri: a, energy: e, health: h } = peak;
  const cropName = crop ?? 'los cultivos de la zona';
  if (a.risk >= 25) {
    let text: string;
    if (a.rain <= -10)
      text = `Déficit hídrico previsto en ${a.monthName}: planificar riego suplementario, escalonar fechas de siembra y priorizar variedades tolerantes a sequía de ${cropName}.`;
    else if (a.rain >= 20)
      text = `Exceso de lluvias previsto en ${a.monthName}: reforzar drenajes, vigilar enfermedades fúngicas en ${cropName} y planificar la logística de cosecha ante caminos anegados.`;
    else
      text = `Estrés térmico previsto en ${a.monthName}: ajustar calendarios de riego y aplicaciones, y monitorear el llenado de grano/fruto de ${cropName}.`;
    recs.push({ sector: 'agro', level: level(a.risk), text });
  }
  if (e.risk >= 25) {
    let text: string;
    if (e.rain <= -10 && dam)
      text = `Menor aporte hídrico a ${dam} hacia ${e.monthName}: anticipar despacho térmico, gestionar reservas y preparar campañas de ahorro energético.`;
    else if (e.rain >= 40 && dam)
      text = `Caudales altos esperados en ${dam}: revisar protocolos de vertimiento y alertas aguas abajo.`;
    else
      text = `Picos de demanda eléctrica por calor en ${e.monthName}: reforzar respaldo en horas punta y promover eficiencia en climatización.`;
    recs.push({ sector: 'energia', level: level(e.risk), text });
  }
  if (h.risk >= 25) {
    const text =
      h.temp >= 0.4 || h.rain >= 10
        ? `Condiciones favorables al Aedes aegypti en ${h.monthName}: intensificar la eliminación de criaderos, la vigilancia de dengue y las campañas de prevención.`
        : `Riesgo sanitario urbano en ${h.monthName}: activar planes de calor (hidratación, pausas en trabajo al aire libre, atención a adultos mayores) y vigilancia epidemiológica.`;
    recs.push({ sector: 'salud', level: level(h.risk), text });
  }
  if (!recs.length)
    recs.push({
      sector: 'general',
      level: 'bajo',
      text: 'Condiciones cercanas a lo normal: mantener el monitoreo de los boletines oficiales del servicio meteorológico nacional.',
    });
  return recs;
}
