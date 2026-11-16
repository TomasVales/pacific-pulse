import type { GlobeInstance } from 'globe.gl';

interface Pov {
  lat: number;
  lng: number;
  altitude: number;
}

const toVec = (lat: number, lng: number): [number, number, number] => {
  const p = (lat * Math.PI) / 180;
  const l = (lng * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
};

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

let active: number | null = null;

export function cancelFlight() {
  if (active !== null) cancelAnimationFrame(active);
  active = null;
}

/**
 * Cinematic flight: great-circle interpolation of the target plus an altitude
 * "hop" proportional to the distance travelled (zoom out, glide, land).
 */
export function flyTo(globe: GlobeInstance, to: Pov, duration?: number): Promise<void> {
  cancelFlight();
  const from = globe.pointOfView();
  const a = toVec(from.lat, from.lng);
  const b = toVec(to.lat, to.lng);
  const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const omega = Math.acos(dot);
  const distDeg = (omega * 180) / Math.PI;
  const ms = duration ?? Math.min(3400, 1300 + distDeg * 22 + Math.abs(to.altitude - from.altitude) * 300);
  const hop = Math.max(0, Math.min(1.4, distDeg / 55)) * Math.max(0.4, 2.2 - Math.min(from.altitude, to.altitude));
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = (now: number) => {
      const x = Math.min(1, (now - t0) / ms);
      const e = ease(x);
      let v: [number, number, number];
      if (omega < 1e-4) v = b;
      else {
        const s0 = Math.sin((1 - e) * omega) / Math.sin(omega);
        const s1 = Math.sin(e * omega) / Math.sin(omega);
        v = [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1];
      }
      const lat = (Math.asin(Math.max(-1, Math.min(1, v[2]))) * 180) / Math.PI;
      const lng = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
      const altitude = from.altitude + (to.altitude - from.altitude) * e + hop * Math.sin(Math.PI * e);
      globe.pointOfView({ lat, lng, altitude }, 0);
      if (x < 1) active = requestAnimationFrame(step);
      else {
        active = null;
        resolve();
      }
    };
    active = requestAnimationFrame(step);
  });
}
