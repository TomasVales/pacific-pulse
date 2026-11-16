import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { LAYERS, type Layer } from '../model/layers';
import { IconBolt, IconDrop, IconHeart, IconLeaf, IconThermo } from './Icons';

const ICON: Record<Layer, ReactNode> = {
  climate: <IconDrop size={15} />,
  agri: <IconLeaf size={15} />,
  energy: <IconBolt size={15} />,
  health: <IconHeart size={15} />,
};

export default function LayerPills() {
  const layer = useStore((s) => s.layer);
  const climateVar = useStore((s) => s.climateVar);
  const setLayer = useStore((s) => s.setLayer);
  const setClimateVar = useStore((s) => s.setClimateVar);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [bg, setBg] = useState({ left: 4, width: 0 });

  useLayoutEffect(() => {
    const update = () => {
      const el = refs.current[layer];
      if (el) setBg({ left: el.offsetLeft, width: el.offsetWidth });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [layer]);

  return (
    <>
      <div className="brand glass">
        <div className="brand-mark" />
        <div>
          <div className="brand-title">ENSO 3D</div>
          <div className="brand-sub">Latin America Climate Analytics</div>
        </div>
      </div>
      <div className="pills glass" role="tablist" aria-label="Capa de visualización">
        <div className="pill-bg" style={{ left: bg.left, width: bg.width }} />
        {LAYERS.map((l) => (
          <button
            key={l.id}
            ref={(el) => {
              refs.current[l.id] = el;
            }}
            role="tab"
            aria-selected={layer === l.id}
            className={`pill${layer === l.id ? ' on' : ''}`}
            onClick={() => setLayer(l.id)}
            title={l.label}
          >
            {ICON[l.id]}
            <span className="pill-long">{l.label}</span>
            <span className="pill-short">{l.short}</span>
          </button>
        ))}
      </div>
      {layer === 'climate' && (
        <div className="subpills glass" role="tablist" aria-label="Variable climática">
          <button className={`subpill${climateVar === 'rain' ? ' on' : ''}`} onClick={() => setClimateVar('rain')}>
            <IconDrop size={12} /> Lluvia
          </button>
          <button className={`subpill${climateVar === 'temp' ? ' on' : ''}`} onClick={() => setClimateVar('temp')}>
            <IconThermo size={12} /> Temperatura
          </button>
        </div>
      )}
    </>
  );
}
