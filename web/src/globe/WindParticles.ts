import * as THREE from 'three';

type CoordFn = (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };

/**
 * Idealised climatological low-level circulation (not observed winds):
 * subtropical anticyclones (South Pacific, South Atlantic, Azores-Bermuda,
 * North Pacific), equatorial trade winds converging on the ITCZ, mid-latitude
 * westerlies and the South American Low-Level Jet east of the Andes.
 * The Pacific trades weaken (Walker circulation slowdown) as ONI rises and
 * the low-level jet strengthens during El Niño.
 */
export function windAt(lat: number, lng: number, oni: number): [number, number] {
  let u = 0;
  let v = 0;
  const gyre = (clat: number, clng: number, R: number, A: number) => {
    const dy = lat - clat;
    const dx = (lng - clng) * Math.cos((lat * Math.PI) / 180);
    const e = Math.exp(-(dx * dx + dy * dy) / (R * R));
    // u = -dψ/dy, v = dψ/dx with ψ = A e^{-r²/R²}: A > 0 spins clockwise
    u += ((2 * A * dy) / (R * R)) * e;
    v += ((-2 * A * dx) / (R * R)) * e;
  };
  gyre(-30, -95, 20, -95); // South Pacific high (counter-clockwise in SH)
  gyre(-29, -15, 18, -85); // South Atlantic high
  gyre(32, -45, 18, 85); // Azores-Bermuda high (clockwise in NH)
  gyre(33, -140, 18, 80); // North Pacific high
  const itcz = 5 + 3 * Math.sin((lng + 60) / 40);
  const al = Math.abs(lat - itcz);
  let trade = -(3.5 + 3.5 * Math.exp(-(((al - 12) / 8) ** 2))) * (al < 28 ? 1 : Math.exp(-(al - 28) / 4));
  if (lng < -80 && Math.abs(lat) < 14) trade *= Math.max(-0.35, 1 - 0.36 * oni);
  u += trade;
  v += -Math.sign(lat - itcz) * 2.2 * Math.sin((Math.PI * Math.min(al, 26)) / 26);
  u += 9 * Math.exp(-(((lat + 48) / 9) ** 2)) + 7 * Math.exp(-(((lat - 44) / 8) ** 2));
  const jet = 6.5 * (1 + 0.18 * oni) * Math.exp(-(((lng + 62) / 4.5) ** 2)) * Math.exp(-(((lat + 19) / 8) ** 2));
  v -= jet;
  return [u, v];
}

const N = 2600;
const LAT0 = -58, LAT1 = 34, LNG0 = -140, LNG1 = -25;

export class WindParticles {
  readonly lines: THREE.LineSegments;
  private lat = new Float32Array(N);
  private lng = new Float32Array(N);
  private age = new Float32Array(N);
  private life = new Float32Array(N);
  private pos: Float32Array;
  private alpha: Float32Array;
  private coords: CoordFn;
  private oni = 0;
  private fade = 0;
  visible = true;

  constructor(coords: CoordFn) {
    this.coords = coords;
    this.pos = new Float32Array(N * 6);
    this.alpha = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) this.spawn(i, Math.random() * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uFade: { value: 0 } },
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uFade; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.72,0.9,1.0) * vA * uFade, vA * uFade); }`,
    });
    this.lines = new THREE.LineSegments(g, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 3;
  }

  private spawn(i: number, age = 0) {
    this.lat[i] = LAT0 + Math.random() * (LAT1 - LAT0);
    this.lng[i] = LNG0 + Math.random() * (LNG1 - LNG0);
    this.life[i] = 3 + Math.random() * 4;
    this.age[i] = age % this.life[i];
  }

  setOni(oni: number) {
    this.oni = oni;
  }

  tick(dt: number) {
    const target = this.visible ? 1 : 0;
    this.fade += (target - this.fade) * (1 - Math.exp(-dt * 3));
    (this.lines.material as THREE.ShaderMaterial).uniforms.uFade.value = this.fade;
    this.lines.visible = this.fade > 0.01;
    if (!this.lines.visible) return;
    const step = Math.min(dt, 0.05);
    for (let i = 0; i < N; i++) {
      this.age[i] += step;
      const [u, v] = windAt(this.lat[i], this.lng[i], this.oni);
      const coslat = Math.max(0.2, Math.cos((this.lat[i] * Math.PI) / 180));
      const k = 0.35;
      this.lat[i] += v * step * k;
      this.lng[i] += (u * step * k) / coslat;
      if (this.age[i] > this.life[i] || this.lat[i] < LAT0 || this.lat[i] > LAT1 || this.lng[i] < LNG0 || this.lng[i] > LNG1) {
        this.spawn(i);
      }
      const speed = Math.hypot(u, v);
      const tail = 0.22 + 0.06 * speed;
      const hLat = this.lat[i];
      const hLng = this.lng[i];
      const tLat = hLat - (v / (speed + 1e-6)) * tail * 3;
      const tLng = hLng - ((u / (speed + 1e-6)) * tail * 3) / coslat;
      const a = this.coords(hLat, hLng, 0.02);
      const b = this.coords(tLat, tLng, 0.02);
      this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      const lifeF = this.age[i] / this.life[i];
      const env = Math.min(1, lifeF * 5) * Math.min(1, (1 - lifeF) * 4);
      const s = Math.min(1, speed / 9);
      this.alpha[i * 2] = env * (0.45 + 0.55 * s);
      this.alpha[i * 2 + 1] = 0;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.alpha.needsUpdate = true;
  }
}

export function makeStarfield(): THREE.Points {
  const n = 4000;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const r = 2600 + Math.random() * 1800;
    const s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
    const b = 0.25 + Math.pow(Math.random(), 3) * 0.75;
    const tint = Math.random();
    col.set([b * (0.85 + 0.15 * tint), b * 0.92, b * (1.0 - 0.1 * tint)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false });
  return new THREE.Points(g, m);
}
