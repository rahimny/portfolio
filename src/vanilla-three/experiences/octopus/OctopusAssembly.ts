import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { type OctopusPose, type OctopusView } from '@/features/octopus/model';
import { OctopusTentacles } from './OctopusTentacles';

const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const TAU = Math.PI * 2;
const Y = V(0, 1, 0);

export class Batch {
  private buckets = new Map<T.Material, T.BufferGeometry[]>();
  private edges: T.BufferGeometry[] = [];
  private group: T.Group;
  private ink: T.LineBasicMaterial;
  constructor(group: T.Group, ink: T.LineBasicMaterial) {
    this.group = group;
    this.ink = ink;
  }
  add(
    g: T.BufferGeometry,
    m: T.Material,
    p = V(),
    s = V(1, 1, 1),
    r = new T.Euler(),
    edge = false
  ) {
    g.applyMatrix4(
      new T.Matrix4().compose(p, new T.Quaternion().setFromEuler(r), s)
    );
    if (edge) this.edges.push(new T.EdgesGeometry(g, 28));
    const bucket = this.buckets.get(m) ?? [];
    bucket.push(g);
    this.buckets.set(m, bucket);
  }
  rod(a: T.Vector3, b: T.Vector3, radius: number, m: T.Material) {
    const g = new T.CylinderGeometry(radius, radius, a.distanceTo(b), 8);
    g.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize())
    );
    this.add(g, m, a.clone().add(b).multiplyScalar(0.5));
  }
  tube(points: T.Vector3[], radius: number, m: T.Material) {
    this.add(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points),
        points.length * 3,
        radius,
        6,
        false
      ),
      m
    );
  }
  finish() {
    for (const [m, gs] of this.buckets) {
      const merged = mergeGeometries(gs);
      if (merged) this.group.add(new T.Mesh(merged, m));
      gs.forEach((g) => g.dispose());
    }
    if (this.edges.length) {
      const g = mergeGeometries(this.edges);
      if (g) this.group.add(new T.LineSegments(g, this.ink));
      this.edges.forEach((g) => g.dispose());
    }
  }
}

interface Part {
  group: T.Group;
  offset: T.Vector3;
  spin?: number;
}
export class OctopusAssembly {
  readonly root = new T.Group();
  private parts: Part[] = [];
  private shells: T.Mesh[] = [];
  private ramp = new T.DataTexture(
    new Uint8Array([85, 148, 209, 255]),
    4,
    1,
    T.RedFormat
  );
  private ceramic: T.MeshToonMaterial;
  private grey: T.MeshToonMaterial;
  private dark: T.MeshToonMaterial;
  private red: T.MeshToonMaterial;
  private steel = new T.MeshStandardMaterial({
    color: '#a8b5ac',
    metalness: 0.6,
    roughness: 0.32,
  });
  private ink = new T.LineBasicMaterial({
    color: '#233b3c',
    transparent: true,
    opacity: 0.65,
  });
  private glass = new T.MeshPhysicalMaterial({
    color: '#b4d0c7',
    transparent: true,
    opacity: 0.1,
    roughness: 0.25,
    depthWrite: false,
    side: T.DoubleSide,
  });
  private materials: T.Material[];
  private textures: T.Texture[] = [];
  private tentacles: OctopusTentacles;
  private disposed = false;
  constructor() {
    this.ramp.minFilter = this.ramp.magFilter = T.NearestFilter;
    this.ramp.needsUpdate = true;
    this.ceramic = new T.MeshToonMaterial({
      color: '#e9e9d9',
      gradientMap: this.ramp,
      side: T.DoubleSide,
    });
    this.grey = new T.MeshToonMaterial({
      color: '#8d9d98',
      gradientMap: this.ramp,
    });
    this.dark = new T.MeshToonMaterial({
      color: '#283f43',
      gradientMap: this.ramp,
    });
    this.red = new T.MeshToonMaterial({
      color: '#e34725',
      gradientMap: this.ramp,
    });
    this.materials = [
      this.ceramic,
      this.grey,
      this.dark,
      this.red,
      this.steel,
      this.ink,
      this.glass,
    ];
    this.buildMantle();
    this.buildCore();
    this.buildHead();
    this.buildManifold();
    this.tentacles = new OctopusTentacles({
      ceramic: this.ceramic,
      dark: this.dark,
      steel: this.steel,
      red: this.red,
      glass: this.glass,
    });
    this.root.add(this.tentacles.root);
    for (const part of this.parts)
      part.group.traverse((o) => {
        if (o instanceof T.Mesh && o.material === this.ceramic)
          this.shells.push(o);
      });
  }
  private part(offset: T.Vector3, name: string) {
    const group = new T.Group();
    group.name = name;
    this.root.add(group);
    this.parts.push({ group, offset });
    return { group, f: new Batch(group, this.ink) };
  }
  private bolts(f: Batch, r: number, z: number, y: number, count = 16) {
    for (let j = 0; j < count; j++) {
      const a = (j * TAU) / count;
      f.add(
        new T.CylinderGeometry(0.027, 0.027, 0.026, 6),
        this.dark,
        V(Math.cos(a) * r, y + Math.sin(a) * r, z),
        undefined,
        new T.Euler(Math.PI / 2, 0, 0)
      );
    }
  }
  private label(
    group: T.Group,
    text: string,
    p: T.Vector3,
    width = 0.45,
    rotation = new T.Euler()
  ) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#e9e9d9';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#283f43';
    ctx.font = 'bold 48px monospace';
    ctx.fillText(text, 12, 57);
    for (let i = 0; i < 54; i++)
      ctx.fillRect(12 + i * 9, 81, i % 3 === 0 ? 5 : 2, 27);
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    this.textures.push(texture);
    const material = new T.MeshBasicMaterial({ map: texture });
    this.materials.push(material);
    const mesh = new T.Mesh(new T.PlaneGeometry(width, width / 4), material);
    mesh.position.copy(p);
    mesh.rotation.copy(rotation);
    group.add(mesh);
  }
  private buildMantle() {
    const centre = V(0, 1.64, -1.56),
      shape = V(1.28, 1.19, 2.22);
    const { f } = this.part(V(0, 2.35, -1.2), 'reticulated pressure envelope');
    f.add(new T.SphereGeometry(1, 48, 30), this.glass, centre, shape);
    const point = (a: number, t: number) =>
      V(
        -Math.sin(t) * Math.cos(a) * shape.x,
        Math.cos(t) * shape.y,
        Math.sin(t) * Math.sin(a) * shape.z
      ).add(centre);
    for (let k = 0; k < 36; k++)
      f.tube(
        Array.from({ length: 29 }, (_, j) =>
          point((k * TAU) / 36, (j * Math.PI) / 28)
        ),
        0.0065,
        this.grey
      );
    for (let k = 1; k < 26; k++)
      f.tube(
        Array.from({ length: 65 }, (_, j) =>
          point((j * TAU) / 64, (k * Math.PI) / 26)
        ),
        0.0055,
        this.grey
      );
    f.finish();
    // Independently lifted dorsal shell panels reveal the structural ribs underneath.
    for (let tier = 0; tier < 2; tier++)
      for (let k = 0; k < 6; k++) {
        const a = (k * TAU) / 6;
        const panel = this.part(
          V(Math.cos(a) * 0.9, 2.6 + tier * 0.5, Math.sin(a) * 0.9 - 1.0),
          'mantle armour'
        );
        panel.f.add(
          new T.SphereGeometry(
            1.025,
            12,
            8,
            a + 0.06,
            0.91,
            0.22 + tier * 0.47,
            0.4
          ),
          this.ceramic,
          centre,
          shape,
          undefined,
          true
        );
        for (let j = 0; j < 4; j++) {
          const p = point(a + 0.18 + j * 0.17, 0.43 + tier * 0.47)
            .sub(centre)
            .multiplyScalar(1.032)
            .add(centre);
          panel.f.add(new T.SphereGeometry(0.023, 6, 4), this.dark, p);
        }
        panel.f.finish();
      }
    const spine = this.part(V(0, 2.4, -0.5), 'dorsal service rail');
    spine.f.add(
      new T.BoxGeometry(0.25, 0.1, 2.1),
      this.dark,
      V(0, 2.77, -1.5),
      undefined,
      undefined,
      true
    );
    for (let j = 0; j < 18; j++)
      spine.f.add(
        new T.BoxGeometry(0.43, 0.075, 0.035),
        j % 6 === 0 ? this.red : this.steel,
        V(0, 2.84, -2.42 + j * 0.105)
      );
    spine.f.finish();
    this.label(
      spine.group,
      'OC / 08',
      V(0, 2.89, -1.5),
      0.44,
      new T.Euler(-Math.PI / 2, 0, 0)
    );
  }
  private buildCore() {
    const frame = this.part(V(0, 0.15, -0.45), 'titanium pressure cage');
    for (let j = 0; j < 9; j++) {
      const z = -3.04 + j * 0.34;
      frame.f.add(
        new T.TorusGeometry(0.84, 0.037, 6, 48),
        this.dark,
        V(0, 1.62, z),
        V(1, 0.85, 1)
      );
      for (let k = 0; k < 12; k++) {
        const a = (k * TAU) / 12;
        frame.f.add(
          new T.BoxGeometry(0.065, 0.09, 0.075),
          this.steel,
          V(Math.cos(a) * 0.84, 1.62 + Math.sin(a) * 0.72, z),
          undefined,
          new T.Euler(0, 0, a),
          true
        );
      }
    }
    for (let k = 0; k < 8; k++) {
      const a = (k * TAU) / 8;
      frame.f.rod(
        V(Math.cos(a) * 0.85, 1.62 + Math.sin(a) * 0.72, -3.05),
        V(Math.cos(a) * 0.85, 1.62 + Math.sin(a) * 0.72, -0.3),
        0.027,
        this.steel
      );
    }
    frame.f.finish();
    const power = this.part(V(0, 0.2, -1.55), 'axial power and sample core');
    power.f.add(
      new T.CylinderGeometry(0.34, 0.34, 2.5, 24),
      this.dark,
      V(0, 1.62, -1.6),
      undefined,
      new T.Euler(Math.PI / 2, 0, 0),
      true
    );
    for (let j = 0; j < 24; j++) {
      const z = -2.84 + j * 0.106;
      power.f.add(
        new T.TorusGeometry(0.37, 0.025, 5, 24),
        j % 6 === 0 ? this.red : this.steel,
        V(0, 1.62, z)
      );
      for (let k = 0; k < 4; k++) {
        const a = (k * TAU) / 4;
        power.f.add(
          new T.BoxGeometry(0.12, 0.09, 0.07),
          this.grey,
          V(Math.cos(a) * 0.41, 1.62 + Math.sin(a) * 0.41, z),
          undefined,
          new T.Euler(0, 0, a),
          true
        );
      }
    }
    power.f.finish();
    for (let i = 0; i < 7; i++) {
      const a = (i * TAU) / 7;
      const x = Math.cos(a) * 0.72,
        y = 1.62 + Math.sin(a) * 0.67;
      const tank = this.part(
        V(Math.cos(a) * 1.2, Math.sin(a) * 1.0 + 0.65, -0.55),
        'pressure-balanced reservoir'
      );
      tank.f.add(
        new T.CapsuleGeometry(0.21, 1.55, 5, 16),
        this.grey,
        V(x, y, -1.7),
        undefined,
        new T.Euler(Math.PI / 2, 0, 0),
        true
      );
      for (let j = 0; j < 15; j++)
        tank.f.add(
          new T.TorusGeometry(0.222, j % 7 === 0 ? 0.033 : 0.012, 5, 20),
          j % 7 === 0 ? this.dark : this.steel,
          V(x, y, -2.48 + j * 0.109)
        );
      for (const z of [-2.7, -0.71]) {
        tank.f.add(
          new T.CylinderGeometry(0.23, 0.23, 0.1, 16),
          this.dark,
          V(x, y, z),
          undefined,
          new T.Euler(Math.PI / 2, 0, 0),
          true
        );
        tank.f.add(
          new T.CylinderGeometry(0.075, 0.075, 0.18, 12),
          this.steel,
          V(x, y, z + 0.065),
          undefined,
          new T.Euler(Math.PI / 2, 0, 0)
        );
        for (let k = 0; k < 8; k++) {
          const b = (k * TAU) / 8;
          tank.f.add(
            new T.SphereGeometry(0.019, 6, 4),
            this.ceramic,
            V(x + Math.cos(b) * 0.18, y + Math.sin(b) * 0.18, z + 0.06)
          );
        }
      }
      tank.f.tube(
        [V(x, y, -0.61), V(x * 1.18, y, -0.36), V(x * 0.55, 1.03, 0.12)],
        0.038,
        this.dark
      );
      tank.f.tube(
        [
          V(x + 0.08, y, -0.61),
          V(x * 1.18 + 0.08, y, -0.36),
          V(x * 0.55 + 0.06, 1.03, 0.12),
        ],
        0.013,
        this.red
      );
      tank.f.add(
        new T.BoxGeometry(0.16, 0.11, 0.08),
        this.ceramic,
        V(x, y + 0.2, -1.22),
        undefined,
        undefined,
        true
      );
      tank.f.finish();
    }
    const aft = this.part(V(0, 0.45, -2), 'aft thruster and filter');
    for (const [r, z] of [
      [0.55, -3.05],
      [0.46, -3.22],
      [0.3, -3.37],
    ] as const) {
      aft.f.add(
        new T.CylinderGeometry(r, r, 0.13, 32),
        this.dark,
        V(0, 1.62, z),
        undefined,
        new T.Euler(Math.PI / 2, 0, 0),
        true
      );
      aft.f.add(
        new T.TorusGeometry(r, 0.027, 6, 40),
        this.steel,
        V(0, 1.62, z - 0.07)
      );
    }
    for (let j = 0; j < 16; j++) {
      const a = (j * TAU) / 16;
      aft.f.add(
        new T.BoxGeometry(0.065, 0.25, 0.06),
        this.grey,
        V(Math.cos(a) * 0.29, 1.62 + Math.sin(a) * 0.29, -3.43),
        undefined,
        new T.Euler(0, 0, a - 0.5),
        true
      );
    }
    this.bolts(aft.f, 0.5, -3.12, 1.62);
    aft.f.finish();
  }
  private buildHead() {
    const mount = this.part(V(0, 0, 0.7), 'optical pressure chassis');
    mount.f.add(
      new T.CylinderGeometry(0.22, 0.28, 1.25, 20),
      this.dark,
      V(0, 0.93, 0.3),
      undefined,
      new T.Euler(Math.PI / 2, 0, 0),
      true
    );
    for (const side of [-1, 1]) {
      for (let j = 0; j < 12; j++) {
        mount.f.add(
          new T.BoxGeometry(0.22, 0.035, 0.34),
          j % 4 === 0 ? this.grey : this.steel,
          V(side * 0.39, 0.69 + j * 0.038, 0.36),
          undefined,
          undefined,
          true
        );
        mount.f.add(
          new T.BoxGeometry(0.035, 0.065, 0.055),
          this.dark,
          V(side * 0.52, 0.72 + j * 0.038, 0.54)
        );
      }
      for (let c = 0; c < 4; c++) {
        mount.f.tube(
          [
            V(side * 0.2, 0.9, -0.28),
            V(side * (0.5 + c * 0.035), 1.27, 0.08),
            V(side * 0.58, 1.16, 0.62),
            V(side * 0.3, 0.95, 0.89),
          ],
          0.016,
          c === 0 ? this.red : this.dark
        );
      }
      mount.f.rod(
        V(side * 0.67, 0.94, -0.23),
        V(side * 0.67, 0.94, 0.85),
        0.035,
        this.steel
      );
      mount.f.add(
        new T.CylinderGeometry(0.12, 0.12, 0.25, 16),
        this.grey,
        V(side * 0.39, 0.94, 0.85),
        undefined,
        new T.Euler(Math.PI / 2, 0, 0),
        true
      );
    }
    for (let j = 0; j < 10; j++)
      mount.f.add(
        new T.TorusGeometry(0.25, 0.018, 5, 24),
        j % 4 === 0 ? this.red : this.steel,
        V(0, 0.93, -0.23 + j * 0.113)
      );
    for (let j = 0; j < 7; j++) {
      mount.f.add(
        new T.TorusGeometry(0.67, 0.024, 5, 32),
        this.steel,
        V(0, 0.93, -0.1 + j * 0.14),
        V(1, 0.62, 1)
      );
    }
    mount.f.finish();
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6;
      const shell = this.part(
        V(Math.cos(a) * 0.8, 0.8, 1.45 + Math.sin(a) * 0.3),
        'cranial armour'
      );
      shell.f.add(
        new T.SphereGeometry(1, 12, 10, a + 0.04, 0.94, 0.13, 1.56),
        this.ceramic,
        V(0, 1.02, 0.26),
        V(1.04, 0.66, 1.14),
        undefined,
        true
      );
      shell.f.finish();
    }
    // A low plated prow replaces the paired frontal eyes. Optical stacks sit laterally, under brows.
    const prow = this.part(V(0, 0.4, 1.9), 'forward sonar shroud');
    const shape = new T.Shape();
    shape.moveTo(-0.77, 0);
    shape.lineTo(-0.56, 0.32);
    shape.lineTo(0.56, 0.32);
    shape.lineTo(0.77, 0);
    shape.lineTo(0.45, -0.18);
    shape.lineTo(-0.45, -0.18);
    shape.closePath();
    prow.f.add(
      new T.ExtrudeGeometry(shape, {
        depth: 0.19,
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: 0.055,
        bevelThickness: 0.05,
      }),
      this.ceramic,
      V(0, 0.92, 1.04),
      undefined,
      new T.Euler(-0.22, 0, 0),
      true
    );
    prow.f.add(
      new T.BoxGeometry(0.68, 0.065, 0.035),
      this.dark,
      V(0, 1.01, 1.32),
      undefined,
      new T.Euler(-0.22, 0, 0)
    );
    for (let k = 0; k < 9; k++)
      prow.f.add(
        new T.BoxGeometry(0.017, 0.055, 0.014),
        this.steel,
        V(-0.28 + k * 0.07, 1.01, 1.345)
      );
    prow.f.add(
      new T.BoxGeometry(0.12, 0.032, 0.022),
      this.red,
      V(0.4, 0.88, 1.33)
    );
    prow.f.finish();
    this.label(
      prow.group,
      'HADAL / 08',
      V(0, 1.2, 1.32),
      0.39,
      new T.Euler(-0.22, 0, 0)
    );
    for (const sign of [-1, 1]) {
      const pod = this.part(V(sign * 1.35, 0, 1.0), 'lateral sensor gimbal');
      const rot = new T.Euler(0, 0, Math.PI / 2);
      for (const [r, d, x, mat] of [
        [0.31, 0.13, 0.88, this.grey],
        [0.265, 0.18, 1.0, this.dark],
        [0.205, 0.075, 1.13, this.steel],
        [0.174, 0.03, 1.17, this.dark],
      ] as const) {
        pod.f.add(
          new T.CylinderGeometry(r, r, d, 32),
          mat,
          V(sign * x, 0.99, 0.55),
          undefined,
          rot,
          true
        );
      }
      pod.f.add(
        new T.TorusGeometry(0.13, 0.012, 5, 28),
        this.red,
        V(sign * 1.193, 0.99, 0.55),
        undefined,
        new T.Euler(0, Math.PI / 2, 0)
      );
      pod.f.add(
        new T.SphereGeometry(0.115, 20, 14),
        this.dark,
        V(sign * 1.19, 0.99, 0.55),
        V(0.22, 1, 1)
      );
      pod.f.add(
        new T.BoxGeometry(0.38, 0.085, 0.64),
        this.ceramic,
        V(sign * 1.03, 1.25, 0.58),
        undefined,
        new T.Euler(0, 0, -sign * 0.14),
        true
      );
      for (let j = 0; j < 7; j++)
        pod.f.add(
          new T.BoxGeometry(0.17, 0.024, 0.035),
          this.dark,
          V(sign * 1.0, 1.303, 0.34 + j * 0.067)
        );
      pod.f.tube(
        [
          V(sign * 0.65, 1.3, -0.23),
          V(sign * 1.13, 1.34, -0.38),
          V(sign * 1.12, 0.76, -0.15),
          V(sign * 0.67, 0.42, 0.16),
        ],
        0.045,
        this.dark
      );
      pod.f.tube(
        [
          V(sign * 0.75, 1.35, -0.23),
          V(sign * 1.21, 1.34, -0.38),
          V(sign * 1.2, 0.76, -0.15),
        ],
        0.014,
        this.red
      );
      pod.f.finish();
    }
  }
  private buildManifold() {
    const ring = this.part(V(0, -0.6, 0), 'eight-axis hydraulic distribution');
    for (const y of [0.25, 0.42, 0.59]) {
      ring.f.add(
        new T.TorusGeometry(0.8, 0.046, 6, 64),
        y === 0.42 ? this.red : this.dark,
        V(0, y, 0),
        undefined,
        new T.Euler(Math.PI / 2, 0, 0)
      );
      ring.f.add(
        new T.TorusGeometry(0.53, 0.025, 5, 48),
        this.steel,
        V(0, y, 0),
        undefined,
        new T.Euler(Math.PI / 2, 0, 0)
      );
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8 + Math.PI / 8,
        x = Math.cos(a),
        z = Math.sin(a);
      const hub = this.part(
        V(x * 0.65, -0.8, z * 0.65),
        'arm-root tendon drive'
      );
      hub.f.add(
        new T.SphereGeometry(0.22, 16, 12),
        this.dark,
        V(x * 0.78, 0.33, z * 0.78)
      );
      const rot = new T.Euler(Math.PI / 2, 0, -a);
      hub.f.add(
        new T.CylinderGeometry(0.245, 0.245, 0.28, 16),
        this.grey,
        V(x * 0.78, 0.41, z * 0.78),
        undefined,
        rot,
        true
      );
      for (let j = 0; j < 8; j++)
        hub.f.add(
          new T.TorusGeometry(0.235, 0.015, 5, 20),
          this.steel,
          V(x * 0.78, 0.41, z * 0.78),
          undefined,
          new T.Euler(Math.PI / 2, 0, j * 0.12)
        );
      for (const side of [-1, 1]) {
        const a0 = V(
          x * 0.48 - z * side * 0.12,
          0.86,
          z * 0.48 + x * side * 0.12
        );
        const b = V(
          x * 0.89 - z * side * 0.12,
          0.27,
          z * 0.89 + x * side * 0.12
        );
        hub.f.rod(a0, b, 0.047, this.steel);
        hub.f.rod(a0, a0.clone().lerp(b, 0.56), 0.085, this.dark);
        hub.f.add(new T.SphereGeometry(0.07, 8, 6), this.grey, b);
      }
      hub.f.tube(
        [
          V(x * 0.48, 0.8, z * 0.48),
          V(x * 1.01, 0.64, z * 1.01),
          V(x * 0.84, 0.18, z * 0.84),
        ],
        0.031,
        this.dark
      );
      hub.f.finish();
      ring.f.rod(
        V(x * 0.23, 0.43, z * 0.23),
        V(x * 0.77, 0.43, z * 0.77),
        0.035,
        this.steel
      );
    }
    ring.f.finish();
    const sample = this.part(
      V(0, -1.5, 0.4),
      'sampling beak and instrument well'
    );
    sample.f.add(
      new T.CylinderGeometry(0.32, 0.19, 0.68, 24),
      this.dark,
      V(0, 0.02, 0),
      undefined,
      undefined,
      true
    );
    for (let j = 0; j < 9; j++)
      sample.f.add(
        new T.TorusGeometry(0.26 - j * 0.008, 0.022, 5, 24),
        this.steel,
        V(0, 0.25 - j * 0.068, 0),
        undefined,
        new T.Euler(Math.PI / 2, 0, 0)
      );
    for (let k = 0; k < 3; k++) {
      const a = (k * TAU) / 3;
      sample.f.rod(
        V(Math.cos(a) * 0.19, -0.22, Math.sin(a) * 0.19),
        V(Math.cos(a) * 0.32, -0.52, Math.sin(a) * 0.32),
        0.05,
        this.grey
      );
      sample.f.rod(
        V(Math.cos(a) * 0.32, -0.52, Math.sin(a) * 0.32),
        V(Math.cos(a) * 0.1, -0.73, Math.sin(a) * 0.1),
        0.033,
        this.ceramic
      );
    }
    sample.f.finish();
  }
  setXray(enabled: boolean) {
    for (const mesh of this.shells)
      mesh.material = enabled ? this.glass : this.ceramic;
    this.tentacles.setXray(enabled);
  }
  update(
    time: number,
    pose: OctopusPose,
    separation: number,
    view: OctopusView
  ) {
    for (const part of this.parts) {
      part.group.visible = view !== 'arm';
      part.group.position.copy(part.offset).multiplyScalar(separation);
    }
    this.tentacles.update(time, pose, separation, view);
    this.root.rotation.set(
      view === 'arm' ? 0 : 0.08,
      view === 'arm' ? 0 : 0.1,
      view === 'arm'
        ? -0.25
        : -0.22 + Math.sin(time * 0.35) * 0.018 * (1 - separation)
    );
    this.root.position.y =
      view === 'arm' ? 0 : Math.sin(time * 0.5) * 0.085 * (1 - separation);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.tentacles.dispose();
    this.root.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.LineSegments)
        o.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.ramp.dispose();
    this.root.clear();
  }
}
