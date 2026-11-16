import { useState } from 'react';
import { useStore } from '../store';
import { LineChart } from './Charts';
import { categoryOf, fmtSigned, PHASE_COLOR, phaseOf } from '../model/layers';
import { IconClose, IconInfo } from './Icons';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const keyLabel = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;

export default function EnsoHud() {
  const data = useStore((s) => s.data)!;
  const traj = useStore((s) => s.traj)!;
  const t = useStore((s) => s.t);
  const mode = useStore((s) => s.mode);
  const [open, setOpen] = useState(false);

  const k = Math.min(Math.floor(t), traj.oni.length - 1);
  const k2 = Math.min(k + 1, traj.oni.length - 1);
  const oni = traj.oni[k] + (traj.oni[k2] - traj.oni[k]) * (t - k);
  const ph = phaseOf(oni);
  const { oni: od, manifest } = data;

  // Chart: 18 observed months + projection (or the analog window).
  let chart;
  if (mode.kind === 'analog') {
    const a = data.analogs.analogs[mode.index];
    const q = data.analogs.query.values;
    chart = (
      <LineChart
        height={64}
        series={[
          { values: q, color: 'rgba(255,255,255,.45)', dashed: true, width: 1.6 },
          { values: a.oni.map((o) => o.value), color: PHASE_COLOR[phaseOf(a.peak.value)] },
        ]}
        labels={a.oni.map((o, i) => (i % 3 === 0 || i === a.oni.length - 1 ? keyLabel(o.month) : ''))}
      />
    );
  } else {
    const hist = od.history.slice(-18);
    const fc = od.forecast;
    const n = hist.length + fc.length;
    const obs = [...hist, ...fc.map(() => null)];
    // What-If scenarios shift the whole projected trajectory by a constant offset.
    const offset = traj.kind === 'scenario' ? traj.oni[0] - data.grid.months[0].oni : 0;
    const joint = (v: number | null, i: number) => (i === hist.length - 1 ? v : null);
    const proj = [...hist.map(joint), ...fc.map((f) => f.mean + offset)];
    const lower = [...hist.map(joint), ...fc.map((f) => f.lower + offset)];
    const upper = [...hist.map(joint), ...fc.map((f) => f.upper + offset)];
    const lastKey = od.lastObserved.key;
    const allKeys: string[] = [];
    let y = Number(lastKey.slice(0, 4));
    let m = Number(lastKey.slice(5, 7)) - hist.length + 1;
    for (let i = 0; i < n; i++) {
      while (m < 1) {
        m += 12;
        y--;
      }
      while (m > 12) {
        m -= 12;
        y++;
      }
      allKeys.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
    }
    chart = (
      <LineChart
        height={64}
        series={[
          { values: proj, color: PHASE_COLOR[ph] },
          { values: obs, color: 'rgba(255,255,255,.85)' },
        ]}
        band={{ lower, upper, color: 'rgba(255,255,255,.08)' }}
        splitAt={hist.length - 1}
        labels={allKeys.map((kk, i) => (i === 0 || i === hist.length - 1 || i === n - 1 ? keyLabel(kk) : ''))}
      />
    );
  }

  const title = mode.kind === 'analog' ? `Análogo ${data.analogs.analogs[mode.index].label}` : traj.kind === 'scenario' ? 'Escenario What-If' : 'Niño 3.4 · ONI';

  return (
    <div className={`hud glass${open ? ' open' : ''}`} onClick={() => !open && setOpen(true)} role="region" aria-label="Estado ENSO">
      <div className="hud-top">
        <div>
          <div className="eyebrow">{title}</div>
          <div className="hud-val tnum" style={{ color: PHASE_COLOR[ph] }}>
            {fmtSigned(oni, 2)}
            <small>°C</small>
          </div>
          <div className="hud-cat">{categoryOf(oni)}</div>
        </div>
        <button
          className="icon-btn"
          aria-label={open ? 'Cerrar detalles' : 'Ver metodología'}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(!open);
          }}
        >
          {open ? <IconClose size={14} /> : <IconInfo size={16} />}
        </button>
      </div>
      <div className="hud-chart" style={{ marginTop: 8 }}>{chart}</div>
      <div className="hud-foot">
        <span>
          NOAA · {od.lastObserved.season} {od.lastObserved.key.slice(0, 4)}: {fmtSigned(od.lastObserved.value, 2)} °C
        </span>
        <span style={{ textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{traj.short[Math.round(t)]}</span>
      </div>
      {open && (
        <div className="hud-details scroll" style={{ maxHeight: '52vh' }}>
          <h4>Fuente</h4>
          {od.attempts.map((a, i) => (
            <div key={i} className="src-row">
              <span className="dot" style={{ background: a.ok ? 'var(--ok)' : 'var(--dry)' }} />
              <span>{a.source}</span>
              <span className="faint">{a.ok ? `${a.records} registros` : a.error}</span>
            </div>
          ))}
          <div className="faint" style={{ marginTop: 4 }}>
            Usada: {od.source} · {new Date(od.retrievedAt).toLocaleDateString('es')}
          </div>
          <h4>Proyección</h4>
          <div>{od.method}</div>
          <h4>Habilidad en hindcast (r por plazo)</h4>
          <div className="skill">
            {od.hindcast.map((h) => (
              <div key={h.lead}>
                <b className="tnum">{h.corr.toFixed(2)}</b>
                <span className="faint">+{h.lead}m</span>
              </div>
            ))}
          </div>
          <h4>Validación del modelo de teleconexiones</h4>
          <div>
            Correlación media con anomalías ERA5 observadas en {manifest.validation.cities} ciudades: lluvia r = {manifest.validation.meanRainCorrelation.toFixed(2)},
            temperatura r = {manifest.validation.meanTempCorrelation.toFixed(2)} (mensual, 1950-presente). Las ciudades usan coeficientes fusionados
            bayesianamente con la regresión empírica ERA5.
          </div>
          <h4>Datos</h4>
          <div>
            {manifest.gridPoints} celdas terrestres · {manifest.era5.cities} ciudades ERA5 · generado {new Date(manifest.generatedAt).toLocaleString('es')}
          </div>
        </div>
      )}
    </div>
  );
}
