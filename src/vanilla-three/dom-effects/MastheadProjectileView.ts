import * as THREE from 'three';
import {
  MastheadProjectiles,
  PROJECTILE_CAPACITY,
  TRAIL_SAMPLES,
} from '../../features/particle-text/MastheadProjectiles';
import { MACHINE_COLORS } from '../materials/machinePalette';

const vertexShader = `
  attribute float aFade;
  attribute float aProgress;
  attribute float aSide;
  varying float vFade;
  varying float vProgress;
  varying float vSide;
  void main() {
    vFade = aFade; vProgress = aProgress; vSide = aSide;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragmentShader = `
  varying float vFade;
  varying float vProgress;
  varying float vSide;
  void main() {
    float alpha = vFade * (1.0 - smoothstep(0.45, 1.0, abs(vSide)));
    if (alpha < 0.005) discard;
    vec3 color = mix(vec3(0.055, 0.06, 0.065), vec3(1.0, 0.037, 0.0), pow(1.0-vProgress, 7.0));
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

/** Instanced missile hardware and one tapered ribbon batch for every flight. */
export class MastheadProjectileView {
  readonly root = new THREE.Group();
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly finishes = MACHINE_COLORS.map(
    (color) => new THREE.MeshPhongMaterial({ color, shininess: 24 })
  );
  private readonly heads = this.finishes.map(
    (material) =>
      new THREE.InstancedMesh(this.box, material, PROJECTILE_CAPACITY * 4)
  );
  private readonly geometry = new THREE.BufferGeometry();
  private readonly positions = new Float32Array(
    PROJECTILE_CAPACITY * TRAIL_SAMPLES * 6
  );
  private readonly fade = new Float32Array(
    PROJECTILE_CAPACITY * TRAIL_SAMPLES * 2
  );
  private readonly trailMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  private readonly trails = new THREE.Mesh(this.geometry, this.trailMaterial);
  private readonly reticleMaterial = new THREE.MeshBasicMaterial({
    color: MACHINE_COLORS[2],
    transparent: true,
    depthWrite: false,
  });
  private readonly reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1, 40),
    this.reticleMaterial
  );
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3(0, 0, 1);
  private readonly counts = [0, 0, 0];
  private disposed = false;

  constructor() {
    const progress = new Float32Array(this.fade.length),
      side = new Float32Array(this.fade.length);
    const indices: number[] = [];
    for (let id = 0; id < PROJECTILE_CAPACITY; id++)
      for (let i = 0; i < TRAIL_SAMPLES; i++) {
        const vertex = (id * TRAIL_SAMPLES + i) * 2;
        progress[vertex] = progress[vertex + 1] = i / (TRAIL_SAMPLES - 1);
        side[vertex] = -1;
        side[vertex + 1] = 1;
        if (i < TRAIL_SAMPLES - 1)
          indices.push(
            vertex,
            vertex + 1,
            vertex + 2,
            vertex + 1,
            vertex + 3,
            vertex + 2
          );
      }
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(
        THREE.DynamicDrawUsage
      )
    );
    this.geometry.setAttribute(
      'aFade',
      new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage)
    );
    this.geometry.setAttribute(
      'aProgress',
      new THREE.BufferAttribute(progress, 1)
    );
    this.geometry.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.geometry.setIndex(indices);
    this.trails.frustumCulled = false;
    this.heads.forEach((head) => {
      head.frustumCulled = false;
      head.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      head.count = 0;
    });
    this.root.add(...this.heads, this.trails, this.reticle);
    this.root.visible = false;
  }

  frame(
    flights: MastheadProjectiles,
    originX: number,
    originY: number,
    em: number
  ) {
    this.root.visible = flights.active;
    this.root.position.set(originX, originY, 150);
    this.counts.fill(0);
    for (let id = 0; id < flights.items.length; id++) {
      const p = flights.items[id];
      if (!p.active && p.tailAge >= 0.3) {
        this.fade.fill(0, id * TRAIL_SAMPLES * 2, (id + 1) * TRAIL_SAMPLES * 2);
        continue;
      }
      const seeker = p.kind === 'seeker';
      const size = seeker
        ? Math.max(9, Math.min(18, em * 0.115))
        : Math.max(3, em * 0.024);
      const angle = Math.atan2(-p.vy, p.vx),
        c = Math.cos(angle),
        s = Math.sin(angle);
      if (p.active) {
        this.rotation.setFromAxisAngle(this.axis, angle);
        const part = (
          color: number,
          x: number,
          y: number,
          sx: number,
          sy: number,
          sz: number
        ) => {
          this.position.set(
            p.x + (x * c - y * s) * size,
            -p.y + (x * s + y * c) * size,
            1
          );
          this.size.set(sx * size, sy * size, sz * size);
          this.matrix.compose(this.position, this.rotation, this.size);
          this.heads[color].setMatrixAt(this.counts[color]++, this.matrix);
        };
        if (seeker) {
          part(0, 0, 0, 0.72, 0.24, 0.24);
          part(1, 0.42, 0, 0.18, 0.16, 0.16);
          part(1, -0.22, 0.17, 0.22, 0.08, 0.08);
          part(1, -0.22, -0.17, 0.22, 0.08, 0.08);
          part(2, -0.43, 0, 0.15, 0.16, 0.16);
        } else part(2, 0, 0, 1.8, 0.5, 0.5);
      }
      const life = p.active ? 1 : Math.max(0, 1 - p.tailAge / 0.3);
      for (let i = 0; i < TRAIL_SAMPLES; i++) {
        const index =
          (p.cursor - Math.min(i, p.samples - 1) + TRAIL_SAMPLES) %
          TRAIL_SAMPLES;
        const previous = (index - 1 + TRAIL_SAMPLES) % TRAIL_SAMPLES;
        const x = i === 0 ? p.x : p.history[index * 2];
        const y = i === 0 ? p.y : p.history[index * 2 + 1];
        let dx = x - p.history[previous * 2],
          dy = y - p.history[previous * 2 + 1];
        const length = Math.hypot(dx, dy);
        if (length > 0.001) {
          dx /= length;
          dy /= length;
        } else {
          dx = c;
          dy = -s;
        }
        const t = i / (TRAIL_SAMPLES - 1);
        const width = (seeker ? size * 0.09 : size * 0.3) * (1 - t) + 0.15;
        const vertex = (id * TRAIL_SAMPLES + i) * 2;
        const offset = vertex * 3;
        this.positions[offset] = x - dy * width;
        this.positions[offset + 1] = -y - dx * width;
        this.positions[offset + 2] = 0;
        this.positions[offset + 3] = x + dy * width;
        this.positions[offset + 4] = -y + dx * width;
        this.positions[offset + 5] = 0;
        this.fade[vertex] = this.fade[vertex + 1] =
          i < p.samples ? life * (1 - t) ** 1.7 * (seeker ? 0.65 : 0.4) : 0;
      }
    }
    this.heads.forEach((head, color) => {
      head.count = this.counts[color];
      head.instanceMatrix.needsUpdate = true;
    });
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aFade.needsUpdate = true;
    const target = flights.reticle;
    this.reticle.visible = target.age < 1.5;
    this.reticle.position.set(target.x, -target.y, 2);
    this.reticle.scale.setScalar(
      Math.max(7, em * 0.13) * (1 + Math.min(1, target.age * 5) * 0.3)
    );
    this.reticleMaterial.opacity = Math.max(0, 1 - target.age / 1.5) * 0.7;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.heads.forEach((head) => head.dispose());
    this.box.dispose();
    this.finishes.forEach((material) => material.dispose());
    this.geometry.dispose();
    this.trailMaterial.dispose();
    this.reticle.geometry.dispose();
    this.reticleMaterial.dispose();
    this.root.clear();
  }
}
