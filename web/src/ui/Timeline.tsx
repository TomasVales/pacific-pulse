import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useStore } from '../store';
import { IconClose, IconPause, IconPlay } from './Icons';
import { categoryOf, fmtSigned, PHASE_COLOR, phaseOf } from '../model/layers';

const SECONDS_PER_MONTH = 2.2;

export default function Timeline() {
  const traj = useStore((s) => s.traj)!;
  const t = useStore((s) => s.t);
  const playing = useStore((s) => s.playing);
  const setT = useStore((s) => s.setT);
  const setPlaying = useStore((s) => s.setPlaying);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const setScenario = useStore((s) => s.setScenario);
  const track = useRef<HTMLDivElement>(null);
  const M = traj.oni.length;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    if (useStore.getState().t >= M - 1) setT(0);
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const cur = useStore.getState().t;
      const next = cur + dt / SECONDS_PER_MONTH;
      if (next >= M - 1) {
        setT(M - 1);
        setPlaying(false);
        return;
      }
      setT(next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, M, setT, setPlaying]);

  const fromPointer = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    setT(f * (M - 1));
  };
  const onDown = (e: PointerEvent) => {
    setPlaying(false);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    fromPointer(e.clientX);
  };
  const onMove = (e: PointerEvent) => {
    if (e.buttons & 1) fromPointer(e.clientX);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') setT(Math.min(M - 1, Math.round(t) + 1));
    if (e.key === 'ArrowLeft') setT(Math.max(0, Math.round(t) - 1));
  };

  const k = Math.min(Math.floor(t), M - 1);
  const k2 = Math.min(k + 1, M - 1);
  const oni = traj.oni[k] + (traj.oni[k2] - traj.oni[k]) * (t - k);
  const pct = (t / (M - 1)) * 100;
  const col = PHASE_COLOR[phaseOf(oni)];

  return (
    <div>
      {traj.kind !== 'forecast' && (
        <div className="mode-banner">
          <span className="chip glass" style={{ borderRadius: 999 }}>
            <span className="dot" style={{ background: traj.kind === 'analog' ? 'var(--warn)' : 'var(--accent)' }} />
            {traj.kind === 'analog' ? `Viendo el pasado: ${traj.title} (ONI observado)` : `${traj.title}: ONI medio ${fmtSigned(traj.oni.reduce((a, b) => a + b, 0) / M, 2)} °C`}
            <button
              className="icon-btn"
              style={{ width: 20, height: 20, marginLeft: 4 }}
              aria-label="Volver a la proyección oficial"
              onClick={() => (mode.kind === 'analog' ? setMode({ kind: 'forecast' }) : setScenario(null))}
            >
              <IconClose size={10} />
            </button>
          </span>
        </div>
      )}
      <div className="timeline glass">
        <button className="play" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
        </button>
        <div className="tl-main">
          <div className="tl-head">
            <span className="tl-month">{traj.labels[Math.round(t)]}</span>
            <span className="tl-oni tnum">
              ONI <b style={{ color: col }}>{fmtSigned(oni, 2)} °C</b> · {categoryOf(oni)}
            </span>
          </div>
          <div
            className="track"
            ref={track}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onKeyDown={onKey}
            tabIndex={0}
            role="slider"
            aria-label="Mes"
            aria-valuemin={0}
            aria-valuemax={M - 1}
            aria-valuenow={Math.round(t)}
            aria-valuetext={traj.labels[Math.round(t)]}
          >
            <div className="track-rail">
              <div className="track-fill" style={{ width: `${pct}%`, background: `linear-gradient(90deg, rgba(255,255,255,.35), ${col})` }} />
            </div>
            <div className="track-thumb" style={{ left: `${pct}%` }} />
            <div className="track-ticks">
              {traj.short.map((s, i) => (
                <span
                  key={i}
                  className={Math.round(t) === i ? 'on' : ''}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setPlaying(false);
                    setT(i);
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
