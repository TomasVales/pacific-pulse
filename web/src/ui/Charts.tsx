import { useId, type ReactNode } from 'react';
import { LEVEL_COLOR } from '../model/layers';
import { level } from '../model/climate';

interface Series {
  values: (number | null)[];
  color: string;
  dashed?: boolean;
  width?: number;
}

/** Generic line chart with optional uncertainty band and a zero line. */
export function LineChart({
  series,
  band,
  width = 300,
  height = 80,
  yMin,
  yMax,
  marker,
  splitAt,
  labels,
}: {
  series: Series[];
  band?: { lower: (number | null)[]; upper: (number | null)[]; color: string };
  width?: number;
  height?: number;
  yMin?: number;
  yMax?: number;
  marker?: number;
  splitAt?: number;
  labels?: string[];
}) {
  const n = Math.max(...series.map((s) => s.values.length));
  const all = series.flatMap((s) => s.values).concat(band ? [...band.lower, ...band.upper] : []).filter((v): v is number => v !== null);
  const lo = Math.min(yMin ?? Infinity, ...all, -0.6);
  const hi = Math.max(yMax ?? -Infinity, ...all, 0.6);
  const padT = 6;
  const padB = labels ? 16 : 6;
  const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * (width - 8) + 4);
  const y = (v: number) => padT + ((hi - v) / (hi - lo)) * (height - padT - padB);
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  let bandPath = '';
  if (band) {
    const idx = band.upper.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
    if (idx.length) {
      bandPath =
        idx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(band.upper[i]!).toFixed(1)}`).join('') +
        idx
          .slice()
          .reverse()
          .map((i) => `L${x(i).toFixed(1)},${y(band.lower[i]!).toFixed(1)}`)
          .join('') +
        'Z';
    }
  }
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      {[0.5, -0.5].map((t) =>
        t > lo && t < hi ? <line key={t} x1={0} x2={width} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,.08)" strokeDasharray="2 4" /> : null,
      )}
      <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.18)" />
      {splitAt !== undefined && <line x1={x(splitAt)} x2={x(splitAt)} y1={padT - 4} y2={height - padB} stroke="rgba(255,255,255,.22)" strokeDasharray="3 3" />}
      {bandPath && <path d={bandPath} fill={band!.color} />}
      {series.map((s, k) => (
        <path key={k} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? '4 4' : undefined} vectorEffect="non-scaling-stroke" />
      ))}
      {marker !== undefined && series[0] && series[0].values[Math.round(marker)] != null && (
        <circle cx={x(marker)} cy={y(interp(series[0].values, marker))} r={4} fill="#fff" stroke="rgba(0,0,0,.4)" />
      )}
      {labels &&
        labels.map((l, i) =>
          l ? (
            <text key={i} x={x(i)} y={height - 3} fill="rgba(235,240,248,.42)" fontSize="9.5" textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>
              {l}
            </text>
          ) : null,
        )}
    </svg>
  );
}

function interp(vals: (number | null)[], t: number): number {
  const k = Math.floor(t);
  const a = vals[k] ?? 0;
  const b = vals[Math.min(k + 1, vals.length - 1)] ?? a;
  return a + (b - a) * (t - k);
}

export function RiskRing({ value, size = 64, icon }: { value: number; size?: number; icon?: ReactNode }) {
  const id = useId();
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const col = LEVEL_COLOR[level(value)];
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={col} stopOpacity={0.65} />
            <stop offset="1" stopColor={col} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.09)" strokeWidth={5} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${id})`}
          strokeWidth={5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(c * Math.max(0.01, value)) / 100} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray .5s cubic-bezier(.32,.72,0,1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 600 }} className="tnum">
        {icon ?? Math.round(value)}
      </div>
    </div>
  );
}
