import * as THREE from 'three';

type CoordFn = (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };

/**
 * Sea-surface temperature anomaly tongue over the equatorial Pacific.
 * Its footprint follows the canonical ENSO SST pattern (maximum in the
 * central-eastern Pacific, narrowing towards the South American coast),
 * its amplitude and colour follow the ONI of the current frame.
 */
export class NinoGlow {
  readonly mesh: THREE.Mesh;
  private uniforms: { uTime: { value: number }; uOni: { value: number }; uColor: { value: THREE.Color } };
  private oni = 0;
  private oniTarget = 0;

  constructor(coords: CoordFn) {
    const LAT0 = -24, LAT1 = 24, LNG0 = -208, LNG1 = -74;
    const nx = 120, ny = 48;
    const pos: number[] = [];
    const geo: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        const lat = LAT0 + ((LAT1 - LAT0) * j) / ny;
        const lng = LNG0 + ((LNG1 - LNG0) * i) / nx;
        const p = coords(lat, lng, 0.0035);
        pos.push(p.x, p.y, p.z);
        geo.push(lng, lat);
      }
    }
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('geo', new THREE.Float32BufferAttribute(geo, 2));
    g.setIndex(idx);
    this.uniforms = { uTime: { value: 0 }, uOni: { value: 0 }, uColor: { value: new THREE.Color('#ff6a3d') } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute vec2 geo;
        varying vec2 vGeo;
        void main() {
          vGeo = geo;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOni;
        uniform vec3 uColor;
        varying vec2 vGeo;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
        }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
        void main() {
          float lng = vGeo.x, lat = vGeo.y;
          // Tongue widens towards the central Pacific and hugs the coast of Peru/Ecuador.
          float width = mix(4.5, 9.0, smoothstep(-80.0, -150.0, lng));
          float east = smoothstep(-74.0, -84.0, lng);
          float west = smoothstep(-208.0, -170.0, lng);
          float core = exp(-pow((lng + 128.0) / 42.0, 2.0));
          float tongue = exp(-pow((lat + 0.5) / width, 2.0)) * east * west * (0.45 + 0.55 * core);
          float n = fbm(vec2(lng * 0.08 - uTime * 0.05, lat * 0.16 + uTime * 0.03));
          float amp = clamp(abs(uOni) / 2.4, 0.0, 1.25);
          float pulse = 0.82 + 0.18 * sin(uTime * 1.6 - lng * 0.05);
          float a = tongue * (0.55 + 0.75 * n) * amp * pulse;
          // Niño 3.4 box hint
          float box = step(-170.0, lng) * step(lng, -120.0) * step(-5.0, lat) * step(lat, 5.0);
          a += box * 0.05 * amp;
          vec3 col = mix(uColor, vec3(1.0, 0.93, 0.75), smoothstep(0.55, 1.1, a) * 0.6);
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.renderOrder = 2;
  }

  setOni(oni: number) {
    this.oniTarget = oni;
  }

  tick(dt: number, time: number) {
    this.oni += (this.oniTarget - this.oni) * (1 - Math.exp(-dt * 4));
    this.uniforms.uTime.value = time;
    this.uniforms.uOni.value = this.oni;
    const c = this.oni >= 0.5 ? '#ff5a2e' : this.oni <= -0.5 ? '#25c8ff' : '#9fb4c8';
    this.uniforms.uColor.value.lerp(new THREE.Color(c), 1 - Math.exp(-dt * 4));
  }
}
