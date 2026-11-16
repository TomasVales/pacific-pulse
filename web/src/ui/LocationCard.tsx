import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { summarize } from '../model/location';
import { lerpRow, peakLevel } from '../model/engine';
import { level } from '../model/climate';
import { categoryOf, fmtSigned, LEVEL_COLOR, PHASE_COLOR, phaseOf } from '../model/layers';
import { LineChart, RiskRing } from './Charts';
import { IconBolt, IconClose, IconDownload, IconDrop, IconHeart, IconHistory, IconLeaf, IconSpark, IconThermo } from './Icons';
import { downloadCanvas, renderShareCard } from './shareCard';

const SECTOR_COLOR = { agro: '#7ee08a', energia: '#f2c35b', salud: '#ff7a8a', general: '#46c6ff' } as const;

export default function LocationCard() {
  const data = useStore((s) => s.data)!;
  const traj = useStore((s) => s.traj)!;
  const fields = useStore((s) => s.fields)!;
  const sel = useStore((s) => s.selection)!;
  const t = useStore((s) => s.t);
  const mode = useStore((s) => s.mode);
  const select = useStore((s) => s.select);
  const setT = useStore((s) => s.setT);
  const setPlaying = useStore((s) => s.setPlaying);
  const setMode = useStore((s) => s.setMode);
  const [saving, setSaving] = useState(false);

  const analogIndex = mode.kind === 'analog' ? mode.index : null;
  const loc = useMemo(() => summarize(data, sel, traj, fields, analogIndex), [data, sel, traj, fields, analogIndex]);
  if (!loc) return null;

  const row = lerpRow(loc.rows, t);
  const k = Math.round(t);
  const topAnalog = data.analogs.analogs[0];
  const shownAnalog = analogIndex !== null ? data.analogs.analogs[analogIndex] : topAnalog;
  const analogObs = loc.city ? loc.city.analogObserved[analogIndex ?? 0] : null;
  const obsMean = (key: 'tempAnom' | 'rainPct') => {
    const v = (analogObs ?? []).map((o) => o[key]).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const projMean = (key: 'tempAnom' | 'rainPct') => loc.rows.reduce((a, r) => a + r[key], 0) / loc.rows.length;
  const maxAbsT = Math.max(1, ...loc.rows.map((r) => Math.abs(r.tempAnom)));
  const peaks = {
    agri: peakLevel(loc.rows, 'agri'),
    energy: peakLevel(loc.rows, 'energy'),
    health: peakLevel(loc.rows, 'health'),
  };

  const share = () => {
    setSaving(true);
    requestAnimationFrame(() => {
      const canvas = renderShareCard(loc, traj, t, shownAnalog);
      const slug = loc.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
      downloadCanvas(canvas, `enso3d-${slug}-${traj.keys[k]}.png`);
      setTimeout(() => setSaving(false), 600);
    });
  };

  const heroValue = Math.round(row.temp);

  return (
    <aside className="card glass glass-strong" aria-label={`Detalle de ${loc.title}`} key={loc.key}>
      <div className="card-head">
        <button className="icon-btn card-close" onClick={() => select(null)} aria-label="Cerrar">
          <IconClose size={14} />
        </button>
        <div className="eyebrow">{loc.kind === 'city' ? 'Ciudad' : loc.kind === 'country' ? 'País' : 'Celda de la malla'}</div>
        <div className="card-title">{loc.title}</div>
        <div className="card-sub">{loc.subtitle}</div>
        <div className="card-hero">
          <div>
            <div className="hero-temp tnum">{heroValue}°</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              {loc.kind === 'city' ? 'Temperatura media esperada' : 'Temperatura media estimada'}
            </div>
          </div>
          <div className="hero-side tnum">
            <div style={{ fontWeight: 650, textTransform: 'capitalize' }}>{traj.labels[k]}</div>
            <div style={{ color: row.tempAnom >= 0 ? '#ff9a6a' : '#7fb6ff' }}>
              <IconThermo size={13} /> {fmtSigned(row.tempAnom)} °C vs. normal
            </div>
            <div style={{ color: row.rainPct >= 0 ? '#5cc2ff' : '#ff7a5f' }}>
              <IconDrop size={13} /> {fmtSigned(row.rainPct, 0)} % lluvia{row.precip !== null ? ` · ${Math.round(row.precip)} mm` : ''}
            </div>
            <div>
              <span className="dot" style={{ background: PHASE_COLOR[phaseOf(row.oni)] }} /> {categoryOf(row.oni)}
            </div>
          </div>
        </div>
      </div>

      <div className="card-body scroll">
        <div className="sec">
          <div className="sec-h">
            <IconSpark size={13} /> {traj.kind === 'analog' ? `Reconstrucción ${traj.title}` : traj.kind === 'scenario' ? 'Escenario simulado · 6 meses' : 'Pronóstico a 6 meses'}
          </div>
          {loc.rows.map((r, i) => {
            const f = Math.max(-1, Math.min(1, r.tempAnom / maxAbsT));
            return (
              <div
                key={r.key}
                className={`mrow${i === k ? ' on' : ''}`}
                onClick={() => {
                  setPlaying(false);
                  setT(i);
                }}
              >
                <span className="mrow-m">{i === k ? 'Ahora' : r.short}</span>
                <span className="mrow-r tnum" style={{ color: r.rainPct >= 0 ? '#5cc2ff' : '#ff7a5f' }}>
                  <IconDrop size={11} />
                  {fmtSigned(r.rainPct, 0)}%
                </span>
                <span className="tbar">
                  <span className="zero" />
                  <i
                    style={{
                      left: `${50 + Math.min(0, f) * 50}%`,
                      width: `${Math.max(3, Math.abs(f) * 50)}%`,
                      background: r.tempAnom >= 0 ? 'linear-gradient(90deg,#f2c35b,#ff5a4e)' : 'linear-gradient(90deg,#36d6ff,#2f6bff)',
                    }}
                  />
                </span>
                <span className="mrow-t tnum">{fmtSigned(r.tempAnom)}°</span>
              </div>
            );
          })}
          <div style={{ marginTop: 10 }}>
            <LineChart
              height={58}
              series={[
                { values: loc.rows.map((r) => r.rainPct / 25), color: '#5cc2ff' },
                { values: loc.rows.map((r) => r.tempAnom), color: '#ff8a4c' },
                ...(analogObs && loc.city
                  ? [{ values: analogObs.map((o) => (o.rainPct === null ? null : Math.max(-4, Math.min(6, o.rainPct / 25)))), color: 'rgba(92,194,255,.45)', dashed: true, width: 1.4 }]
                  : []),
              ]}
              marker={t}
              labels={loc.rows.map((r) => r.short)}
            />
            <div className="faint" style={{ fontSize: 10.5, display: 'flex', gap: 12, marginTop: 4 }}>
              <span style={{ color: '#ff8a4c' }}>— Temp. °C</span>
              <span style={{ color: '#5cc2ff' }}>— Lluvia (÷25 %)</span>
              {analogObs && <span>- - ERA5 {shownAnalog.label}</span>}
            </div>
          </div>
        </div>

        <div className="sec">
          <div className="sec-h">Riesgo sectorial · {traj.short[k]}</div>
          <div className="risk-grid">
            {([
              ['Agro', row.agri, <IconLeaf size={18} key="a" />, peaks.agri],
              ['Energía', row.energy, <IconBolt size={18} key="e" />, peaks.energy],
              ['Salud', row.health, <IconHeart size={18} key="h" />, peaks.health],
            ] as const).map(([name, v, , pk]) => (
              <div className="risk" key={name}>
                <RiskRing value={v} />
                <div className="risk-name">{name}</div>
                <div className="risk-lvl" style={{ color: LEVEL_COLOR[level(v)] }}>{level(v)}</div>
                <div className="faint" style={{ fontSize: 10.5, marginTop: 2 }}>
                  pico {Math.round(pk.value)} · {pk.label.split(' ')[0].slice(0, 3)}
                </div>
              </div>
            ))}
          </div>
          {(loc.cropRegion || loc.dam) && <div className="sep" />}
          {loc.cropRegion && (
            <div className="kv">
              <span>Zona agrícola</span>
              <span style={{ textAlign: 'right' }}>{loc.cropRegion}</span>
            </div>
          )}
          {loc.dam && (
            <div className="kv">
              <span>Represa cercana</span>
              <span>{loc.dam}</span>
            </div>
          )}
        </div>

        <div className="sec">
          <div className="sec-h">
            <IconHistory size={13} /> Año análogo {analogIndex !== null ? 'en pantalla' : 'más cercano'}
          </div>
          <div className="analog-h">
            <div>
              <div className="analog-name">Ciclo {shownAnalog.label}</div>
              <div className="faint" style={{ fontSize: 12 }}>
                Pico ONI {fmtSigned(shownAnalog.peak.value, 1)} °C · r = {shownAnalog.correlation.toFixed(2)}
              </div>
            </div>
            <div className="analog-sim tnum">{Math.round(shownAnalog.similarity)}%</div>
          </div>
          <div className="simbar">
            <div style={{ width: `${shownAnalog.similarity}%` }} />
          </div>
          {loc.city && analogObs ? (
            <>
              <div className="kv tnum">
                <span>Lluvia observada (ERA5)</span>
                <span>{obsMean('rainPct') === null ? 'sin datos' : `${fmtSigned(obsMean('rainPct')!, 0)} %`}</span>
              </div>
              <div className="kv tnum">
                <span>Temperatura observada (ERA5)</span>
                <span>{obsMean('tempAnom') === null ? 'sin datos' : `${fmtSigned(obsMean('tempAnom')!)} °C`}</span>
              </div>
              <div className="kv tnum">
                <span>{traj.kind === 'analog' ? 'Reconstrucción del modelo' : 'Proyección actual'}</span>
                <span>
                  {fmtSigned(projMean('rainPct'), 0)} % · {fmtSigned(projMean('tempAnom'))} °C
                </span>
              </div>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0', lineHeight: 1.45 }}>{shownAnalog.summary}</p>
          )}
          {analogIndex === null && (
            <button className="btn" style={{ width: '100%', marginTop: 10, height: 34, fontSize: 13 }} onClick={() => setMode({ kind: 'analog', index: 0 })}>
              Ver {shownAnalog.label} en el globo
            </button>
          )}
        </div>

        <div className="sec">
          <div className="sec-h">Recomendaciones</div>
          {loc.recs.map((r, i) => (
            <div className="rec" key={i}>
              <span className="dot" style={{ background: SECTOR_COLOR[r.sector] }} />
              <span>{r.text}</span>
            </div>
          ))}
        </div>

        {loc.city && (
          <div className="sec">
            <div className="sec-h">Climatología y calibración</div>
            <div className="kv tnum">
              <span>Normal {traj.short[k]} (1991-2020)</span>
              <span>
                {loc.city.climT[traj.m0[k]].toFixed(1)} °C · {Math.round(loc.city.climP[traj.m0[k]])} mm
              </span>
            </div>
            <div className="kv tnum">
              <span>Tendencia de calentamiento</span>
              <span>{fmtSigned(loc.city.trendPerDecade, 2)} °C/década</span>
            </div>
            <div className="kv tnum">
              <span>Skill del modelo vs ERA5</span>
              <span>
                r lluvia {loc.city.validation.rain_r?.toFixed(2) ?? '—'} · r temp. {loc.city.validation.temp_r?.toFixed(2) ?? '—'}
              </span>
            </div>
            <div className="kv">
              <span>Serie ERA5</span>
              <span className="tnum">
                {loc.city.era5.first} → {loc.city.era5.last}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="card-foot">
        <button className="btn btn-primary" onClick={share} disabled={saving}>
          <IconDownload size={16} /> {saving ? 'Generando…' : 'Descargar tarjeta PNG'}
        </button>
      </div>
    </aside>
  );
}
