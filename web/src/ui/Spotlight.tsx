import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useStore } from '../store';
import { IconFlag, IconPin, IconSearch } from './Icons';
import { computeCity, sample } from '../model/engine';
import { activeSpec } from '../model/layers';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Item {
  kind: 'city' | 'country';
  id: string;
  name: string;
  meta: string;
  lat: number;
  lng: number;
  alt: number;
  search: string;
}

export function SearchTrigger() {
  const toggle = useStore((s) => s.toggle);
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <button className="search-trigger glass" onClick={() => toggle('spotlightOpen', true)} aria-label="Buscar ciudad o país">
      <IconSearch size={16} />
      Buscar ciudad o país
      <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
    </button>
  );
}

export default function Spotlight() {
  const data = useStore((s) => s.data)!;
  const traj = useStore((s) => s.traj)!;
  const fields = useStore((s) => s.fields)!;
  const t = useStore((s) => s.t);
  const layer = useStore((s) => s.layer);
  const climateVar = useStore((s) => s.climateVar);
  const toggle = useStore((s) => s.toggle);
  const select = useStore((s) => s.select);
  const flyTo = useStore((s) => s.flyTo);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const cities: Item[] = data.cities.map((c) => ({
      kind: 'city',
      id: c.id,
      name: c.name,
      meta: c.country,
      lat: c.lat,
      lng: c.lng,
      alt: 0.85,
      search: norm(`${c.name} ${c.country}`),
    }));
    const countries: Item[] = data.model.countries.map((c) => {
      const cells = data.grid.country.filter((k) => data.grid.countries[k] === c.name).length;
      return {
        kind: 'country',
        id: c.name,
        name: c.name,
        meta: `País · ${cells} celdas`,
        lat: c.lat,
        lng: c.lng,
        alt: Math.min(2.0, 0.75 + Math.sqrt(cells) * 0.045),
        search: norm(c.name),
      };
    });
    return [...cities, ...countries.sort((a, b) => a.name.localeCompare(b.name, 'es'))];
  }, [data]);

  const results = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return items.filter((i) => i.kind === 'city').slice(0, 9);
    return items
      .map((i) => {
        const nameN = norm(i.name);
        const score = nameN.startsWith(nq) ? 0 : nameN.split(/\s+/).some((w) => w.startsWith(nq)) ? 1 : i.search.includes(nq) ? 2 : 9;
        return { i, score };
      })
      .filter((x) => x.score < 9)
      .sort((a, b) => a.score - b.score || (a.i.kind === b.i.kind ? 0 : a.i.kind === 'city' ? -1 : 1))
      .slice(0, 12)
      .map((x) => x.i);
  }, [q, items]);

  const spec = activeSpec(layer, climateVar);
  const valueOf = (it: Item): string => {
    if (it.kind === 'city') {
      const city = data.cities.find((c) => c.id === it.id)!;
      const rows = computeCity(city, traj);
      const k = Math.round(t);
      const key = spec.id === 'rain' ? 'rainPct' : spec.id === 'temp' ? 'tempAnom' : (spec.id as 'agri' | 'energy' | 'health');
      return spec.format(rows[k][key]);
    }
    const ci = data.grid.countries.indexOf(it.id);
    let s = 0;
    let n = 0;
    const arr = spec.field(fields);
    for (let i = 0; i < data.grid.n; i++)
      if (data.grid.country[i] === ci) {
        s += sample(arr, i, t);
        n++;
      }
    return n ? spec.format(s / n) : '';
  };

  useEffect(() => {
    input.current?.focus();
  }, []);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector('.spot-item.on')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (it: Item) => {
    toggle('spotlightOpen', false);
    select(it.kind === 'city' ? { kind: 'city', id: it.id } : { kind: 'country', name: it.id });
    flyTo(it.lat, it.lng, it.alt);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && results[active]) {
      choose(results[active]);
    } else if (e.key === 'Escape') {
      toggle('spotlightOpen', false);
    }
  };

  return (
    <>
      <div className="spot-backdrop" onClick={() => toggle('spotlightOpen', false)} />
      <div className="spot glass glass-strong" role="dialog" aria-label="Buscar">
        <div className="spot-input">
          <IconSearch size={20} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Ciudad o país de Latinoamérica…" aria-label="Buscar" />
        </div>
        <div className="spot-list scroll" ref={list}>
          {!q && <div className="eyebrow" style={{ padding: '8px 12px 4px' }}>Ciudades destacadas</div>}
          {results.map((it, k) => (
            <div key={`${it.kind}:${it.id}`} className={`spot-item${k === active ? ' on' : ''}`} onMouseEnter={() => setActive(k)} onClick={() => choose(it)}>
              <div className="spot-ic">{it.kind === 'city' ? <IconPin size={16} /> : <IconFlag size={16} />}</div>
              <div>
                <div className="spot-name">{it.name}</div>
                <div className="spot-meta">{it.meta}</div>
              </div>
              <div className="spot-val tnum">
                {valueOf(it)}
                <div className="faint" style={{ fontSize: 10.5 }}>{spec.title}</div>
              </div>
            </div>
          ))}
          {!results.length && <div className="spot-empty">Sin resultados para “{q}”. Prueba con una de las 30 ciudades o un país.</div>}
        </div>
        <div className="spot-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span>
          <span><kbd>↵</kbd> volar</span>
          <span><kbd>esc</kbd> cerrar</span>
        </div>
      </div>
    </>
  );
}
