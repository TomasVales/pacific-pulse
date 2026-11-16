import { useMemo } from 'react';
import { useStore } from '../store';
import { buildTrajectory, computeCity, officialMean } from '../model/engine';
import { activeSpec, categoryOf, fmtSigned, PHASE_COLOR, phaseOf } from '../model/layers';
import { LineChart } from './Charts';
import { IconClose, IconReset } from './Icons';

const MIN = -2.0;
const MAX = 2.5;

export default function WhatIfPanel() {
  const data = useStore((s) => s.data)!;
  const traj = useStore((s) => s.traj)!;
  const t = useStore((s) => s.t);
  const scenarioMean = useStore((s) => s.scenarioMean);
  const setScenario = useStore((s) => s.setScenario);
  const toggle = useStore((s) => s.toggle);
  const select = useStore((s) => s.select);
  const flyTo = useStore((s) => s.flyTo);
  const layer = useStore((s) => s.layer);
  const climateVar = useStore((s) => s.climateVar);
  const mode = useStore((s) => s.mode);

  const official = useMemo(() => officialMean(data.grid), [data]);
  const officialTraj = useMemo(() => buildTrajectory(data, { kind: 'forecast' }, null), [data]);
  const value = scenarioMean ?? Math.max(MIN, Math.min(MAX, official));
  const delta = value - official;
  const spec = activeSpec(layer, climateVar);
  const k = Math.round(t);
  const metric = spec.id === 'rain' ? 'rainPct' : spec.id === 'temp' ? 'tempAnom' : (spec.id as 'agri' | 'energy' | 'health');

  const changes = useMemo(() => {
    if (traj.kind === 'analog') return [];
    return data.cities
      .map((c) => {
        const a = computeCity(c, officialTraj)[k][metric];
        const b = computeCity(c, traj)[k][metric];
        return { c, a, b, d: b - a };
      })
      .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
      .slice(0, 6);
  }, [data, traj, officialTraj, k, metric]);

  const ph = phaseOf(value);

  return (
    <section className="panel glass glass-strong" aria-label="Simulador What-If">
      <div className="panel-h">
        <h3>Simulador What-If</h3>
        <button className="icon-btn" onClick={() => toggle('whatIfOpen', false)} aria-label="Cerrar">
          <IconClose size={14} />
        </button>
      </div>
      <p>
        Ajusta la intensidad media del ONI para los próximos seis meses. Todas las columnas y ciudades se recalculan en tu navegador con las
        sensibilidades locales del modelo.
      </p>
      {mode.kind === 'analog' && (
        <p style={{ color: 'var(--warn)' }}>Estás viendo un año análogo: al mover el control volverás a la proyección.</p>
      )}
      <div className="whatif-val">
        <div>
          <div className="eyebrow">ONI medio del escenario</div>
          <div className="big tnum" style={{ color: PHASE_COLOR[ph] }}>
            {fmtSigned(value, 2)} °C
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{categoryOf(value)}</div>
        </div>
        <div style={{ textAlign: 'right' }} className="tnum">
          <div className="eyebrow">vs. oficial</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: Math.abs(delta) < 0.01 ? 'var(--text-2)' : delta > 0 ? 'var(--nino)' : 'var(--nina)' }}>
            {Math.abs(delta) < 0.005 ? '±0.00' : fmtSigned(delta, 2)}
          </div>
          <div className="faint" style={{ fontSize: 11.5 }}>oficial {fmtSigned(official, 2)}</div>
        </div>
      </div>
      <input
        className="range"
        type="range"
        min={MIN}
        max={MAX}
        step={0.05}
        value={value}
        onChange={(e) => setScenario(Number(e.target.value))}
        aria-label="ONI medio del escenario"
      />
      <div className="range-scale">
        <span>−2.0 La Niña extrema</span>
        <span>0</span>
        <span>+2.5 El Niño extremo</span>
      </div>
      <div style={{ marginTop: 12 }}>
        <LineChart
          height={60}
          series={[
            { values: officialTraj.oni, color: 'rgba(255,255,255,.5)', dashed: true, width: 1.5 },
            { values: traj.kind === 'analog' ? officialTraj.oni : traj.oni, color: PHASE_COLOR[ph] },
          ]}
          marker={t}
          labels={officialTraj.short}
        />
      </div>
      <div className="sep" />
      <div className="eyebrow">Mayor cambio · {spec.title.toLowerCase()} · {traj.short[k]}</div>
      <div className="delta-list scroll">
        {changes.map(({ c, a, b, d }) => (
          <div
            className="delta-row tnum"
            key={c.id}
            onClick={() => {
              select({ kind: 'city', id: c.id });
              flyTo(c.lat, c.lng, 0.9);
            }}
          >
            <span>
              <b>{c.name}</b> <span className="faint">{c.country}</span>
            </span>
            <span>
              <span className="faint">{spec.format(a)} → </span>
              {spec.format(b)}{' '}
              <span style={{ color: Math.abs(d) < 0.05 ? 'var(--text-3)' : d > 0 ? 'var(--high)' : 'var(--ok)' }}>({fmtSigned(d, spec.unit === '%' ? 0 : 1)})</span>
            </span>
          </div>
        ))}
      </div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => setScenario(null)} disabled={scenarioMean === null}>
        <IconReset size={15} /> Restablecer pronóstico oficial
      </button>
    </section>
  );
}
