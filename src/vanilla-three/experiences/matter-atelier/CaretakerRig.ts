import * as THREE from 'three/webgpu';
import { CARE_TIMING } from '@/features/matter-atelier/care';
import type {
  LivingColony,
  LivingState,
} from '@/features/matter-atelier/living';
import { clamp } from '@/features/matter-atelier/process';
import { NURSERY_BEDS } from './AtelierFibres';

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const STATIONS = NURSERY_BEDS.map(([x, z], bed) => {
  const outwardX = bed === 0 ? -1 : 0;
  const outwardZ = bed === 0 ? 0 : bed === 1 ? -1 : 1;
  return {
    x: x + outwardX * 0.69,
    z: z + outwardZ * 0.67,
    dx: -outwardX,
    dz: -outwardZ,
  };
});

/** Three local metering heads share eight instanced batches. Their clock and
 * resource receipts belong to the nursery model; there is no private animation
 * loop, spring history or speculative acknowledgement to diverge on replay. */
export class CaretakerRig {
  readonly group = new THREE.Group();
  private readonly shell: THREE.InstancedMesh;
  private readonly metal: THREE.InstancedMesh;
  private readonly joints: THREE.InstancedMesh;
  private readonly visors: THREE.InstancedMesh;
  private readonly accents: THREE.InstancedMesh;
  private readonly fluid: THREE.InstancedMesh;
  private readonly receivers: THREE.InstancedMesh;
  private readonly signals: THREE.InstancedMesh;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly batches: THREE.InstancedMesh[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly eyeDirection = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly headRotation = new THREE.Quaternion();
  private disposed = false;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'Nursery metering heads';
    this.group.userData.movable = true;
    parent.add(this.group);
    const sphere = new THREE.SphereGeometry(1, 16, 12);
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
    const ring = new THREE.TorusGeometry(0.109, 0.012, 6, 24);
    this.geometries.add(sphere);
    this.geometries.add(cylinder);
    this.geometries.add(ring);
    const pearl = new THREE.MeshPhysicalNodeMaterial({
      color: 0xe6eeeb,
      metalness: 0.12,
      roughness: 0.29,
      clearcoat: 0.7,
      clearcoatRoughness: 0.3,
    });
    const chrome = new THREE.MeshStandardNodeMaterial({
      color: 0xaabac0,
      metalness: 0.9,
      roughness: 0.22,
    });
    const graphite = new THREE.MeshStandardNodeMaterial({
      color: 0x263a45,
      metalness: 0.52,
      roughness: 0.3,
    });
    const glass = new THREE.MeshPhysicalNodeMaterial({
      color: 0x183443,
      metalness: 0.42,
      roughness: 0.14,
      clearcoat: 1,
    });
    const warm = new THREE.MeshStandardNodeMaterial({
      color: 0xd98354,
      metalness: 0.28,
      roughness: 0.35,
    });
    const water = new THREE.MeshBasicNodeMaterial({
      color: 0x88cbdf,
      transparent: true,
      opacity: 0.82,
    });
    const diode = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
    for (const material of [pearl, chrome, graphite, glass, warm, water, diode])
      this.materials.add(material);
    this.shell = this.batch(sphere, pearl, 21);
    this.metal = this.batch(cylinder, chrome, 18);
    this.joints = this.batch(cylinder, graphite, 12);
    this.visors = this.batch(sphere, glass, 3);
    this.accents = this.batch(sphere, warm, 6);
    this.fluid = this.batch(cylinder, water, 3);
    this.receivers = this.batch(ring, chrome, 3);
    this.signals = this.batch(sphere, diode, 3);
    for (let bed = 0; bed < 3; bed++) this.updateStation(bed, 0);
    this.flush();
  }

  update(time: number, state: LivingState) {
    if (this.disposed) return;
    for (let bed = 0; bed < 3; bed++) {
      let occupant: LivingColony | undefined;
      for (const colony of state.colonies)
        if (((colony.id % 3) + 3) % 3 === bed) occupant = colony;
      this.updateStation(bed, time, occupant);
    }
    this.flush();
  }

  private batch(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number
  ) {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    this.batches.push(mesh);
    this.group.add(mesh);
    return mesh;
  }

  private put(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rotation?: THREE.Quaternion
  ) {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.set(sx, sy, sz);
    if (rotation) this.dummy.quaternion.copy(rotation);
    else this.dummy.quaternion.identity();
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private link(
    mesh: THREE.InstancedMesh,
    index: number,
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    sphere = false
  ) {
    this.direction.subVectors(b, a);
    const length = Math.max(0.0001, this.direction.length());
    this.direction.divideScalar(length);
    this.dummy.quaternion.setFromUnitVectors(UP, this.direction);
    this.dummy.position.copy(a).add(b).multiplyScalar(0.5);
    this.dummy.scale.set(
      radius,
      sphere ? length * 0.5 + radius * 0.22 : length,
      radius
    );
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }

  private updateStation(bed: number, time: number, colony?: LivingColony) {
    const station = STATIONS[bed];
    const { x, z, dx, dz } = station;
    const care = colony?.care;
    const attention = care?.attention ?? 0;
    const approach = care?.approach ?? 0;
    const acknowledgement = care?.acknowledgement ?? 0;
    const growth = colony?.growth ?? 0;
    const reserve =
      care && care.reserve > 0 && (colony?.energy ?? 0) > 0
        ? 1 - care.dispensed / care.reserve
        : 0;
    const receiverX = x + dx * 0.54;
    const receiverZ = z + dz * 0.54;
    const headX = x + dx * (0.38 + approach * 0.08);
    const headZ = z + dz * (0.38 + approach * 0.08);
    const headY = 0.94 - approach * 0.1;
    this.a.set(x, 0.39, z);
    this.c.set(headX, headY, headZ);
    // Fixed link lengths keep the shell rigid. The high-elbow solution leaves
    // the receiver clear while the wrist makes its small metering approach.
    const reach = 0.38 + approach * 0.08;
    const rise = headY - this.a.y;
    const distance = Math.hypot(reach, rise);
    const upper = 0.39;
    const lower = 0.36;
    const shoulder =
      Math.atan2(rise, reach) +
      Math.acos(
        Math.max(
          -1,
          Math.min(
            1,
            (upper * upper + distance * distance - lower * lower) /
              (2 * upper * distance)
          )
        )
      );
    const elbowReach = Math.cos(shoulder) * upper;
    this.b.set(
      x + dx * elbowReach,
      this.a.y + Math.sin(shoulder) * upper,
      z + dz * elbowReach
    );
    const s = bed * 7;
    this.put(this.shell, s, x, 0.09, z, 0.23, 0.09, 0.23);
    this.put(this.shell, s + 1, x, 0.3, z, 0.135, 0.17, 0.135);
    this.link(this.shell, s + 2, this.a, this.b, 0.076, true);
    this.link(this.shell, s + 3, this.b, this.c, 0.067, true);
    // A restrained head pitch follows the growing crown, then looks down into
    // the receiver. A single small nod happens only after the dose is received.
    this.eyeDirection
      .set(
        dx,
        -0.1 - growth * 0.05 - attention * 0.17 - acknowledgement * 0.065,
        dz
      )
      .normalize();
    this.headRotation.setFromUnitVectors(Z_AXIS, this.eyeDirection);
    this.put(
      this.shell,
      s + 4,
      headX,
      headY,
      headZ,
      0.175,
      0.108,
      0.15,
      this.headRotation
    );
    this.put(
      this.shell,
      s + 5,
      receiverX,
      0.153,
      receiverZ,
      0.134,
      0.052,
      0.134
    );
    this.put(
      this.shell,
      s + 6,
      x - dz * 0.1,
      0.3,
      z + dx * 0.1,
      0.046,
      0.138,
      0.046
    );
    const m = bed * 6;
    this.put(this.metal, m, x, 0.105, z, 0.234, 0.022, 0.234);
    this.link(this.metal, m + 1, this.a, this.b, 0.032);
    this.link(this.metal, m + 2, this.b, this.c, 0.027);
    const nozzleX = headX + dx * 0.08;
    const nozzleZ = headZ + dz * 0.08;
    this.put(
      this.metal,
      m + 3,
      nozzleX,
      headY - 0.166,
      nozzleZ,
      0.017,
      0.135,
      0.017
    );
    this.headRotation.setFromUnitVectors(UP, this.eyeDirection.set(-dz, 0, dx));
    this.put(
      this.metal,
      m + 4,
      this.b.x,
      this.b.y,
      this.b.z,
      0.074,
      0.143,
      0.074,
      this.headRotation
    );
    this.put(
      this.metal,
      m + 5,
      headX,
      headY - 0.01,
      headZ,
      0.06,
      0.154,
      0.06,
      this.headRotation
    );
    const j = bed * 4;
    this.put(this.joints, j, x, 0.183, z, 0.115, 0.04, 0.115);
    this.put(
      this.joints,
      j + 1,
      this.b.x,
      this.b.y,
      this.b.z,
      0.065,
      0.157,
      0.065,
      this.headRotation
    );
    this.put(
      this.joints,
      j + 2,
      headX,
      headY - 0.01,
      headZ,
      0.051,
      0.167,
      0.051,
      this.headRotation
    );
    this.put(
      this.joints,
      j + 3,
      receiverX,
      0.205,
      receiverZ,
      0.101,
      0.014,
      0.101
    );
    this.eyeDirection
      .set(
        dx,
        -0.1 - growth * 0.05 - attention * 0.17 - acknowledgement * 0.065,
        dz
      )
      .normalize();
    this.headRotation.setFromUnitVectors(Z_AXIS, this.eyeDirection);
    this.eye.set(headX, headY, headZ).addScaledVector(this.eyeDirection, 0.145);
    this.put(
      this.visors,
      bed,
      this.eye.x,
      this.eye.y,
      this.eye.z,
      0.119,
      0.054,
      0.028,
      this.headRotation
    );
    this.eye.addScaledVector(this.eyeDirection, 0.029);
    this.put(
      this.signals,
      bed,
      this.eye.x,
      this.eye.y,
      this.eye.z,
      0.028,
      0.016,
      0.008,
      this.headRotation
    );
    this.colour.setHex(
      care?.phase === 'wait'
        ? 0xd3a36a
        : (care?.receipt ?? 0) > 0.99 && care?.active
          ? 0x9bd8bd
          : 0x7196ad
    );
    this.signals.setColorAt(bed, this.colour);
    this.put(
      this.accents,
      bed * 2,
      headX - dz * 0.16,
      headY,
      headZ + dx * 0.16,
      0.018,
      0.033,
      0.033,
      this.headRotation
    );
    this.put(
      this.accents,
      bed * 2 + 1,
      x - dz * 0.1,
      0.195 + reserve * 0.18,
      z + dx * 0.1,
      0.046,
      0.015,
      0.046
    );
    this.headRotation.setFromAxisAngle(X_AXIS, Math.PI * 0.5);
    this.put(
      this.receivers,
      bed,
      receiverX,
      0.211,
      receiverZ,
      1,
      1,
      1,
      this.headRotation
    );
    const age = time - (colony?.id ?? 0) * 30;
    const emissionAge = age - CARE_TIMING.meter;
    const headTravel = clamp(emissionAge / CARE_TIMING.flight);
    const tailTravel = clamp(
      (emissionAge - CARE_TIMING.deliveryDuration) / CARE_TIMING.flight
    );
    const nozzleY = headY - 0.235;
    const span = Math.max(0, nozzleY - 0.215);
    const top = nozzleY - span * tailTravel;
    const bottom = nozzleY - span * headTravel;
    const present =
      !!care?.requested && (care.flow > 0 || care.inTransit > 1e-8);
    this.put(
      this.fluid,
      bed,
      nozzleX,
      (top + bottom) * 0.5,
      nozzleZ,
      present ? 0.009 * Math.sqrt(Math.max(0.06, care?.flow ?? 0)) : 0,
      present ? Math.max(0.0001, top - bottom) : 0,
      present ? 0.009 * Math.sqrt(Math.max(0.06, care?.flow ?? 0)) : 0
    );
  }

  private flush() {
    for (const batch of this.batches) batch.instanceMatrix.needsUpdate = true;
    if (this.signals.instanceColor)
      this.signals.instanceColor.needsUpdate = true;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    for (const batch of this.batches) batch.dispose();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.group.clear();
    this.batches.length = 0;
    this.geometries.clear();
    this.materials.clear();
  }
}
