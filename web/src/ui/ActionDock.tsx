import { useStore } from '../store';
import { IconHistory, IconSliders, IconSpark, IconWind } from './Icons';

export default function ActionDock() {
  const whatIfOpen = useStore((s) => s.whatIfOpen);
  const compareOpen = useStore((s) => s.compareOpen);
  const windOn = useStore((s) => s.windOn);
  const mode = useStore((s) => s.mode);
  const scenarioMean = useStore((s) => s.scenarioMean);
  const toggle = useStore((s) => s.toggle);
  const setTour = useStore((s) => s.setTour);

  const open = (k: 'whatIfOpen' | 'compareOpen') => {
    const other = k === 'whatIfOpen' ? 'compareOpen' : 'whatIfOpen';
    toggle(other, false);
    toggle(k);
  };

  return (
    <nav className="dock glass" aria-label="Herramientas">
      <button className={`dock-btn${whatIfOpen || scenarioMean !== null ? ' on' : ''}`} onClick={() => open('whatIfOpen')} aria-label="Simulador What-If">
        <IconSliders size={20} />
        <span className="tip">Simulador What-If</span>
      </button>
      <button className={`dock-btn${compareOpen || mode.kind === 'analog' ? ' on' : ''}`} onClick={() => open('compareOpen')} aria-label="Comparar con el pasado">
        <IconHistory size={20} />
        <span className="tip">Comparar con el pasado</span>
      </button>
      <button
        className="dock-btn"
        onClick={() => {
          toggle('whatIfOpen', false);
          toggle('compareOpen', false);
          setTour(0);
        }}
        aria-label="Tour guiado"
      >
        <IconSpark size={20} />
        <span className="tip">Tour guiado</span>
      </button>
      <button className={`dock-btn${windOn ? ' on' : ''}`} onClick={() => toggle('windOn')} aria-label="Partículas de viento">
        <IconWind size={20} />
        <span className="tip">{windOn ? 'Ocultar' : 'Mostrar'} corrientes de viento</span>
      </button>
    </nav>
  );
}
