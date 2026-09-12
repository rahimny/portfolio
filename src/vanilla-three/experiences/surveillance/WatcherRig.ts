import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { SurveillanceMotion } from '@/features/surveillance/motion';
import {
  advanceMechanism,
  createMechanism,
  MECHANICS,
  LEG_LAYOUT,
  GIMBAL,
} from '@/features/surveillance/mechanics';

const UP = new THREE.Vector3(0, 1, 0);

function between(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.y = a.distanceTo(b);
  mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
}

// Merge the fixed hardware per material; only the articulated pieces remain separate.
function batch(group: THREE.Group) {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.updateMatrixWorld(true);
  for (const child of [...group.children]) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material))
      continue;
    child.updateMatrix();
    const geometry = (
      child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone()
    ).applyMatrix4(child.matrix);
    const bucket = buckets.get(child.material) ?? [];
    bucket.push(geometry);
    buckets.set(child.material, bucket);
    child.geometry.dispose();
    group.remove(child);
  }
  for (const [material, geometries] of buckets) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

interface LegView {
  upper: THREE.Mesh;
  lower: THREE.Mesh;
  distal: THREE.Mesh;
  distalSleeve: THREE.Mesh;
  distalPiston: THREE.Mesh;
  armour: THREE.Mesh;
  piston: THREE.Mesh;
  sleeve: THREE.Mesh;
  tip: THREE.Mesh;
  knee: THREE.Mesh;
  hock: THREE.Mesh;
  hip: THREE.Mesh;
  ankle: THREE.Mesh;
  pad: THREE.Mesh;
  mounts: THREE.Mesh[];
  lattice: THREE.Group;
  distalLattice: THREE.Group;
}

export class WatcherRig {
  readonly group = new THREE.Group();
  readonly body = new THREE.Group();
  readonly eye = new THREE.Group();
  readonly cables = new THREE.Group();
  readonly mechanism = createMechanism();
  readonly yawMount = new THREE.Group();
  private readonly legs: LegView[] = [];
  private readonly vents: { pivot: THREE.Group; side: number }[] = [];
  private readonly neckActuators: {
    sleeve: THREE.Mesh;
    rod: THREE.Mesh;
    side: number;
  }[] = [];
  private readonly metal = new THREE.MeshStandardMaterial({
    color: '#e9e9d9',
    roughness: 0.54,
    metalness: 0.12,
  });
  private readonly edge = new THREE.MeshStandardMaterial({
    color: '#9daea3',
    roughness: 0.38,
    metalness: 0.62,
  });
  private readonly black = new THREE.MeshStandardMaterial({
    color: '#102326',
    roughness: 0.73,
    metalness: 0.5,
  });
  private readonly glass = new THREE.MeshPhysicalMaterial({
    color: '#071b20',
    roughness: 0.09,
    metalness: 0.9,
    clearcoat: 1,
  });
  private readonly orange = new THREE.MeshStandardMaterial({
    color: '#e74722',
    roughness: 0.52,
    metalness: 0.15,
  });
  private readonly ink = new THREE.LineBasicMaterial({
    color: '#193537',
    transparent: true,
    opacity: 0.55,
  });
  private readonly signal = new THREE.MeshBasicMaterial({ color: '#ff5638' });

  constructor() {
    const surface = document.createElement('canvas');
    surface.width = surface.height = 512;
    const ink = surface.getContext('2d')!;
    ink.fillStyle = '#efeee5';
    ink.fillRect(0, 0, 512, 512);
    let seed = 87;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 9000; i++) {
      ink.fillStyle = `rgba(30,22,18,${random() * 0.06})`;
      ink.fillRect(random() * 512, random() * 512, 1 + random() * 3, 1);
    }
    for (let i = 0; i < 65; i++) {
      const x = random() * 512;
      const y = random() * 512;
      ink.strokeStyle = i % 3 ? '#b9beb4' : '#fffef1';
      ink.lineWidth = random() * 0.8 + 0.3;
      ink.beginPath();
      ink.moveTo(x, y);
      ink.lineTo(x + random() * 28 - 14, y + random() * 60);
      ink.stroke();
    }
    const texture = new THREE.CanvasTexture(surface);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.metal.map = texture;
    this.metal.bumpMap = texture;
    this.metal.bumpScale = 0.005;
    const box = (
      parent: THREE.Group,
      size: number[],
      position: number[],
      material: THREE.Material = this.metal
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size[0], size[1], size[2]),
        material
      );
      mesh.position.set(position[0], position[1], position[2]);
      parent.add(mesh);
      return mesh;
    };
    const cylinder = (
      parent: THREE.Group,
      radius: number,
      length: number,
      position: number[],
      material: THREE.Material = this.black
    ) => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, length, 24),
        material
      );
      mesh.position.set(position[0], position[1], position[2]);
      parent.add(mesh);
      return mesh;
    };
    this.group.add(this.body);
    this.body.add(this.yawMount, this.cables);
    this.yawMount.position.copy(MECHANICS.headPivot);
    this.yawMount.add(this.eye);

    const outline = new THREE.Shape();
    outline.moveTo(-0.6, -0.94);
    outline.lineTo(0.6, -0.94);
    outline.lineTo(0.83, -0.6);
    outline.lineTo(0.76, 0.78);
    outline.lineTo(0.48, 1.02);
    outline.lineTo(-0.48, 1.02);
    outline.lineTo(-0.76, 0.78);
    outline.lineTo(-0.83, -0.6);
    outline.closePath();
    const aperture = new THREE.Path();
    aperture.moveTo(-0.59, -0.71);
    aperture.lineTo(-0.59, 0.68);
    aperture.lineTo(0.59, 0.68);
    aperture.lineTo(0.59, -0.71);
    aperture.closePath();
    outline.holes.push(aperture);
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: 0.44,
      bevelEnabled: true,
      bevelThickness: 0.065,
      bevelSize: 0.06,
      bevelSegments: 1,
      steps: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    const shell = new THREE.Mesh(geometry, this.black);
    this.body.add(shell);
    box(this.body, [1.42, 0.2, 1.55], [0, -0.17, 0.03], this.black);
    box(this.body, [1.48, 0.035, 1.6], [0, -0.29, 0], this.edge);
    for (let i = 0; i < 9; i++)
      box(
        this.body,
        [0.075, 0.19, 0.035],
        [(i - 4) * 0.115, 0.21, 1.012],
        this.edge
      );

    // Plates follow the chassis, with clear service seams and recessed fastening points.
    for (let row = 0; row < 4; row++) {
      for (const column of [-1, 1]) {
        const x = column * 0.5;
        const z = (row - 1.5) * 0.41;
        box(this.body, [0.48, 0.055 + (row % 2) * 0.018, 0.35], [x, 0.51, z]);
        for (const sx of [-1, 1]) {
          const screw = cylinder(
            this.body,
            0.022,
            0.018,
            [x + sx * 0.165, 0.55, z + 0.125],
            this.edge
          );
          screw.rotation.y = row * 0.4;
        }
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i < 11; i++) {
        box(
          this.body,
          [0.045, 0.23, 0.036],
          [side * 0.855, 0.17, -0.47 + i * 0.105],
          this.black
        );
        box(
          this.body,
          [0.055, 0.027, 0.07],
          [side * 0.87, 0.015, -0.47 + i * 0.105],
          this.edge
        );
      }
      box(this.body, [0.1, 0.18, 0.67], [side * 0.73, -0.36, -0.25]);
      for (let i = 0; i < 4; i++)
        cylinder(
          this.body,
          0.037,
          0.08,
          [side * 0.69, 0.59, -0.52 + i * 0.36],
          this.black
        );
    }
    // Exposed optical power spine inside the ceramic armour rails.
    const core = cylinder(this.body, 0.17, 1.37, [0, 0.22, 0], this.black);
    core.rotation.x = Math.PI / 2;
    for (let i = 0; i < 17; i++) {
      const ring = cylinder(
        this.body,
        i % 4 === 0 ? 0.205 : 0.19,
        i % 4 === 0 ? 0.05 : 0.018,
        [0, 0.22, -0.65 + i * 0.08],
        i % 4 === 0 ? this.orange : this.edge
      );
      ring.rotation.x = Math.PI / 2;
    }
    for (const side of [-1, 1]) {
      for (const z of [-0.48, 0, 0.48]) {
        const pivot = new THREE.Group();
        pivot.position.set(side * 0.89, 0.38, z);
        box(pivot, [0.05, 0.29, 0.4], [side * 0.025, -0.145, 0]);
        for (let j = 0; j < 4; j++)
          box(
            pivot,
            [0.008, 0.024, 0.22],
            [side * 0.056, -0.08 - j * 0.046, 0],
            this.black
          );
        batch(pivot);
        this.body.add(pivot);
        this.vents.push({ pivot, side });
      }
      box(this.body, [0.055, 0.05, 1.4], [side * 0.29, 0.51, 0], this.edge);
      box(this.body, [0.04, 0.04, 0.52], [side * 0.76, -0.04, 0], this.orange);
    }
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 512;
    labelCanvas.height = 128;
    const labelInk = labelCanvas.getContext('2d')!;
    labelInk.fillStyle = '#e9e9d9';
    labelInk.fillRect(0, 0, 512, 128);
    labelInk.fillStyle = '#183638';
    labelInk.font = 'bold 40px monospace';
    labelInk.fillText('SV—01 / OPTICS', 16, 50);
    labelInk.font = '20px monospace';
    labelInk.fillText('AUTONOMOUS OBSERVER', 16, 82);
    for (let i = 0; i < 46; i++)
      labelInk.fillRect(16 + i * 10, 96, i % 3 === 0 ? 5 : 2, 18);
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    const marking = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.155),
      new THREE.MeshBasicMaterial({ map: labelTexture })
    );
    marking.rotation.x = -Math.PI / 2;
    marking.rotation.z = Math.PI / 2;
    marking.position.set(0.5, 0.585, -0.12);
    this.body.add(marking);
    // A raised CCTV pedestal keeps the entire tilted enclosure above the chassis.
    box(this.body, [0.76, 0.12, 0.68], [0, 0.57, 0.45], this.black);
    cylinder(this.body, 0.3, 0.13, [0, 0.66, 0.45], this.edge);
    cylinder(this.body, 0.27, 0.055, [0, 0.74, 0.45], this.orange);
    cylinder(
      this.yawMount,
      0.24,
      0.1,
      [0, GIMBAL.rotorBottom + 0.05 - MECHANICS.headPivot.y, 0],
      this.black
    );
    box(this.yawMount, [1.5, 0.14, 0.27], [0, GIMBAL.bridgeY, 0], this.edge);
    for (const side of [-1, 1]) {
      box(
        this.yawMount,
        [0.14, 0.74, 0.26],
        [side * (GIMBAL.forkInnerX + 0.07), -0.35, 0]
      );
      const trunnion = cylinder(
        this.yawMount,
        0.145,
        0.27,
        [side * 0.66, 0, 0],
        this.black
      );
      trunnion.rotation.z = Math.PI / 2;
      const cap = cylinder(
        this.yawMount,
        0.1,
        0.025,
        [side * 0.82, 0, 0],
        this.edge
      );
      cap.rotation.z = Math.PI / 2;
      for (const layout of LEG_LAYOUT) {
        box(
          this.body,
          [0.28, 0.24, 0.3],
          [side * (layout.hipX - 0.06), -0.26, layout.hipZ]
        );
      }
      const sleeve = cylinder(this.body, 0.05, 1, [0, 0, 0]);
      const rod = cylinder(this.body, 0.019, 1, [0, 0, 0], this.edge);
      // These are updated each frame, so keep them outside the fixed hardware batch.
      this.body.remove(sleeve, rod);
      this.neckActuators.push({ sleeve, rod, side });
    }
    // CCTV enclosure: a long extrusion, inset glazing and a separate folded weather hood.
    const enclosure = new THREE.Shape();
    enclosure.moveTo(-0.43, -0.35);
    enclosure.lineTo(0.43, -0.35);
    enclosure.lineTo(0.5, -0.28);
    enclosure.lineTo(0.5, 0.29);
    enclosure.lineTo(0.43, 0.36);
    enclosure.lineTo(-0.43, 0.36);
    enclosure.lineTo(-0.5, 0.29);
    enclosure.lineTo(-0.5, -0.28);
    enclosure.closePath();
    const enclosureGeometry = new THREE.ExtrudeGeometry(enclosure, {
      depth: 1.22,
      bevelEnabled: true,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      bevelSegments: 2,
      steps: 1,
    });
    enclosureGeometry.translate(0, 0, -0.34);
    this.eye.add(new THREE.Mesh(enclosureGeometry, this.metal));
    const hood = new THREE.Shape();
    const hoodSection = [
      [-0.62, -0.17],
      [-0.62, 0.37],
      [-0.53, 0.5],
      [0.53, 0.5],
      [0.62, 0.37],
      [0.62, -0.17],
      [0.572, -0.17],
      [0.572, 0.352],
      [0.505, 0.452],
      [-0.505, 0.452],
      [-0.572, 0.352],
      [-0.572, -0.17],
    ];
    hoodSection.forEach(([x, y], i) =>
      i ? hood.lineTo(x, y) : hood.moveTo(x, y)
    );
    hood.closePath();
    const hoodGeometry = new THREE.ExtrudeGeometry(hood, {
      depth: 1.66,
      bevelEnabled: false,
      steps: 1,
    });
    hoodGeometry.translate(0, 0, -0.42);
    this.eye.add(new THREE.Mesh(hoodGeometry, this.metal));
    // The dark underside carries the overhang's shadow even under the scene's fill light.
    box(this.eye, [1.0, 0.015, 1.56], [0, 0.444, 0.41], this.black);
    box(this.eye, [0.9, 0.62, 0.025], [0, 0, 0.915], this.black);
    box(this.eye, [0.79, 0.5, 0.012], [0, -0.015, 0.933], this.glass);
    box(this.eye, [0.62, 0.032, 0.032], [0, 0.207, 0.962], this.edge);
    box(this.eye, [0.54, 0.021, 0.028], [0, 0.181, 0.982], this.black);
    // A small flush optic replaces the projecting photographic lens barrel.
    for (const [radius, z, material] of [
      [0.176, 0.949, this.edge],
      [0.155, 0.964, this.black],
    ] as const) {
      const ring = cylinder(this.eye, radius, 0.024, [0, -0.035, z], material);
      ring.rotation.x = Math.PI / 2;
    }
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.128, 28, 16),
      this.glass
    );
    lens.position.set(0, -0.035, 0.981);
    lens.scale.z = 0.16;
    this.eye.add(lens);
    const iris = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.005, 6, 32),
      this.edge
    );
    iris.position.set(0, -0.035, 1.003);
    this.eye.add(iris);
    const pupil = new THREE.Mesh(
      new THREE.CircleGeometry(0.063, 24),
      this.black
    );
    pupil.position.set(0, -0.035, 1.005);
    this.eye.add(pupil);
    const led = cylinder(
      this.eye,
      0.018,
      0.012,
      [0.29, -0.19, 0.951],
      this.signal
    );
    led.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      box(this.eye, [0.1, 0.12, 0.15], [side * 0.38, -0.4, -0.12], this.black);
      // Sliding sunshield rail, enclosure seam and captive service fasteners.
      box(
        this.eye,
        [0.025, 0.035, 1.02],
        [side * 0.518, -0.18, 0.18],
        this.edge
      );
      box(
        this.eye,
        [0.027, 0.017, 1.07],
        [side * 0.519, -0.26, 0.2],
        this.black
      );
      for (const z of [-0.2, 0.69]) {
        const bolt = cylinder(
          this.eye,
          0.03,
          0.016,
          [side * 0.53, -0.2, z],
          this.black
        );
        bolt.rotation.z = Math.PI / 2;
      }
      box(this.eye, [0.025, 0.09, 0.2], [side * 0.53, 0.09, -0.05], this.edge);
    }
    box(this.eye, [0.68, 0.45, 0.03], [0, 0, -0.378], this.black);
    for (let i = 0; i < 7; i++)
      box(
        this.eye,
        [0.53, 0.023, 0.035],
        [0, -0.15 + i * 0.05, -0.399],
        this.edge
      );
    for (const x of [-0.403, 0.403])
      for (const y of [-0.255, 0.255]) {
        const bolt = cylinder(this.eye, 0.019, 0.012, [x, y, 0.935], this.edge);
        bolt.rotation.x = Math.PI / 2;
      }

    for (let i = 0; i < 24; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (0.12 + ((i * 17) % 11) * 0.025);
      const z = -0.65 + ((i * 7) % 17) * 0.084;
      const length = 0.32 + ((i * 13) % 19) * 0.055;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, -0.34, z),
        new THREE.Vector3(x + side * 0.16, -0.42, z + 0.09),
        new THREE.Vector3(x + side * 0.12, -length, z - 0.03),
        new THREE.Vector3(x + side * 0.12, -length - 0.13, z + 0.11),
      ]);
      this.cables.add(
        new THREE.Mesh(
          new THREE.TubeGeometry(curve, 14, i % 5 ? 0.009 : 0.016, 5, false),
          i % 4 ? this.black : this.edge
        )
      );
    }
    for (const parent of [this.body, this.eye, this.yawMount]) {
      for (const child of [...parent.children]) {
        if (!(child instanceof THREE.Mesh) || child.material !== this.metal)
          continue;
        const lines = new THREE.LineSegments(
          new THREE.EdgesGeometry(child.geometry, 32),
          this.ink
        );
        lines.position.copy(child.position);
        lines.quaternion.copy(child.quaternion);
        lines.scale.copy(child.scale);
        parent.add(lines);
      }
    }
    batch(this.body);
    batch(this.eye);
    batch(this.yawMount);
    for (const actuator of this.neckActuators)
      this.yawMount.add(actuator.sleeve, actuator.rod);
    batch(this.cables);

    for (let i = 0; i < this.mechanism.legs.length; i++) {
      const segment = (top: number, bottom: number, material = this.metal) => {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(top, bottom, 1, 6),
          material
        );
        mesh.castShadow = true;
        this.group.add(mesh);
        return mesh;
      };
      const joint = (radius: number, length = 0.2) => {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, length, 16),
          this.black
        );
        mesh.castShadow = true;
        this.group.add(mesh);
        return mesh;
      };
      const lattice = new THREE.Group();
      const rod = (
        a: THREE.Vector3,
        b: THREE.Vector3,
        radius: number,
        material: THREE.Material
      ) => {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 1, 5),
          material
        );
        between(mesh, a, b);
        lattice.add(mesh);
      };
      for (let bay = 0; bay <= 12; bay++) {
        const y = -0.48 + bay * 0.08;
        const end = bay === 0 || bay === 12;
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.075, end ? 0.015 : 0.006, 5, 6),
          end ? this.orange : this.metal
        );
        ring.position.y = y;
        ring.rotation.x = Math.PI / 2;
        lattice.add(ring);
        if (bay < 12)
          for (let rib = 0; rib < 6; rib++) {
            const angle = (rib * Math.PI) / 3;
            const next = angle + ((bay % 2 ? -1 : 1) * Math.PI) / 3;
            rod(
              new THREE.Vector3(
                Math.cos(angle) * 0.075,
                y,
                Math.sin(angle) * 0.075
              ),
              new THREE.Vector3(
                Math.cos(next) * 0.075,
                y + 0.08,
                Math.sin(next) * 0.075
              ),
              0.005,
              this.edge
            );
          }
      }
      batch(lattice);
      const distalLattice = lattice.clone(true);
      this.group.add(lattice, distalLattice);
      const pad = cylinder(this.group, 0.075, 0.04, [0, 0, 0], this.black);
      this.legs.push({
        upper: segment(0.075, 0.062),
        lower: segment(0.045, 0.03, this.black),
        distal: segment(0.03, 0.016, this.black),
        distalSleeve: segment(0.036, 0.036, this.black),
        distalPiston: segment(0.014, 0.014, this.edge),
        armour: segment(0.12, 0.09),
        piston: segment(0.021, 0.021, this.edge),
        sleeve: segment(0.052, 0.052, this.black),
        tip: segment(0.036, 0.012, this.black),
        knee: joint(0.135, 0.3),
        hock: joint(0.105, 0.23),
        lattice,
        distalLattice,
        hip: joint(0.17, 0.22),
        ankle: joint(0.066, 0.13),
        pad,
        mounts: [joint(0.06, 0.11), joint(0.05, 0.11)],
      });
    }
    this.pose();
  }

  update(
    state: SurveillanceMotion,
    target: THREE.Vector3,
    dt: number,
    moving: boolean,
    discrete = false,
    travelTarget?: THREE.Vector3
  ) {
    advanceMechanism(
      this.mechanism,
      target,
      moving ? dt : 0,
      state.startled,
      discrete,
      travelTarget
    );
    this.pose();
  }

  private pose() {
    const state = this.mechanism;
    this.body.position.copy(state.position);
    this.body.quaternion.copy(state.rotation);
    this.yawMount.rotation.y = state.headYaw.position;
    this.eye.rotation.set(state.headPitch.position, 0, 0);
    // Cable lag is tied to the turn servo, with a bounded envelope inside the leg roots.
    this.cables.rotation.z = -state.yaw.velocity * 0.04;
    for (const vent of this.vents)
      vent.pivot.rotation.z =
        vent.side *
        (0.07 +
          Math.abs(state.yaw.velocity) * 0.5 +
          state.recoil.position * 0.18);
    this.body.updateWorldMatrix(true, true);
    for (const actuator of this.neckActuators) {
      const a = new THREE.Vector3(actuator.side * 0.38, -0.64, -0.36);
      const b = this.eye.localToWorld(
        new THREE.Vector3(actuator.side * 0.38, -0.46, -0.12)
      );
      this.yawMount.worldToLocal(b);
      const length = a.distanceTo(b);
      const join = a.clone().lerp(b, Math.min(0.5 / length, 0.72));
      between(actuator.sleeve, a, join);
      between(actuator.rod, join, b);
    }
    for (let i = 0; i < this.legs.length; i++) {
      const view = this.legs[i];
      const leg = state.legs[i];
      const { hip, knee, hock, ankle, foot } = leg;
      const hinge = new THREE.Vector3()
        .crossVectors(knee.clone().sub(hip), hock.clone().sub(knee))
        .normalize();
      between(view.upper, hip, knee);
      between(
        view.armour,
        hip.clone().lerp(knee, 0.17),
        hip.clone().lerp(knee, 0.73)
      );
      between(view.lower, knee, hock);
      between(view.distal, hock, ankle);
      view.lattice.position.copy(view.lower.position);
      view.lattice.quaternion.copy(view.lower.quaternion);
      view.lattice.scale.set(1, MECHANICS.shinLength * 0.8, 1);
      view.distalLattice.position.copy(view.distal.position);
      view.distalLattice.quaternion.copy(view.distal.quaternion);
      view.distalLattice.scale.set(
        0.72,
        MECHANICS.metatarsusLength * 0.8,
        0.72
      );
      const hockAxis = new THREE.Vector3()
        .crossVectors(hock.clone().sub(knee), ankle.clone().sub(hock))
        .normalize();
      view.hock.position.copy(hock);
      view.hock.quaternion.setFromUnitVectors(UP, hockAxis);
      const distalOffset = hockAxis.clone().multiplyScalar(0.14);
      const distalA = knee.clone().lerp(hock, 0.58).add(distalOffset);
      const distalB = hock.clone().lerp(ankle, 0.42).add(distalOffset);
      const distalJoin = distalA.clone().lerp(distalB, 0.54);
      between(view.distalSleeve, distalA, distalJoin);
      between(view.distalPiston, distalJoin, distalB);
      between(view.tip, ankle, foot);
      const offset = hinge.clone().multiplyScalar(0.22);
      const a = hip.clone().lerp(knee, 0.48).add(offset);
      const b = knee.clone().lerp(hock, 0.46).add(offset);
      const join = a.clone().lerp(b, 0.58 / a.distanceTo(b));
      between(view.sleeve, a, join);
      between(view.piston, join, b);
      for (const [mesh, position] of [
        [view.hip, hip],
        [view.knee, knee],
        [view.ankle, ankle],
        [view.mounts[0], a],
        [view.mounts[1], b],
      ] as const) {
        mesh.position.copy(position);
        mesh.quaternion.setFromUnitVectors(UP, hinge);
      }
      view.pad.position.copy(foot);
    }
  }
}
