import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { AppData } from '../data/types';
import type { Fields, Trajectory } from '../model/engine';
import type { ClimateVar, Layer } from '../model/layers';
import { categoryOf, fmtSigned } from '../model/layers';
import { IconChevL, IconChevR, IconClose, IconPause, IconPlay } from './Icons';

const STEP_MS = 12000;

interface Box {
  lat: [number, number];
  lng: [number, number];
}

function regionMean(data: AppData, arr: Float32Array, box: Box): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < data.grid.n; i++) {
    const la = data.grid.lat[i];
    const lo = data.grid.lng[i];
    if (la >= box.lat[0] && la <= box.lat[1] && lo >= box.lng[0] && lo <= box.lng[1]) {
      s += arr[i];
      n++;
    }
  }
  return n ? s / n : 0;
}

function strongestMonth(data: AppData, f: Float32Array[], box: Box): number {
  let best = 0;
  let bv = -1;
  f.forEach((arr, k) => {
    const v = Math.abs(regionMean(data, arr, box));
    if (v > bv) {
      bv = v;
      best = k;
    }
  });
  return best;
}

interface Stop {
  eyebrow: string;
  title: string;
  text: string;
  stats: { v: string; l: string }[];
  pov: { lat: number; lng: number; altitude: number };
  layer: Layer;
  climateVar: ClimateVar;
  month: number;
}

const AMAZON: Box = { lat: [-12, 4], lng: [-74, -50] };
const NORTH_ANDES: Box = { lat: [0, 12], lng: [-78, -60] };
const PLATA: Box = { lat: [-36, -22], lng: [-63, -49] };
const PAMPAS: Box = { lat: [-38, -28], lng: [-65, -57] };
const DRY_CORRIDOR: Box = { lat: [11, 16], lng: [-92, -83] };
const CARIB: Box = { lat: [8, 24], lng: [-92, -60] };

function buildStops(data: AppData, traj: Trajectory, f: Fields): Stop[] {
  const peakK = traj.oni.reduce((b, v, i, a) => (Math.abs(v) > Math.abs(a[b]) ? i : b), 0);
  const peak = traj.oni[peakK];
  const nino = peak >= 0.5;
  const nina = peak <= -0.5;
  const phaseName = nino ? 'El Niño' : nina ? 'La Niña' : 'una fase neutral';
  const last = data.oni.lastObserved;

  const kA = strongestMonth(data, f.rain, AMAZON);
  const amazonRain = regionMean(data, f.rain[kA], AMAZON);
  const andesRain = regionMean(data, f.rain[kA], NORTH_ANDES);
  const andesEnergy = regionMean(data, f.energy[kA], NORTH_ANDES);

  const kP = strongestMonth(data, f.rain, PLATA);
  const plataRain = regionMean(data, f.rain[kP], PLATA);
  const pampasAgri = regionMean(data, f.agri[kP], PAMPAS);
  const pampasTemp = regionMean(data, f.temp[kP], PAMPAS);

  const kC = strongestMonth(data, f.health, CARIB);
  const corrRain = regionMean(data, f.rain[kC], DRY_CORRIDOR);
  const caribHealth = regionMean(data, f.health[kC], CARIB);
  const caribTemp = regionMean(data, f.temp[kC], CARIB);

  const pct = (v: number) => `${fmtSigned(v, 0)} %`;
  return [
    {
      eyebrow: '1 · El origen',
      title: nino ? 'El Pacífico ecuatorial está ardiendo' : nina ? 'El Pacífico ecuatorial se enfría' : 'Un Pacífico en equilibrio',
      text: nino
        ? `Los vientos alisios se debilitan y el agua cálida que suele acumularse junto a Indonesia se desplaza hacia el este. La región Niño 3.4 registró ${fmtSigned(last.value, 2)} °C en ${last.season} ${last.key.slice(0, 4)} y el modelo proyecta un pico de ${fmtSigned(peak, 2)} °C en ${traj.labels[peakK]}. Ese calor reorganiza la convección tropical y, a través de la atmósfera, el clima de todo el continente.`
        : nina
          ? `Los alisios se intensifican y empujan el agua cálida hacia el oeste: aflora agua fría frente a Sudamérica. La región Niño 3.4 registró ${fmtSigned(last.value, 2)} °C y el modelo proyecta ${fmtSigned(peak, 2)} °C en ${traj.labels[peakK]}.`
          : `La región Niño 3.4 se mantiene cerca de lo normal (${fmtSigned(last.value, 2)} °C). Sin un forzante ENSO dominante, las teleconexiones son débiles y otros factores gobiernan el clima regional.`,
      stats: [
        { v: `${fmtSigned(last.value, 2)} °C`, l: `ONI ${last.season} ${last.key.slice(0, 4)}` },
        { v: `${fmtSigned(peak, 2)} °C`, l: `Pico proyectado · ${traj.short[peakK]}` },
        { v: categoryOf(peak), l: 'Fase' },
      ],
      pov: { lat: 2, lng: -128, altitude: 1.85 },
      layer: 'climate',
      climateVar: 'temp',
      month: peakK,
    },
    {
      eyebrow: '2 · Amazonía y Andes del norte',
      title: amazonRain < 0 ? 'Menos lluvia, ríos y embalses en descenso' : 'Más lluvia sobre la cuenca amazónica',
      text:
        amazonRain < 0
          ? `Con ${phaseName}, la rama descendente de la circulación de Walker se instala sobre el norte de Sudamérica e inhibe las tormentas. En ${traj.labels[kA]} la lluvia de la Amazonía quedaría en ${pct(amazonRain)} y en Colombia y Venezuela en ${pct(andesRain)}: menos caudal para Guri, Hidroituango o el sistema andino, y mayor riesgo de incendios forestales.`
          : `Con ${phaseName}, la convección se refuerza sobre el norte de Sudamérica. En ${traj.labels[kA]} la lluvia en la Amazonía sería ${pct(amazonRain)} y en Colombia y Venezuela ${pct(andesRain)}, con embalses altos y riesgo de crecidas y deslizamientos.`,
      stats: [
        { v: pct(amazonRain), l: `Lluvia Amazonía · ${traj.short[kA]}` },
        { v: pct(andesRain), l: 'Lluvia Colombia–Venezuela' },
        { v: `${Math.round(andesEnergy)}/100`, l: 'Riesgo energético medio' },
      ],
      pov: { lat: -1, lng: -66, altitude: 1.25 },
      layer: 'energy',
      climateVar: 'rain',
      month: kA,
    },
    {
      eyebrow: '3 · Cono Sur y Cuenca del Plata',
      title: plataRain > 0 ? 'Lluvias abundantes en la Cuenca del Plata' : 'Sequía en el granero de Sudamérica',
      text:
        plataRain > 0
          ? `La corriente en chorro subtropical se refuerza y el chorro de bajo nivel al este de los Andes transporta más humedad hacia el sur. En ${traj.labels[kP]} la lluvia en el noreste argentino, Uruguay, Paraguay y el sur de Brasil sería ${pct(plataRain)}: buenas reservas hídricas para la soja y el maíz, pero riesgo de anegamientos y crecidas del Paraná y del Uruguay. Temperatura en la Pampa: ${fmtSigned(pampasTemp, 1)} °C.`
          : `El bloqueo atmosférico desvía las tormentas: en ${traj.labels[kP]} la lluvia en la Cuenca del Plata sería ${pct(plataRain)}. Para la soja y el maíz pampeanos esto significa estrés hídrico en plena campaña, con un riesgo agropecuario medio de ${Math.round(pampasAgri)}/100.`,
      stats: [
        { v: pct(plataRain), l: `Lluvia Cuenca del Plata · ${traj.short[kP]}` },
        { v: `${Math.round(pampasAgri)}/100`, l: 'Riesgo agro Pampa' },
        { v: `${fmtSigned(pampasTemp, 1)} °C`, l: 'Anomalía térmica Pampa' },
      ],
      pov: { lat: -30, lng: -60, altitude: 1.2 },
      layer: 'agri',
      climateVar: 'rain',
      month: kP,
    },
    {
      eyebrow: '4 · Centroamérica y el Caribe',
      title: corrRain < 0 ? 'Corredor Seco bajo presión' : 'Un Caribe más húmedo',
      text:
        corrRain < 0
          ? `${nino ? 'El Niño' : 'Este escenario'} intensifica la sequía de medio verano en el Corredor Seco (${pct(corrRain)} de lluvia) y eleva la temperatura del Caribe en ${fmtSigned(caribTemp, 1)} °C. El calor húmedo favorece al mosquito Aedes aegypti: el riesgo de salud urbana promedio llega a ${Math.round(caribHealth)}/100 en ${traj.labels[kC]}. Es momento de vigilar el dengue y planificar el agua en el Canal de Panamá.`
          : `En este escenario el Corredor Seco recibiría ${pct(corrRain)} de lluvia. La humedad y temperaturas de ${fmtSigned(caribTemp, 1)} °C mantienen un riesgo de salud urbana promedio de ${Math.round(caribHealth)}/100 en ${traj.labels[kC]}.`,
      stats: [
        { v: pct(corrRain), l: `Lluvia Corredor Seco · ${traj.short[kC]}` },
        { v: `${fmtSigned(caribTemp, 1)} °C`, l: 'Anomalía térmica regional' },
        { v: `${Math.round(caribHealth)}/100`, l: 'Riesgo salud urbana' },
      ],
      pov: { lat: 15, lng: -80, altitude: 1.3 },
      layer: 'health',
      climateVar: 'rain',
      month: kC,
    },
  ];
}

export default function Tour() {
  const data = useStore((s) => s.data)!;
  const traj = useStore((s) => s.traj)!;
  const fields = useStore((s) => s.fields)!;
  const step = useStore((s) => s.tourStep)!;
  const setTour = useStore((s) => s.setTour);
  const setLayer = useStore((s) => s.setLayer);
  const setClimateVar = useStore((s) => s.setClimateVar);
  const setT = useStore((s) => s.setT);
  const setPlaying = useStore((s) => s.setPlaying);
  const select = useStore((s) => s.select);
  const flyTo = useStore((s) => s.flyTo);
  const stops = useMemo(() => buildStops(data, traj, fields), [data, traj, fields]);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const elapsed = useRef(0);

  const stop = stops[step];

  useEffect(() => {
    setPlaying(false);
    select(null);
    setLayer(stop.layer);
    setClimateVar(stop.climateVar);
    setT(stop.month);
    flyTo(stop.pov.lat, stop.pov.lng, stop.pov.altitude, 2600);
    elapsed.current = 0;
    setProgress(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const p = Math.min(1, elapsed.current / STEP_MS);
      setProgress(p);
      if (p >= 1) {
        if (step < stops.length - 1) setTour(step + 1);
        else exit();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, step]);

  const exit = () => {
    setTour(null);
    setLayer('climate');
    setClimateVar('rain');
    flyTo(-12, -92, 2.3, 2200);
  };
  const go = (d: number) => {
    const n = step + d;
    if (n < 0) return;
    if (n >= stops.length) exit();
    else setTour(n);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <>
      <div className="tour-shade" />
      <div className="tour glass glass-strong" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} role="dialog" aria-label="Tour guiado">
        <div className="stories">
          {stops.map((_, i) => (
            <div className="story" key={i} onClick={() => setTour(i)} style={{ cursor: 'pointer' }}>
              <i style={{ width: `${i < step ? 100 : i === step ? progress * 100 : 0}%` }} />
            </div>
          ))}
        </div>
        <div className="tour-step">{stop.eyebrow}</div>
        <h2>{stop.title}</h2>
        <p>{stop.text}</p>
        <div className="tour-stats">
          {stop.stats.map((s) => (
            <div className="tour-stat tnum" key={s.l}>
              <b>{s.v}</b>
              <span>{s.l}</span>
            </div>
          ))}
        </div>
        <div className="tour-ctrl">
          <button className="icon-btn" onClick={() => go(-1)} disabled={step === 0} aria-label="Anterior">
            <IconChevL size={16} />
          </button>
          <button className="icon-btn" onClick={() => setPaused(!paused)} aria-label={paused ? 'Reanudar' : 'Pausar'}>
            {paused ? <IconPlay size={14} /> : <IconPause size={14} />}
          </button>
          <button className="icon-btn" onClick={() => go(1)} aria-label="Siguiente">
            <IconChevR size={16} />
          </button>
          <span className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>
            {step + 1} / {stops.length}
          </span>
          <button className="btn" onClick={exit} style={{ height: 32 }}>
            <IconClose size={13} /> Salir
          </button>
        </div>
      </div>
    </>
  );
}
