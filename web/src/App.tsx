import { useEffect, useState } from 'react';
import { loadData } from './data/load';
import { useStore } from './store';
import GlobeView from './globe/GlobeView';
import LayerPills from './ui/LayerPills';
import Spotlight, { SearchTrigger } from './ui/Spotlight';
import EnsoHud from './ui/EnsoHud';
import Timeline from './ui/Timeline';
import Legend from './ui/Legend';
import LocationCard from './ui/LocationCard';
import WhatIfPanel from './ui/WhatIfPanel';
import ComparePanel from './ui/ComparePanel';
import Tour from './ui/Tour';
import ActionDock from './ui/ActionDock';

export default function App() {
  const ready = useStore((s) => s.data !== null);
  const init = useStore((s) => s.init);
  const selection = useStore((s) => s.selection);
  const spotlightOpen = useStore((s) => s.spotlightOpen);
  const whatIfOpen = useStore((s) => s.whatIfOpen);
  const compareOpen = useStore((s) => s.compareOpen);
  const tourStep = useStore((s) => s.tourStep);
  const toggle = useStore((s) => s.toggle);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fadeDone, setFadeDone] = useState(false);

  useEffect(() => {
    loadData((a, b) => setProgress(a / b))
      .then((d) => {
        init(d);
        setTimeout(() => setFadeDone(true), 900);
      })
      .catch((e: Error) => setError(e.message));
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (st.tourStep === null) toggle('spotlightOpen');
        return;
      }
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (typing || st.tourStep !== null || st.spotlightOpen) return;
      if (e.key === 'Escape') {
        if (st.whatIfOpen || st.compareOpen) {
          toggle('whatIfOpen', false);
          toggle('compareOpen', false);
        } else st.select(null);
      } else if (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON') {
        e.preventDefault();
        st.setPlaying(!st.playing);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const touring = tourStep !== null;

  return (
    <>
      {ready && <GlobeView />}
      {ready && (
        <div className="ui">
          {!touring && (
            <>
              <div className="slot-tl">
                <LayerPills />
              </div>
              <div className="slot-tc">
                <SearchTrigger />
              </div>
            </>
          )}
          <div className="slot-tr">
            <EnsoHud />
          </div>
          {!touring && (
            <>
              <div className="slot-r">
                <ActionDock />
              </div>
              {whatIfOpen && <WhatIfPanel />}
              {compareOpen && <ComparePanel />}
              {selection && <LocationCard />}
              {!whatIfOpen && !compareOpen && (
                <div className="slot-br">
                  <Legend />
                </div>
              )}
              <div className="slot-b">
                <Timeline />
              </div>
            </>
          )}
        </div>
      )}
      {ready && touring && <Tour />}
      {ready && spotlightOpen && <Spotlight />}
      {!fadeDone && (
        <div className={`loading${ready ? ' done' : ''}`}>
          <div className="load-box">
            <div className="load-orb" />
            <div className="load-title">ENSO 3D</div>
            <div className="load-sub">Cargando datos del Pacífico ecuatorial y teleconexiones de Latinoamérica…</div>
            <div className="load-bar">
              <i style={{ width: `${progress * 100}%` }} />
            </div>
            {error && <div className="load-err">{error}. Ejecuta el pipeline de Python para generar web/public/data.</div>}
          </div>
        </div>
      )}
    </>
  );
}
