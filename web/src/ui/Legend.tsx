import { useStore } from '../store';
import { activeSpec } from '../model/layers';

export default function Legend() {
  const layer = useStore((s) => s.layer);
  const climateVar = useStore((s) => s.climateVar);
  const traj = useStore((s) => s.traj)!;
  const spec = activeSpec(layer, climateVar);
  const min = spec.stops[0].v;
  const max = spec.stops[spec.stops.length - 1].v;
  const grad = spec.stops.map((s) => `${s.c} ${(((s.v - min) / (max - min)) * 100).toFixed(1)}%`).join(', ');
  return (
    <div className="legend glass">
      <div className="legend-title">{spec.title}</div>
      <div className="legend-sub">{spec.subtitle}</div>
      <div className="legend-bar" style={{ background: `linear-gradient(90deg, ${grad})` }} />
      <div className="legend-ticks">
        {spec.ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
      <div className="legend-note">
        <svg width="12" height="14" viewBox="0 0 12 14">
          <path d="M6 0 12 3.5v7L6 14 0 10.5v-7z" fill="rgba(255,255,255,.5)" />
        </svg>
        Altura = {spec.id === 'rain' || spec.id === 'temp' ? 'magnitud de la anomalía' : 'nivel de riesgo'} ·{' '}
        {traj.kind === 'analog' ? 'reconstrucción con ONI observado' : traj.kind === 'scenario' ? 'escenario simulado' : 'proyección'}
      </div>
    </div>
  );
}
