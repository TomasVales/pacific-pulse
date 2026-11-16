import { useStore } from '../store';
import { fmtSigned, PHASE_COLOR, phaseOf } from '../model/layers';
import { LineChart } from './Charts';
import { IconClose } from './Icons';

export default function ComparePanel() {
  const data = useStore((s) => s.data)!;
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const toggle = useStore((s) => s.toggle);
  const { analogs, query } = data.analogs;
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const lab = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;

  return (
    <section className="panel glass glass-strong" aria-label="Comparar con el pasado">
      <div className="panel-h">
        <h3>Comparar con el pasado</h3>
        <button className="icon-btn" onClick={() => toggle('compareOpen', false)} aria-label="Cerrar">
          <IconClose size={14} />
        </button>
      </div>
      <p>
        Motor k-NN sobre ventanas móviles de 12 meses del ONI desde 1950. La trayectoria actual ({lab(query.start)} → {lab(query.end)},
        observada + proyectada) se comparó con todo el registro histórico.
      </p>
      <div className="scroll" style={{ flex: 1, minHeight: 0, marginTop: 4 }}>
        <div
          className={`analog${mode.kind === 'forecast' ? ' on' : ''}`}
          onClick={() => setMode({ kind: 'forecast' })}
          role="button"
          tabIndex={0}
        >
          <div className="analog-h">
            <div className="analog-name">Proyección actual</div>
            <span className="chip">
              {lab(data.grid.months[0].key)} – {lab(data.grid.months[data.grid.months.length - 1].key)}
            </span>
          </div>
          <p className="muted" style={{ margin: '6px 0 0' }}>Pronóstico estadístico ENSO 3D aplicado a las teleconexiones regionales.</p>
        </div>
        {analogs.map((a, i) => (
          <div
            key={a.label}
            className={`analog${mode.kind === 'analog' && mode.index === i ? ' on' : ''}`}
            onClick={() => setMode({ kind: 'analog', index: i })}
            role="button"
            tabIndex={0}
          >
            <div className="analog-h">
              <div>
                <div className="analog-name">Ciclo {a.label}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {a.kind} {a.intensity} · pico {fmtSigned(a.peak.value, 1)} °C ({lab(a.peak.month)})
                </div>
              </div>
              <div className="analog-sim tnum">{Math.round(a.similarity)}%</div>
            </div>
            <div className="simbar">
              <div style={{ width: `${a.similarity}%` }} />
            </div>
            <LineChart
              height={46}
              series={[
                { values: query.values, color: 'rgba(255,255,255,.5)', dashed: true, width: 1.4 },
                { values: a.oni.map((o) => o.value), color: PHASE_COLOR[phaseOf(a.peak.value)] },
              ]}
            />
            <div className="faint" style={{ fontSize: 11, marginTop: 4 }}>
              r = {a.correlation.toFixed(2)} · RMSE {a.rmse.toFixed(2)} °C{a.phase_shift ? ' · desfase 1 mes' : ''}
            </div>
            <p className="muted">{a.narrative}</p>
          </div>
        ))}
      </div>
      <p className="faint" style={{ fontSize: 11.5 }}>
        En modo análogo el globo muestra las anomalías del modelo forzado con el ONI realmente observado; las tarjetas de ciudad añaden lo que
        midió ERA5 en esos meses.
      </p>
    </section>
  );
}
