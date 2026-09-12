import * as T from 'three';
import { BellMechanism } from './BellMechanism';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  hexCell,
  LATTICE_COLUMNS,
  LATTICE_ROWS,
  LIMBS,
  tentaclePoint,
} from '../../../features/nereid/model';

const TAU = Math.PI * 2;
const Y = new T.Vector3(0, 1, 0);
const v = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
export interface AssemblyPart {
  group: T.Group;
  offset: T.Vector3;
  kind: 'shell' | 'crown' | 'ring' | 'core' | 'spine' | 'limb' | 'mechanism';
}

/** Static details are merged per material and moving assembly, not drawn individually. */
class Fabricator {
  private buckets = new Map<T.Material, T.BufferGeometry[]>();
  private edges: T.BufferGeometry[] = [];
  private group: T.Group;
  private line: T.LineBasicMaterial;
  constructor(group: T.Group, line: T.LineBasicMaterial) {
    this.group = group;
    this.line = line;
  }
  add(
    geometry: T.BufferGeometry,
    material: T.Material,
    position = v(),
    rotation = new T.Euler(),
    scale = v(1, 1, 1),
    outline = false
  ) {
    const matrix = new T.Matrix4().compose(
      position,
      new T.Quaternion().setFromEuler(rotation),
      scale
    );
    geometry.applyMatrix4(matrix);
    if (outline) this.edges.push(new T.EdgesGeometry(geometry, 32));
    const bucket = this.buckets.get(material) ?? [];
    bucket.push(geometry);
    this.buckets.set(material, bucket);
  }
  tube(
    points: T.Vector3[],
    radius: number,
    material: T.Material,
    segments = 40
  ) {
    this.add(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points),
        segments,
        radius,
        6,
        false
      ),
      material
    );
  }
  rod(a: T.Vector3, b: T.Vector3, radius: number, material: T.Material) {
    const geometry = new T.CylinderGeometry(radius, radius, a.distanceTo(b), 6);
    geometry.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize())
    );
    this.add(geometry, material, a.clone().add(b).multiplyScalar(0.5));
  }
  ring(
    radius: number,
    tube: number,
    y: number,
    material: T.Material,
    x = 0,
    z = 0
  ) {
    this.add(
      new T.TorusGeometry(radius, tube, 6, 96),
      material,
      v(x, y, z),
      new T.Euler(Math.PI / 2, 0, 0)
    );
  }
  cylinder(
    radius: number,
    height: number,
    y: number,
    material: T.Material,
    x = 0,
    z = 0,
    segments = 48
  ) {
    this.add(
      new T.CylinderGeometry(radius, radius, height, segments),
      material,
      v(x, y, z),
      undefined,
      undefined,
      true
    );
  }
  box(
    w: number,
    h: number,
    d: number,
    position: T.Vector3,
    material: T.Material,
    angle = 0
  ) {
    this.add(
      new T.BoxGeometry(w, h, d),
      material,
      position,
      new T.Euler(0, angle, 0),
      undefined,
      true
    );
  }
  finish() {
    for (const [material, geometries] of this.buckets) {
      const merged = mergeGeometries(geometries);
      if (merged) this.group.add(new T.Mesh(merged, material));
      for (const geometry of geometries) geometry.dispose();
    }
    if (this.edges.length) {
      const merged = mergeGeometries(this.edges);
      if (merged) this.group.add(new T.LineSegments(merged, this.line));
      for (const geometry of this.edges) geometry.dispose();
    }
  }
}

export class NereidAssembly {
  readonly root = new T.Group();
  readonly parts: AssemblyPart[] = [];
  readonly textures: T.Texture[] = [];
  readonly materials: T.Material[] = [];
  readonly glass: T.MeshPhysicalMaterial;
  readonly lattice: T.MeshStandardMaterial;
  private disposed = false;
  private bellMechanism?: BellMechanism;
  private white: T.MeshToonMaterial;
  private grey: T.MeshToonMaterial;
  private dark: T.MeshToonMaterial;
  private orange: T.MeshToonMaterial;
  private steel: T.MeshStandardMaterial;
  private light: T.MeshBasicMaterial;
  private ink: T.LineBasicMaterial;

  constructor(deferBuild = false) {
    const ramp = new T.DataTexture(
      new Uint8Array([95, 160, 218, 255]),
      4,
      1,
      T.RedFormat
    );
    ramp.minFilter = ramp.magFilter = T.NearestFilter;
    ramp.needsUpdate = true;
    this.textures.push(ramp);
    this.white = new T.MeshToonMaterial({
      color: '#e9e9d9',
      gradientMap: ramp,
    });
    this.grey = new T.MeshToonMaterial({ color: '#8d9d98', gradientMap: ramp });
    this.dark = new T.MeshToonMaterial({ color: '#283f43', gradientMap: ramp });
    this.orange = new T.MeshToonMaterial({
      color: '#e34725',
      gradientMap: ramp,
    });
    this.steel = new T.MeshStandardMaterial({
      color: '#b0b8ad',
      metalness: 0.55,
      roughness: 0.32,
    });
    this.lattice = new T.MeshStandardMaterial({
      color: '#bdc8b9',
      metalness: 0.3,
      roughness: 0.45,
    });
    this.light = new T.MeshBasicMaterial({ color: '#efffea' });
    this.ink = new T.LineBasicMaterial({
      color: '#233b3c',
      transparent: true,
      opacity: 0.7,
    });
    this.glass = new T.MeshPhysicalMaterial({
      color: '#b4d0c7',
      transparent: true,
      opacity: 0.14,
      roughness: 0.25,
      metalness: 0.05,
      side: T.DoubleSide,
      depthWrite: false,
    });
    this.materials.push(
      this.white,
      this.grey,
      this.dark,
      this.orange,
      this.steel,
      this.lattice,
      this.light,
      this.ink,
      this.glass
    );
    if (!deferBuild) for (const build of this.buildSteps()) build();
  }

  /** Same geometry as the study, with a cancellable yield between assemblies. */
  static async create(signal?: AbortSignal): Promise<NereidAssembly> {
    signal?.throwIfAborted();
    const assembly = new NereidAssembly(true);
    try {
      for (const build of assembly.buildSteps()) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        build();
      }
      return assembly;
    } catch (error) {
      assembly.dispose();
      throw error;
    }
  }

  private *buildSteps() {
    yield () => this.buildBell();
    yield () => this.buildCrown();
    yield () => this.buildRing();
    yield () => this.buildCore();
    yield () => this.buildSpine();
    for (let i = 0; i < LIMBS; i++) yield () => this.buildLimb(i);
  }

  private part(kind: AssemblyPart['kind'], offset: T.Vector3) {
    const group = new T.Group();
    group.name = kind;
    this.root.add(group);
    this.parts.push({ group, kind, offset });
    return { group, f: new Fabricator(group, this.ink) };
  }

  private bolts(f: Fabricator, radius: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const x = Math.cos(a) * radius;
      const z = Math.sin(a) * radius;
      f.cylinder(0.035, 0.03, y, this.dark, x, z, 6);
      f.box(0.027, 0.004, 0.007, v(x, y + 0.017, z), this.steel, a);
    }
  }

  private marking(
    group: T.Group,
    text: string,
    position: T.Vector3,
    angle: number,
    width = 0.45
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e9e9d9';
    ctx.fillRect(0, 0, 384, 128);
    ctx.fillStyle = '#253b3e';
    ctx.font = 'bold 56px monospace';
    ctx.fillText(text, 12, 59);
    for (let i = 0; i < 37; i++)
      ctx.fillRect(14 + i * 7, 78, i % 3 === 0 ? 4 : 2, 28);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const material = new T.MeshBasicMaterial({
      map: texture,
      side: T.DoubleSide,
    });
    this.textures.push(texture);
    this.materials.push(material);
    const mesh = new T.Mesh(new T.PlaneGeometry(width, width / 3), material);
    mesh.position.copy(position);
    mesh.rotation.set(-Math.PI / 2, 0, angle);
    // Markings share assembly-space coordinates with the shell they deform on.
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    group.add(mesh);
  }

  private buildBell() {
    const skin = this.part('shell', v(0, 3.2, 0));
    const dome = new T.SphereGeometry(2.3, 72, 24, 0, TAU, 0, Math.PI / 2);
    skin.f.add(dome, this.glass, v(0, 1.12, 0), undefined, v(1, 0.65, 1));
    // A finer cage remains visible through the translucent inter-petal windows.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      skin.f.tube(
        Array.from({ length: 22 }, (_, j) => {
          const t = ((j / 21) * Math.PI) / 2;
          return v(
            Math.sin(t) * Math.cos(a) * 2.29,
            1.12 + Math.cos(t) * 1.49,
            Math.sin(t) * Math.sin(a) * 2.29
          );
        }),
        0.009,
        this.grey,
        24
      );
    }
    for (const t of [0.34, 0.63, 0.9, 1.15, 1.4])
      skin.f.ring(
        Math.sin(t) * 2.3,
        0.008,
        1.12 + Math.cos(t) * 1.49,
        this.grey
      );
    skin.f.ring(2.3, 0.035, 1.12, this.dark);
    skin.f.finish();
    this.bellMechanism = new BellMechanism(
      {
        white: this.white,
        grey: this.grey,
        dark: this.dark,
        orange: this.orange,
        steel: this.steel,
      },
      (kind, offset) => this.part(kind, offset).group
    );
  }

  private buildCrown() {
    const { f, group } = this.part('crown', v(0, 1.25, 0));
    f.cylinder(0.45, 0.1, 2.68, this.dark);
    f.cylinder(0.34, 0.09, 2.76, this.white);
    f.ring(0.29, 0.025, 2.82, this.orange);
    f.add(
      new T.SphereGeometry(0.25, 24, 16, 0, TAU, 0, Math.PI / 2),
      this.dark,
      v(0, 2.82, 0),
      undefined,
      v(1, 0.6, 1)
    );
    this.bolts(f, 0.4, 2.75, 12);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      const x = Math.cos(a) * 0.8,
        z = Math.sin(a) * 0.8;
      f.cylinder(0.16, 0.3, 2.04, this.grey, x, z);
      for (let j = 0; j < 5; j++)
        f.ring(0.17, 0.016, 1.94 + j * 0.055, this.dark, x, z);
      f.cylinder(0.11, 0.09, 2.24, this.orange, x, z);
      f.tube(
        [v(x, 1.92, z), v(x * 0.9, 2.45, z * 0.9), v(0, 2.6, 0)],
        0.027,
        this.steel,
        16
      );
    }
    f.cylinder(1.05, 0.055, 1.88, this.dark);
    f.ring(1.02, 0.025, 1.92, this.white);
    this.bolts(f, 0.94, 1.94, 24);
    f.finish();
    this.marking(group, 'SONAR / 06', v(0, 1.92, 0.65), 0, 0.42);
  }

  private buildRing() {
    const { f, group } = this.part('ring', v(0, 0.2, 0));
    for (const y of [0.89, 1.04, 1.19]) {
      f.ring(2.2, 0.054, y, y === 1.04 ? this.orange : this.dark);
      f.ring(1.93, 0.034, y, this.steel);
    }
    f.add(
      new T.CylinderGeometry(2.24, 2.18, 0.09, 96, 1, true),
      this.white,
      v(0, 1.1, 0),
      undefined,
      undefined,
      true
    );
    this.bolts(f, 2.15, 1.19, 80);
    for (let i = 0; i < 48; i++) {
      const a = (i * TAU) / 48;
      const r = 2.09;
      f.box(
        0.055,
        0.14,
        0.21,
        v(Math.cos(a) * r, 1.01, Math.sin(a) * r),
        i % 6 === 0 ? this.orange : this.grey,
        -a
      );
    }
    for (let i = 0; i < LIMBS; i++) {
      const a = (i * TAU) / LIMBS;
      const x = Math.cos(a),
        z = Math.sin(a);
      f.rod(
        v(x * 0.65, 1.1, z * 0.65),
        v(x * 1.92, 1.1, z * 1.92),
        0.05,
        this.dark
      );
      f.rod(
        v(x * 0.7, 0.88, z * 0.7),
        v(x * 1.87, 0.88, z * 1.87),
        0.022,
        this.orange
      );
      f.cylinder(0.23, 0.31, 0.88, this.dark, x * 2.02, z * 2.02);
      f.ring(0.22, 0.03, 0.74, this.white, x * 2.02, z * 2.02);
      f.box(
        0.26,
        0.19,
        0.54,
        v(x * 1.63, 1.3, z * 1.63),
        this.white,
        -a + Math.PI / 2
      );
      for (let j = 0; j < 7; j++)
        f.box(
          0.27,
          0.018,
          0.02,
          v(x * (1.47 + j * 0.05), 1.403, z * (1.47 + j * 0.05)),
          this.dark,
          -a + Math.PI / 2
        );
      this.marking(group, `T${i + 1}`, v(x * 2.02, 1.25, z * 2.02), -a, 0.22);
    }
    f.finish();
  }

  private buildCore() {
    const { f } = this.part('core', v(0, -0.65, 0));
    f.cylinder(0.68, 0.12, 1.12, this.white);
    f.cylinder(0.64, 0.1, 1.58, this.grey);
    f.add(
      new T.SphereGeometry(0.55, 32, 24),
      this.orange,
      v(0, 1.38, 0),
      undefined,
      v(1, 0.8, 1)
    );
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      const x = Math.cos(a),
        z = Math.sin(a);
      f.add(
        new T.SphereGeometry(0.31, 24, 16),
        this.grey,
        v(x * 1.26, 1.49, z * 1.26)
      );
      f.ring(0.305, 0.022, 1.49, this.dark, x * 1.26, z * 1.26);
      f.cylinder(0.1, 0.12, 1.83, this.dark, x * 1.26, z * 1.26);
      f.tube(
        [
          v(x * 1.26, 1.86, z * 1.26),
          v(x, 1.97, z),
          v(x * 0.58, 1.6, z * 0.58),
        ],
        0.023,
        this.orange,
        16
      );
      f.rod(
        v(x * 0.58, 1.14, z * 0.58),
        v(x * 0.58, 1.72, z * 0.58),
        0.03,
        this.steel
      );
    }
    f.finish();
  }

  private buildSpine() {
    const { f, group } = this.part('spine', v(0, -2, 0));
    f.cylinder(0.57, 0.24, 0.56, this.dark);
    f.cylinder(0.44, 1.5, -0.25, this.grey);
    f.cylinder(0.28, 1.1, -1.5, this.dark);
    for (let i = 0; i < 17; i++)
      f.ring(
        0.46,
        0.027,
        0.38 - i * 0.077,
        i % 4 === 0 ? this.white : this.dark
      );
    for (let i = 0; i < 9; i++)
      f.ring(0.32, 0.023, -1.08 - i * 0.108, this.steel);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      const x = Math.cos(a),
        z = Math.sin(a);
      const armour = this.part('spine', v(x * 0.85, -2, z * 0.85));
      armour.f.box(
        0.2,
        0.72,
        0.13,
        v(x * 0.47, -0.1, z * 0.47),
        i % 3 === 0 ? this.orange : this.white,
        -a + Math.PI / 2
      );
      for (const y of [-0.4, 0.2])
        armour.f.add(
          new T.SphereGeometry(0.025, 8, 6),
          this.dark,
          v(x * 0.56, y, z * 0.56)
        );
      armour.f.finish();
      for (let chip = 0; chip < 5; chip++) {
        f.box(
          0.13,
          0.055,
          0.03,
          v(x * 0.47, -0.34 + chip * 0.11, z * 0.47),
          this.dark,
          -a + Math.PI / 2
        );
      }
      f.rod(
        v(x * 0.58, 0.38, z * 0.58),
        v(x * 0.58, -0.7, z * 0.58),
        0.025,
        this.steel
      );
      f.tube(
        [
          v(x * 0.4, 0.58, z * 0.4),
          v(x * 0.72, 0.15, z * 0.72),
          v(x * 0.6, -0.6, z * 0.6),
          v(x * 0.2, -1.2, z * 0.2),
        ],
        0.025,
        this.dark,
        26
      );
      // Sampling finger: paired links, exposed piston and a ceramic claw.
      f.rod(
        v(x * 0.29, -1.65, z * 0.29),
        v(x * 0.77, -2.12, z * 0.77),
        0.054,
        this.grey
      );
      f.rod(
        v(x * 0.77, -2.12, z * 0.77),
        v(x * 0.49, -2.7, z * 0.49),
        0.037,
        this.white
      );
      f.add(
        new T.SphereGeometry(0.09, 12, 8),
        this.dark,
        v(x * 0.77, -2.12, z * 0.77)
      );
      f.rod(
        v(x * 0.4, -1.74, z * 0.4),
        v(x * 0.62, -2.13, z * 0.62),
        0.022,
        this.orange
      );
      f.rod(
        v(x * 0.49, -2.7, z * 0.49),
        v(x * 0.28, -2.84, z * 0.28),
        0.016,
        this.dark
      );
    }
    f.add(
      new T.CylinderGeometry(0.26, 0.06, 0.62, 24),
      this.white,
      v(0, -2.22, 0),
      undefined,
      undefined,
      true
    );
    f.add(new T.SphereGeometry(0.065, 16, 12), this.orange, v(0, -2.58, 0));
    // Large forward optical stack makes the machine read as a character.
    for (const [r, d, z] of [
      [0.28, 0.16, 0.5],
      [0.23, 0.12, 0.64],
      [0.175, 0.06, 0.73],
    ] as const) {
      f.add(
        new T.CylinderGeometry(r, r, d, 40),
        r > 0.25 ? this.white : this.dark,
        v(0, 0.13, z),
        new T.Euler(Math.PI / 2, 0, 0),
        undefined,
        true
      );
    }
    f.add(
      new T.SphereGeometry(0.14, 24, 16),
      this.orange,
      v(0, 0.13, 0.77),
      undefined,
      v(1, 1, 0.25)
    );
    f.add(
      new T.SphereGeometry(0.035, 12, 8),
      this.light,
      v(-0.035, 0.17, 0.81)
    );
    f.finish();
    this.marking(group, 'R / 07', v(0.23, 0.7, 0.15), 0, 0.25);
  }

  private buildLimb(index: number) {
    const angle = (index * TAU) / LIMBS;
    const { f, group } = this.part(
      'limb',
      v(Math.cos(angle) * 1.4, -0.3, Math.sin(angle) * 1.4)
    );
    const curve = new T.CatmullRomCurve3(
      Array.from(
        { length: 65 },
        (_, i) => new T.Vector3(...tentaclePoint(i / 64, index))
      )
    );
    const frames = curve.computeFrenetFrames(180, false);
    const point = (u: number, t: number, radiusMultiplier = 1) => {
      const ti = Math.max(0, Math.min(1, t));
      const frame = Math.min(180, Math.round(ti * 180));
      const radius = 0.225 * (1 - ti * 0.76) * radiusMultiplier;
      return curve
        .getPoint(ti)
        .addScaledVector(frames.normals[frame], Math.cos(u * TAU) * radius)
        .addScaledVector(frames.binormals[frame], Math.sin(u * TAU) * radius);
    };
    f.add(new T.TubeGeometry(curve, 100, 0.055, 8, false), this.dark);
    for (let cable = 0; cable < 3; cable++) {
      f.tube(
        Array.from({ length: 100 }, (_, j) =>
          point(cable / 3 + (j / 100) * 1.3, j / 99, 0.43)
        ),
        0.018,
        cable === 0 ? this.orange : this.steel,
        100
      );
    }
    const transforms: T.Matrix4[] = [];
    const rod = new T.Object3D();
    for (let row = 0; row < LATTICE_ROWS; row++) {
      for (let col = 0; col < LATTICE_COLUMNS; col++) {
        const hex = hexCell(row, col);
        // Three owned edges per interior cell avoid coincident struts.
        for (let side = 0; side < 6; side++) {
          if (row > 0 && side > 2) continue;
          const a = point(...hex[side]);
          const b = point(...hex[(side + 1) % 6]);
          rod.position.copy(a).add(b).multiplyScalar(0.5);
          rod.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
          rod.scale.set(
            0.013 * (1 - (row / LATTICE_ROWS) * 0.4),
            a.distanceTo(b),
            0.013 * (1 - (row / LATTICE_ROWS) * 0.4)
          );
          rod.updateMatrix();
          transforms.push(rod.matrix.clone());
        }
      }
    }
    const mesh = new T.InstancedMesh(
      new T.CylinderGeometry(1, 1, 1, 5),
      this.lattice,
      transforms.length
    );
    transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    for (let j = 0; j < 13; j++) {
      const t = j / 13;
      const radius = 0.24 * (1 - t * 0.76);
      const orientation = new T.Quaternion().setFromUnitVectors(
        Y,
        curve.getTangent(t)
      );
      const geometry = new T.CylinderGeometry(
        radius,
        radius,
        j === 0 ? 0.2 : 0.05,
        12,
        1,
        true
      );
      geometry.applyQuaternion(orientation);
      f.add(
        geometry,
        j % 4 === 0 ? this.orange : this.white,
        curve.getPoint(t),
        undefined,
        undefined,
        true
      );
      if (j % 3 === 0) {
        const p = point(0, t, 1.06);
        f.add(new T.SphereGeometry(0.035, 8, 6), this.dark, p);
      }
    }
    const end = curve.getPoint(1);
    const tip = new T.CylinderGeometry(0.062, 0.005, 0.38, 8);
    tip.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(Y, curve.getTangent(1).negate())
    );
    f.add(tip, this.dark, end, undefined, undefined, true);
    f.finish();
  }

  apply(
    separation: number,
    latticeView: boolean,
    lean: number,
    bell: number,
    margin: number,
    stroke: number,
    distance: number
  ) {
    this.bellMechanism?.update(bell, margin, stroke, separation, distance);
    const weight = 1 - Math.min(1, separation * 2);
    for (let i = 0; i < this.parts.length; i++) {
      const part = this.parts[i];
      part.group.position.copy(part.offset).multiplyScalar(separation);
      part.group.visible =
        !latticeView || (part.kind === 'limb' && i === this.parts.length - 2);
    }
    this.root.position.y = 0;
    this.root.rotation.set(
      0,
      0,
      latticeView ? 0 : -0.12 + (-0.35 + lean) * weight
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.traverse((object) => {
      if (object instanceof T.Mesh || object instanceof T.LineSegments)
        object.geometry.dispose();
      if (object instanceof T.InstancedMesh) object.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.root.clear();
  }
}
