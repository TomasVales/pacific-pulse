import type { LocationSummary } from '../model/location';
import type { Trajectory } from '../model/engine';
import type { Analog } from '../data/types';
import { level } from '../model/climate';
import { categoryOf, LEVEL_COLOR, PHASE_COLOR, phaseOf } from '../model/layers';

const W = 1080;
const H = 1350;
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", Roboto, sans-serif';
const sgn = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}`;

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Renders a social-media ready 1080×1350 PNG of a location forecast. */
export function renderShareCard(loc: LocationSummary, traj: Trajectory, t: number, analog: Analog | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const k = Math.round(t);
  const row = loc.rows[k];
  const ph = phaseOf(row.oni);
  const accent = PHASE_COLOR[ph];

  // background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1424');
  bg.addColorStop(1, '#020306');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 120, 20, W * 0.85, 120, 700);
  glow.addColorStop(0, `${accent}55`);
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // stars
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`;
    ctx.fillRect(rnd() * W, rnd() * H * 0.5, 1.6, 1.6);
  }

  const P = 72;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText('ENSO 3D · LATIN AMERICA CLIMATE ANALYTICS', P, 96);
  ctx.fillStyle = '#fff';
  ctx.font = `700 92px ${FONT}`;
  ctx.fillText(loc.title, P, 210, W - 2 * P);
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  ctx.font = `500 32px ${FONT}`;
  ctx.fillText(loc.subtitle, P, 262, W - 2 * P);

  // hero
  ctx.fillStyle = '#fff';
  ctx.font = `200 190px ${FONT}`;
  ctx.fillText(`${Math.round(row.temp)}°`, P - 8, 450);
  ctx.textAlign = 'right';
  ctx.font = `600 36px ${FONT}`;
  ctx.fillText(row.label.replace(/^./, (s) => s.toUpperCase()), W - P, 330);
  ctx.fillStyle = row.tempAnom >= 0 ? '#ff9a6a' : '#7fb6ff';
  ctx.fillText(`${sgn(row.tempAnom)} °C vs. normal`, W - P, 384);
  ctx.fillStyle = row.rainPct >= 0 ? '#5cc2ff' : '#ff7a5f';
  ctx.fillText(`${sgn(row.rainPct, 0)} % lluvia${row.precip !== null ? ` · ${Math.round(row.precip)} mm` : ''}`, W - P, 438);
  ctx.textAlign = 'left';

  // ENSO chip
  rrect(ctx, P, 490, 520, 64, 32);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(P + 34, 522, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(`${categoryOf(row.oni)} · ONI ${sgn(row.oni, 2)} °C`, P + 58, 532);

  // 6-month panel
  const py = 590;
  rrect(ctx, P - 16, py, W - 2 * P + 32, 420, 36);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillText(traj.kind === 'analog' ? `RECONSTRUCCIÓN · ${traj.title.toUpperCase()}` : traj.kind === 'scenario' ? 'ESCENARIO WHAT-IF · 6 MESES' : 'PRONÓSTICO A 6 MESES', P + 8, py + 50);
  const rows = loc.rows;
  const rowH = 56;
  rows.forEach((r, i) => {
    const y = py + 100 + i * rowH;
    ctx.fillStyle = i === k ? '#fff' : 'rgba(255,255,255,.7)';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(r.short.replace(/^./, (s) => s.toUpperCase()), P + 8, y);
    ctx.fillStyle = r.rainPct >= 0 ? '#5cc2ff' : '#ff7a5f';
    ctx.font = `500 26px ${FONT}`;
    ctx.fillText(`${sgn(r.rainPct, 0)} %`, P + 150, y);
    // anomaly bar
    const bx = P + 300;
    const bw = 400;
    rrect(ctx, bx, y - 14, bw, 10, 5);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fill();
    const f = Math.max(-1, Math.min(1, r.tempAnom / 3));
    const x0 = bx + bw / 2;
    const x1 = x0 + (f * bw) / 2;
    rrect(ctx, Math.min(x0, x1), y - 14, Math.max(8, Math.abs(x1 - x0)), 10, 5);
    ctx.fillStyle = r.tempAnom >= 0 ? '#ff8a4c' : '#5fa0ff';
    ctx.fill();
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.font = `600 30px ${FONT}`;
    ctx.fillText(`${sgn(r.tempAnom)}°`, W - P - 8, y);
    ctx.textAlign = 'left';
  });

  // risks
  const ry = 1060;
  const sectors: [string, number][] = [
    ['Agro', row.agri],
    ['Energía', row.energy],
    ['Salud', row.health],
  ];
  const cw = (W - 2 * P - 40) / 3;
  sectors.forEach(([name, v], i) => {
    const x = P + i * (cw + 20);
    rrect(ctx, x, ry, cw, 150, 30);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    ctx.fill();
    const col = LEVEL_COLOR[level(v)];
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(name.toUpperCase(), x + 26, ry + 44);
    ctx.fillStyle = '#fff';
    ctx.font = `300 64px ${FONT}`;
    const num = String(Math.round(v));
    ctx.fillText(num, x + 24, ry + 112);
    const numW = ctx.measureText(num).width;
    ctx.fillStyle = col;
    ctx.font = `600 24px ${FONT}`;
    ctx.fillText(level(v).toUpperCase(), x + 24 + numW + 12, ry + 108);
    rrect(ctx, x + 26, ry + 126, cw - 52, 6, 3);
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.fill();
    rrect(ctx, x + 26, ry + 126, Math.max(6, ((cw - 52) * v) / 100), 6, 3);
    ctx.fillStyle = col;
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.font = `500 24px ${FONT}`;
  const foot = analog ? `Año análogo: ${analog.label} (${Math.round(analog.similarity)} % similar)` : '';
  ctx.fillText(foot, P, 1256);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.font = `500 22px ${FONT}`;
  ctx.fillText('Datos: NOAA CPC (ONI) · ERA5 reanálisis · modelo de teleconexiones ENSO 3D', P, 1296);
  return c;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, 'image/png');
}
