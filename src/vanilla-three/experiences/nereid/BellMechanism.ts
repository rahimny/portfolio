import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssemblyPart } from './NereidAssembly';

const COUNT = 12;
const TAU = Math.PI * 2;
const UP = new T.Vector3(0, 1, 0);
const STARTS = [0.22, 0.66, 1.12];
const ENDS = [0.77, 1.23, 1.56];
const RADII = [2.44, 2.48, 2.52];
type Materials = Record<
  'white' | 'grey' | 'dark' | 'orange' | 'steel',
  T.Material
>;
type Register = (kind: AssemblyPart['kind'], offset: T.Vector3) => T.Group;

function surface(theta: number, phi: number, radius: number) {
  return new T.Vector3(
    Math.cos(phi) * Math.sin(theta) * radius,
    1.12 + Math.cos(theta) * 1.62,
    Math.sin(phi) * Math.sin(theta) * radius
  );
}

// Closed, thick panels with faceted bevel strips. Coordinates are relative to
// the upper hinge, so an entire plate can articulate without bending its skin.
function plate(tier: number, backing = false) {
  const radius = RADII[tier] - (backing ? 0.04 : 0);
  const width = backing ? 0.395 : 0.36;
  const pivot = surface(STARTS[tier], 0, RADII[tier]);
  const positions: number[] = [],
    indices: number[] = [];
  const cols = 6,
    rows = 7;
  for (let side = 0; side < 2; side++)
    for (let row = 0; row <= rows; row++)
      for (let col = 0; col <= cols; col++) {
        const t = row / rows;
        const edge = row === 0 || row === rows || col === 0 || col === cols;
        const r = radius - side * 0.055 - (edge && !backing ? 0.015 : 0);
        const p = surface(
          STARTS[tier] + t * (ENDS[tier] - STARTS[tier]),
          (col / cols - 0.5) * width * (0.9 + 0.1 * Math.sin(t * Math.PI)),
          r
        ).sub(pivot);
        positions.push(p.x, p.y, p.z);
      }
  const stride = cols + 1,
    layer = stride * (rows + 1);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const a = row * stride + col,
        b = a + 1,
        c = a + stride,
        d = c + 1;
      indices.push(
        a,
        b,
        c,
        b,
        d,
        c,
        a + layer,
        c + layer,
        b + layer,
        b + layer,
        c + layer,
        d + layer
      );
    }
  const boundary = [
    ...Array.from({ length: cols + 1 }, (_, i) => i),
    ...Array.from({ length: rows }, (_, i) => (i + 1) * stride + cols),
    ...Array.from({ length: cols }, (_, i) => rows * stride + cols - 1 - i),
    ...Array.from({ length: rows - 1 }, (_, i) => (rows - 1 - i) * stride),
  ];
  for (let i = 0; i < boundary.length; i++) {
    const a = boundary[i],
      b = boundary[(i + 1) % boundary.length];
    indices.push(a, b, a + layer, b, b + layer, a + layer);
  }
  const geometry = new T.BufferGeometry()
    .setAttribute('position', new T.Float32BufferAttribute(positions, 3))
    .setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function rails(tier: number) {
  const parts: T.BufferGeometry[] = [];
  const pivot = surface(STARTS[tier], 0, RADII[tier]);
  for (const phi of [-0.16, 0.16]) {
    const points = Array.from({ length: 12 }, (_, j) =>
      surface(
        STARTS[tier] + ((ENDS[tier] - STARTS[tier]) * j) / 11,
        phi,
        RADII[tier] + 0.009
      ).sub(pivot)
    );
    parts.push(
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 12, 0.012, 5, false)
    );
  }
  for (const theta of [STARTS[tier] + 0.07, ENDS[tier] - 0.06])
    for (const phi of [-0.12, 0.12]) {
      const g = new T.IcosahedronGeometry(0.024, 0);
      g.translate(
        ...surface(theta, phi, RADII[tier] + 0.028)
          .sub(pivot)
          .toArray()
      );
      parts.push(g);
    }
  // Recessed vent bars interrupt the broad ceramic surface.
  for (let i = 0; i < (tier === 1 ? 5 : 2); i++) {
    const theta = STARTS[tier] + 0.15 + i * 0.045;
    const p = surface(theta, 0, RADII[tier] + 0.008).sub(pivot);
    const g = new T.BoxGeometry(0.027, 0.018, tier === 2 ? 0.23 : 0.16);
    g.rotateZ(-theta);
    g.translate(p.x, p.y, p.z);
    parts.push(g);
  }
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const geometry = mergeGeometries(flat);
  new Set([...parts, ...flat]).forEach((g) => g.dispose());
  if (!geometry) throw new Error('Unable to assemble bell panel rails');
  return geometry;
}

/** Rigid overlapping armour and linkages, driven by the existing bell command. */
export class BellMechanism {
  private panels: T.InstancedMesh[][] = [];
  private barrels: T.InstancedMesh;
  private rods: T.InstancedMesh;
  private collars: T.InstancedMesh;
  private pivots: T.InstancedMesh;
  private shutters: T.InstancedMesh;
  private rotors: T.Group[] = [];
  private object = new T.Object3D();
  private a = new T.Vector3();
  private b = new T.Vector3();
  private direction = new T.Vector3();
  private base = new T.Vector3();
  private end = new T.Vector3();
  private actuatorAxis = new T.Vector3();
  private radialRotation = new T.Quaternion();
  private hingeRotation = new T.Quaternion();
  private zAxis = new T.Vector3(0, 0, 1);
  private dynamic: T.InstancedMesh[] = [];

  constructor(materials: Materials, register: Register) {
    const instances = (
      group: T.Group,
      geometry: T.BufferGeometry,
      material: T.Material,
      count: number
    ) => {
      const mesh = new T.InstancedMesh(geometry, material, count);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.userData.nereidRigid = true;
      this.dynamic.push(mesh);
      group.add(mesh);
      return mesh;
    };
    for (let tier = 0; tier < 3; tier++) {
      const group = register('shell', new T.Vector3(0, 4.2 - tier * 0.65, 0));
      const skin = instances(group, plate(tier), materials.white, COUNT);
      for (let i = 0; i < COUNT; i++)
        skin.setColorAt(
          i,
          new T.Color(
            i === 2 || i === 8 ? '#ed572e' : tier === 1 ? '#cbd5cf' : '#ffffff'
          )
        );
      this.panels.push([
        skin,
        instances(group, plate(tier, true), materials.dark, COUNT),
        instances(group, rails(tier), materials.steel, COUNT),
      ]);
    }
    const frame = register('mechanism', new T.Vector3(0, 1.5, 0));
    this.barrels = instances(
      frame,
      new T.CylinderGeometry(0.088, 0.088, 1, 10),
      materials.dark,
      COUNT
    );
    this.rods = instances(
      frame,
      new T.CylinderGeometry(0.039, 0.039, 1, 8),
      materials.steel,
      COUNT
    );
    this.collars = instances(
      frame,
      new T.CylinderGeometry(0.104, 0.104, 0.055, 12),
      materials.orange,
      COUNT * 2
    );
    this.pivots = instances(
      frame,
      new T.SphereGeometry(0.096, 10, 6),
      materials.steel,
      COUNT * 2
    );
    const vents = register('mechanism', new T.Vector3(0, 0.75, 0));
    const shutter = new T.BoxGeometry(0.07, 0.32, 0.2);
    shutter.translate(0, -0.16, 0);
    this.shutters = instances(vents, shutter, materials.grey, COUNT * 2);
    for (let layer = 0; layer < 2; layer++) {
      const mount = register(
        'mechanism',
        new T.Vector3(0, 2.0 + layer * 0.65, 0)
      );
      const rotor = new T.Group();
      rotor.position.y = 2.45 - layer * 0.25;
      mount.add(rotor);
      this.rotors.push(rotor);
      const radius = 1.12 + layer * 0.26;
      const race = new T.TorusGeometry(radius, 0.065, 8, 80);
      race.rotateX(Math.PI / 2);
      rotor.add(
        new T.Mesh(race, layer === 0 ? materials.steel : materials.dark)
      );
      const teeth = new T.InstancedMesh(
        new T.BoxGeometry(0.09, 0.075, 0.07),
        layer === 0 ? materials.dark : materials.orange,
        60
      );
      for (let i = 0; i < 60; i++) {
        const angle = (i * TAU) / 60;
        this.object.position.set(
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius
        );
        this.object.rotation.set(0, -angle, 0);
        this.object.scale.setScalar(1);
        this.object.updateMatrix();
        teeth.setMatrixAt(i, this.object.matrix);
      }
      rotor.add(teeth);
      const spokes: T.BufferGeometry[] = [];
      for (let i = 0; i < 12; i++) {
        const g = new T.BoxGeometry(0.38, 0.035, 0.075);
        g.translate(radius - 0.2, 0, 0);
        g.rotateY((i * TAU) / 12);
        spokes.push(g);
      }
      rotor.add(new T.Mesh(mergeGeometries(spokes)!, materials.steel));
      spokes.forEach((g) => g.dispose());
    }
    this.barrels.name = 'bell-actuator-barrels';
    this.rods.name = 'bell-actuator-rods';
    this.pivots.name = 'bell-actuator-pivots';
    this.shutters.name = 'bell-rim-shutters';
    this.update(0, 0, 0.28, 0, 0);
  }

  private point(
    radius: number,
    y: number,
    angle: number,
    bell: number,
    margin: number,
    stroke: number,
    out: T.Vector3
  ) {
    const edge = T.MathUtils.clamp((2.72 - y) / 1.5, 0, 1);
    const r =
      radius *
      (1 - stroke * (0.72 * bell * edge ** 2 + 0.28 * margin * edge ** 4));
    return out.set(
      Math.cos(angle) * r,
      y + stroke * 1.6 * margin * edge ** 3,
      Math.sin(angle) * r
    );
  }

  private cylinder(
    mesh: T.InstancedMesh,
    index: number,
    a: T.Vector3,
    b: T.Vector3
  ) {
    this.direction.subVectors(b, a);
    this.object.position.copy(a).add(b).multiplyScalar(0.5);
    const length = this.direction.length();
    this.object.quaternion.setFromUnitVectors(UP, this.direction.normalize());
    this.object.scale.set(1, length, 1);
    this.object.updateMatrix();
    mesh.setMatrixAt(index, this.object.matrix);
  }

  update(
    bell: number,
    margin: number,
    stroke: number,
    separation: number,
    distance: number
  ) {
    const weight = 1 - T.MathUtils.smoothstep(separation, 0, 0.5);
    const drive = stroke * weight;
    for (let tier = 0; tier < 3; tier++) {
      const start = STARTS[tier];
      const radius = Math.sin(start) * RADII[tier];
      const y = 1.12 + Math.cos(start) * 1.62;
      for (let i = 0; i < COUNT; i++) {
        const angle = (i * TAU) / COUNT;
        this.point(radius, y, angle, bell, margin, drive, this.object.position);
        this.object.position.x +=
          Math.cos(angle) * separation * (0.7 + tier * 0.25);
        this.object.position.z +=
          Math.sin(angle) * separation * (0.7 + tier * 0.25);
        this.radialRotation.setFromAxisAngle(UP, -angle);
        this.hingeRotation.setFromAxisAngle(
          this.zAxis,
          -drive * (bell * 0.7 + margin * 0.3) * [0.45, 1.0, 1.45][tier]
        );
        this.object.quaternion
          .copy(this.radialRotation)
          .multiply(this.hingeRotation);
        this.object.scale.setScalar(1);
        this.object.updateMatrix();
        for (const mesh of this.panels[tier])
          mesh.setMatrixAt(i, this.object.matrix);
      }
    }
    for (let i = 0; i < COUNT; i++) {
      const angle = ((i + 0.5) * TAU) / COUNT;
      this.base.set(Math.cos(angle) * 1.05, 2.57, Math.sin(angle) * 1.05);
      this.point(2.32, 1.36, angle, bell, margin, drive, this.end);
      this.actuatorAxis.subVectors(this.end, this.base).normalize();
      this.a.copy(this.base);
      this.b.copy(this.base).addScaledVector(this.actuatorAxis, 0.78);
      this.cylinder(this.barrels, i, this.a, this.b);
      this.a.copy(this.base).addScaledVector(this.actuatorAxis, 0.65);
      this.cylinder(this.rods, i, this.a, this.end);
      for (let j = 0; j < 2; j++) {
        this.object.position
          .copy(this.base)
          .addScaledVector(this.actuatorAxis, j === 0 ? 0.08 : 0.73);
        this.object.scale.setScalar(1);
        this.object.updateMatrix();
        this.collars.setMatrixAt(i * 2 + j, this.object.matrix);
        this.object.position.copy(j === 0 ? this.base : this.end);
        this.object.updateMatrix();
        this.pivots.setMatrixAt(i * 2 + j, this.object.matrix);
      }
    }

    for (let i = 0; i < COUNT * 2; i++) {
      const angle = ((i + 0.5) * TAU) / (COUNT * 2);
      this.point(2.29, 1.35, angle, bell, margin, drive, this.object.position);
      this.radialRotation.setFromAxisAngle(UP, -angle);
      this.hingeRotation.setFromAxisAngle(
        this.zAxis,
        drive * (0.12 + Math.max(0, margin - bell) * 5.5)
      );
      this.object.quaternion
        .copy(this.radialRotation)
        .multiply(this.hingeRotation);
      this.object.scale.setScalar(1);
      this.object.updateMatrix();
      this.shutters.setMatrixAt(i, this.object.matrix);
    }
    this.rotors[0].rotation.y = distance * 0.3 + bell * 0.16;
    this.rotors[1].rotation.y = -distance * 0.23 - margin * 0.14;
    for (const mesh of this.dynamic) mesh.instanceMatrix.needsUpdate = true;
  }
}
