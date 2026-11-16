import { useEffect, useRef } from 'react';
import Globe, { type GlobeInstance } from 'globe.gl';
import * as THREE from 'three';
import { useStore, type Selection } from '../store';
import type { AppData, CountryFeature } from '../data/types';
import { HexColumns } from './HexColumns';
import { NinoGlow } from './NinoGlow';
import { WindParticles, makeStarfield } from './WindParticles';
import { cancelFlight, flyTo } from './camera';
import { activeSpec, PHASE_COLOR, phaseOf } from '../model/layers';
import { arcDeg, nearestCell, sample } from '../model/engine';

const MAX_H = 17; // globe units (radius = 100)

interface Pin {
  kind: 'city' | 'dam';
  id: string;
  name: string;
  lat: number;
  lng: number;
  big?: boolean;
  left?: boolean;
}

interface Ring {
  lat: number;
  lng: number;
  kind: 'nino' | 'sel';
}

function makePin(p: Pin, onClick: (p: Pin) => void): HTMLElement {
  const el = document.createElement('button');
  el.className = `pin pin-${p.kind}${p.big ? ' pin-big' : ''}${p.left ? ' pin-left' : ''}`;
  el.setAttribute('aria-label', p.name);
  el.innerHTML =
    p.kind === 'city'
      ? `<span class="pin-dot"></span><span class="pin-label">${p.name}</span>`
      : `<span class="pin-dam"><svg viewBox="0 0 16 16" width="10" height="10"><path d="M9 1 3 9h4l-1 6 6-8H8z" fill="currentColor"/></svg></span><span class="pin-label">${p.name}</span>`;
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick(p);
  });
  el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  return el;
}

function selectionLatLng(data: AppData, s: Selection | null): { lat: number; lng: number } | null {
  if (!s) return null;
  if (s.kind === 'city') {
    const c = data.cities.find((x) => x.id === s.id);
    return c ? { lat: c.lat, lng: c.lng } : null;
  }
  if (s.kind === 'cell') return { lat: data.grid.lat[s.index], lng: data.grid.lng[s.index] };
  const c = data.model.countries.find((x) => x.name === s.name);
  return c ? { lat: c.lat, lng: c.lng } : null;
}

export default function GlobeView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const loaded = useStore.getState().data;
    if (!el || !loaded) return;
    const data: AppData = loaded;

    const globe: GlobeInstance = new Globe(el, { rendererConfig: { antialias: true, powerPreference: 'high-performance' }, animateIn: false });
    const R = globe.getGlobeRadius();
    const coords = (lat: number, lng: number, alt = 0) => globe.getCoords(lat, lng, alt);

    globe
      .width(window.innerWidth)
      .height(window.innerHeight)
      .backgroundColor('#000003')
      .showAtmosphere(true)
      .atmosphereColor('#46c6ff')
      .atmosphereAltitude(0.16)
      .showGraticules(false)
      .globeMaterial(
        new THREE.MeshPhongMaterial({ color: new THREE.Color('#050a14'), emissive: new THREE.Color('#02060f'), specular: new THREE.Color('#16324d'), shininess: 18 }),
      )
      .polygonsData(data.countries.features)
      .polygonGeoJsonGeometry('geometry')
      .polygonCapColor((d: object) => ((d as CountryFeature).properties.l ? '#26292f' : '#1b1d22'))
      .polygonSideColor(() => 'rgba(10,12,16,0.85)')
      .polygonStrokeColor((d: object) => ((d as CountryFeature).properties.l ? 'rgba(140,215,255,0.55)' : 'rgba(120,170,210,0.2)'))
      .polygonAltitude(0.0035)
      .polygonCapCurvatureResolution(4)
      .polygonsTransitionDuration(0);

    globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const controls = globe.controls();
    controls.minDistance = R * 1.18;
    controls.maxDistance = R * 7;
    controls.zoomSpeed = 0.7;
    controls.rotateSpeed = 0.55;

    // --- custom three.js layers -------------------------------------------
    const scene = globe.scene();
    scene.add(makeStarfield());
    const columns = new HexColumns(data.grid.lat, data.grid.lng, data.grid.spacing, R, coords);
    scene.add(columns.mesh);
    const glow = new NinoGlow(coords);
    scene.add(glow.mesh);
    const wind = new WindParticles(coords);
    scene.add(wind.lines);

    // --- pins ---------------------------------------------------------------
    const BIG = new Set(['buenos-aires', 'sao-paulo', 'ciudad-de-mexico', 'lima', 'bogota', 'santiago', 'caracas', 'la-habana', 'guatemala']);
    const LEFT = new Set(['buenos-aires', 'sao-paulo', 'valparaiso', 'medellin', 'cali', 'guayaquil', 'rosario', 'guadalajara', 'san-jose']);
    const cityPins: Pin[] = data.cities.map((c) => ({ kind: 'city', id: c.id, name: c.name, lat: c.lat, lng: c.lng, big: BIG.has(c.id), left: LEFT.has(c.id) }));
    const damPins: Pin[] = data.model.dams.map((d) => ({ kind: 'dam', id: d.name, name: d.name, lat: d.lat, lng: d.lng }));
    const onPin = (p: Pin) => {
      const st = useStore.getState();
      if (p.kind === 'city') {
        st.select({ kind: 'city', id: p.id });
        st.flyTo(p.lat, p.lng, 0.9);
      } else {
        const cell = nearestCell(data.grid, p.lat, p.lng);
        st.select({ kind: 'cell', index: cell.index });
        st.flyTo(p.lat, p.lng, 0.9);
      }
    };
    globe
      .htmlElementsData(cityPins)
      .htmlLat('lat')
      .htmlLng('lng')
      .htmlAltitude(0.012)
      .htmlElement((d: object) => makePin(d as Pin, onPin))
      .htmlElementVisibilityModifier((e: HTMLElement, visible: boolean) => {
        e.style.opacity = visible ? '' : '0';
        e.style.pointerEvents = visible ? '' : 'none';
      })
      .htmlTransitionDuration(0);

    // --- rings & arcs -------------------------------------------------------
    globe
      .ringLat('lat')
      .ringLng('lng')
      .ringAltitude(0.006)
      .ringColor((d: object) => {
        const r = d as Ring;
        if (r.kind === 'sel') return (t: number) => `rgba(220,245,255,${(1 - t) * 0.9})`;
        const oni = currentOni();
        const c = new THREE.Color(PHASE_COLOR[phaseOf(oni)]);
        const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
        return (t: number) => `rgba(${rgb},${(1 - t) * 0.75})`;
      })
      .ringMaxRadius((d: object) => ((d as Ring).kind === 'sel' ? 2.4 : 7 + 5 * Math.min(2.5, Math.abs(currentOni()))))
      .ringPropagationSpeed((d: object) => ((d as Ring).kind === 'sel' ? 2.2 : 3.2))
      .ringRepeatPeriod((d: object) => ((d as Ring).kind === 'sel' ? 900 : 1500));

    globe
      .arcStartLat('sLat')
      .arcStartLng('sLng')
      .arcEndLat('eLat')
      .arcEndLng('eLng')
      .arcColor('colors')
      .arcStroke(0.42)
      .arcAltitudeAutoScale(0.42)
      .arcDashLength(0.4)
      .arcDashGap(0.25)
      .arcDashInitialGap(() => Math.random())
      .arcDashAnimateTime(2600)
      .arcsTransitionDuration(600);

    function currentOni() {
      const { traj, t } = useStore.getState();
      if (!traj) return 0;
      const k = Math.min(Math.floor(t), traj.oni.length - 1);
      const k2 = Math.min(k + 1, traj.oni.length - 1);
      return traj.oni[k] * (1 - (t - k)) + traj.oni[k2] * (t - k);
    }

    let arcSig = '';
    function updateArcs() {
      const { traj, fields, t, layer } = useStore.getState();
      if (!traj || !fields) return;
      const k = Math.round(t);
      const oni = traj.oni[k];
      const sig = `${traj.kind}|${traj.title}|${k}|${oni.toFixed(2)}|${layer}`;
      if (sig === arcSig) return;
      arcSig = sig;
      const src = PHASE_COLOR[phaseOf(oni)];
      const arcs = Math.abs(oni) < 0.5
        ? []
        : data.model.kernels.flatMap((kn) => {
            const cell = nearestCell(data.grid, kn.lat, kn.lng);
            if (cell.index < 0 || cell.dist > 3) return [];
            const rain = fields.rain[k][cell.index];
            if (Math.abs(rain) < 6) return [];
            const end = rain > 0 ? 'rgba(80,190,255,0.85)' : 'rgba(255,110,80,0.85)';
            return [{ sLat: data.model.nino34.lat, sLng: data.model.nino34.lng, eLat: kn.lat, eLng: kn.lng, colors: [`${src}cc`, end] }];
          });
      globe.arcsData(arcs);
    }

    let ringSig = '';
    function updateRings() {
      const { selection } = useStore.getState();
      const oni = currentOni();
      const sel = selectionLatLng(data, selection);
      const sig = `${phaseOf(oni)}|${Math.abs(oni).toFixed(1)}|${sel ? `${sel.lat},${sel.lng}` : ''}`;
      if (sig === ringSig) return;
      ringSig = sig;
      const rings: Ring[] = [];
      if (Math.abs(oni) >= 0.3) rings.push({ lat: data.model.nino34.lat, lng: data.model.nino34.lng, kind: 'nino' });
      if (sel) rings.push({ ...sel, kind: 'sel' });
      globe.ringsData(rings);
    }

    let pinLayer = '';
    function updatePins() {
      const { layer } = useStore.getState();
      if (layer === pinLayer) return;
      pinLayer = layer;
      globe.htmlElementsData(layer === 'energy' ? [...cityPins, ...damPins] : cityPins);
    }

    // --- column targets -----------------------------------------------------
    const heights = new Float32Array(data.grid.n);
    const colors = new Float32Array(data.grid.n * 3);
    const rgb: [number, number, number] = [0, 0, 0];
    function updateColumns() {
      const { fields, t, layer, climateVar } = useStore.getState();
      if (!fields) return;
      const spec = activeSpec(layer, climateVar);
      const arr = spec.field(fields);
      for (let i = 0; i < data.grid.n; i++) {
        const v = sample(arr, i, t);
        heights[i] = 0.15 + spec.height(v) * MAX_H;
        spec.color(v, rgb);
        colors[i * 3] = rgb[0];
        colors[i * 3 + 1] = rgb[1];
        colors[i * 3 + 2] = rgb[2];
      }
      columns.setTargets(heights, colors);
    }

    let dirty = true;
    const unsub = useStore.subscribe((s, prev) => {
      if (s.fields !== prev.fields || s.t !== prev.t || s.layer !== prev.layer || s.climateVar !== prev.climateVar) dirty = true;
      if (s.selection !== prev.selection) ringSig = '';
      if (s.fly && s.fly !== prev.fly) {
        flyTo(globe, { lat: s.fly.lat, lng: s.fly.lng, altitude: s.fly.altitude }, s.fly.duration);
      }
    });

    // --- interaction ----------------------------------------------------------
    const handleClick = (lat: number, lng: number) => {
      const st = useStore.getState();
      if (st.tourStep !== null) return;
      let city = null as null | (typeof data.cities)[number];
      let best = 0.75;
      for (const c of data.cities) {
        const d = arcDeg(lat, lng, c.lat, c.lng);
        if (d < best) {
          best = d;
          city = c;
        }
      }
      if (city) {
        st.select({ kind: 'city', id: city.id });
        return;
      }
      const cell = nearestCell(data.grid, lat, lng);
      if (cell.index >= 0 && cell.dist < 1.1) st.select({ kind: 'cell', index: cell.index });
    };
    globe.onGlobeClick(({ lat, lng }) => handleClick(lat, lng));
    globe.onPolygonClick((_p, _e, c) => handleClick(c.lat, c.lng));
    const zoomClass = () => {
      const alt = globe.pointOfView().altitude;
      el.classList.toggle('zoom-far', alt > 1.7);
      el.classList.toggle('zoom-near', alt < 0.8);
    };
    globe.onZoom(zoomClass);
    const stopFlight = () => cancelFlight();
    el.addEventListener('pointerdown', stopFlight);
    el.addEventListener('wheel', stopFlight, { passive: true });

    const onResize = () => globe.width(window.innerWidth).height(window.innerHeight);
    window.addEventListener('resize', onResize);

    // --- intro + loop ---------------------------------------------------------
    globe.pointOfView({ lat: 5, lng: -110, altitude: 4.2 }, 0);
    zoomClass();
    setTimeout(() => flyTo(globe, { lat: -12, lng: -92, altitude: 2.3 }, 2800), 250);

    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const st = useStore.getState();
      if (dirty) {
        updateColumns();
        updateArcs();
        dirty = false;
      }
      updateRings();
      updatePins();
      const oni = currentOni();
      glow.setOni(oni);
      wind.setOni(oni);
      wind.visible = st.windOn;
      columns.tick(dt);
      glow.tick(dt, now / 1000);
      wind.tick(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    (window as unknown as { __globe?: GlobeInstance }).__globe = globe;

    return () => {
      cancelAnimationFrame(raf);
      cancelFlight();
      unsub();
      window.removeEventListener('resize', onResize);
      el.removeEventListener('pointerdown', stopFlight);
      el.removeEventListener('wheel', stopFlight);
      columns.dispose();
      globe._destructor();
      el.innerHTML = '';
    };
  }, []);

  return <div ref={ref} className="globe" />;
}
