import * as THREE from 'three';

type CoordFn = (lat: number, lng: number, alt?: number) => { x: number; y: number; z: number };

/**
 * One instanced hexagonal prism per land grid point. Heights and colours ease
 * towards their targets every frame, so month interpolation, layer switches
 * and What-If recalculations all morph smoothly.
 */
export class HexColumns {
  readonly mesh: THREE.InstancedMesh;
  private n: number;
  private base: THREE.Vector3[] = [];
  private quat: THREE.Quaternion[] = [];
  private h: Float32Array;
  private hT: Float32Array;
  private c: Float32Array;
  private cT: Float32Array;
  private radius: number;
  private settled = false;
  private m = new THREE.Matrix4();
  private s = new THREE.Vector3();
  private col = new THREE.Color();

  constructor(lat: number[], lng: number[], spacingDeg: number, globeRadius: number, coords: CoordFn) {
    this.n = lat.length;
    // Circumradius of a hexagon whose flat-to-flat width equals the spacing.
    this.radius = (((spacingDeg * Math.PI) / 180) * globeRadius) / Math.sqrt(3) * 0.97;
    const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vH;')
        .replace(
          '#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ndiffuseColor.rgb *= 0.55 + 0.45 * vH;\ntotalEmissiveRadiance += diffuseColor.rgb * (0.18 + 0.62 * vH * vH);',
        );
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, this.n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.h = new Float32Array(this.n);
    this.hT = new Float32Array(this.n);
    this.c = new Float32Array(this.n * 3);
    this.cT = new Float32Array(this.n * 3);

    const up = new THREE.Vector3();
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    const basis = new THREE.Matrix4();
    for (let i = 0; i < this.n; i++) {
      const p = coords(lat[i], lng[i], 0.004);
      const pn = coords(Math.min(lat[i] + 0.05, 89.9), lng[i], 0.004);
      const v = new THREE.Vector3(p.x, p.y, p.z);
      up.copy(v).normalize();
      north.set(pn.x - p.x, pn.y - p.y, pn.z - p.z);
      north.sub(up.clone().multiplyScalar(north.dot(up))).normalize();
      east.crossVectors(up, north).normalize();
      basis.makeBasis(east, up, north);
      this.base.push(v);
      this.quat.push(new THREE.Quaternion().setFromRotationMatrix(basis));
      this.c.set([0.25, 0.28, 0.33], i * 3);
      this.mesh.setColorAt(i, this.col.setRGB(0.25, 0.28, 0.33, THREE.SRGBColorSpace));
    }
    this.write();
  }

  /** heights in globe units, colours as sRGB triplets */
  setTargets(heights: Float32Array, colors: Float32Array) {
    this.hT.set(heights);
    this.cT.set(colors);
    this.settled = false;
  }

  tick(dt: number) {
    if (this.settled) return;
    const k = 1 - Math.exp(-dt * 9);
    let maxDiff = 0;
    for (let i = 0; i < this.n; i++) {
      const d = this.hT[i] - this.h[i];
      this.h[i] += d * k;
      if (Math.abs(d) > maxDiff) maxDiff = Math.abs(d);
    }
    for (let j = 0; j < this.n * 3; j++) {
      const d = this.cT[j] - this.c[j];
      this.c[j] += d * k;
      if (Math.abs(d) * 20 > maxDiff) maxDiff = Math.abs(d) * 20;
    }
    this.write();
    if (maxDiff < 0.002) this.settled = true;
  }

  private write() {
    for (let i = 0; i < this.n; i++) {
      this.s.set(this.radius, Math.max(0.12, this.h[i]), this.radius);
      this.m.compose(this.base[i], this.quat[i], this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.col.setRGB(this.c[i * 3], this.c[i * 3 + 1], this.c[i * 3 + 2], THREE.SRGBColorSpace));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
