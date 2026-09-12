import * as THREE from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  exp,
  mix,
  positionLocal,
  sin,
  uniform,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { createFibreBlades } from '@/features/fibre-field/blades';
import { BATH } from '@/features/matter-atelier/process';
import type { FactoryFrame } from './FactoryProduction';

export const NURSERY_BEDS = [
  [-4.85, 3.9, 0.43, 1.6],
  [0.35, -1.45, 1.9, 0.36],
  [5.7, -0.4, 1.18, 0.3],
] as const;

/** One vertex-deformed fibre mesh; tool, carrier and pump share the host clock. */
export class AtelierFibres {
  readonly mesh: THREE.Mesh;
  private readonly time = uniform(0);
  private readonly brush = uniform(new THREE.Vector3());
  private readonly carrier = uniform(new THREE.Vector3());
  private readonly contact = uniform(0);
  private readonly bath = uniform(0);
  private readonly beds: THREE.InstancedMesh;
  private disposed = false;

  constructor(parent: THREE.Group) {
    const data = createFibreBlades(71, 220, {
      radius: 8,
      heightScale: 0.42,
      widthScale: 0.58,
      ground: () => 0.12,
      accept: (x, z) =>
        NURSERY_BEDS.some(
          ([cx, cz, rx, rz]) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2 < 1
        ),
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(data.positions, 3)
    );
    geometry.setAttribute('blade', new THREE.BufferAttribute(data.shapes, 4));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    const blade = attribute<'vec4'>('blade', 'vec4');
    const root = positionLocal;
    const phase = root.x
      .mul(0.65)
      .add(root.z.mul(0.38))
      .sub(this.time.mul(0.65));
    const tool = root.xz.sub(this.brush.xz);
    const carrier = root.xz.sub(this.carrier.xz);
    const bathVector = root.xz.sub(vec2(BATH.x, BATH.z));
    const distanceToBath = bathVector.length();
    const toolWake = exp(tool.dot(tool).mul(-0.65)).mul(
      this.contact.mul(0.48).add(0.12)
    );
    const carrierWake = exp(carrier.dot(carrier).mul(-0.28)).mul(0.38);
    const pump = sin(distanceToBath.mul(3).sub(this.time.mul(2)))
      .mul(this.bath)
      .mul(0.14)
      .mul(exp(distanceToBath.mul(-0.24)));
    const bend = vec2(
      sin(phase)
        .mul(0.065)
        .add(sin(phase.mul(0.47).add(1.8)).mul(0.04)),
      phase.cos().mul(0.02)
    )
      .add(tool.div(tool.length().max(0.1)).mul(toolWake))
      .add(carrier.div(carrier.length().max(0.1)).mul(carrierWake))
      .add(bathVector.div(distanceToBath.max(0.1)).mul(pump));
    const viewDelta = cameraPosition.xz.sub(root.xz);
    const facing = viewDelta.div(viewDelta.length().max(0.001));
    const height = blade.z.mul(blade.y);
    const material = new THREE.MeshBasicNodeMaterial({
      side: THREE.DoubleSide,
    });
    material.positionNode = root
      .add(vec3(facing.y, 0, facing.x.negate()).mul(blade.x).mul(blade.w))
      .add(
        vec3(
          bend.x.mul(height),
          height.div(bend.length().mul(0.7).add(1)),
          bend.y.mul(height)
        )
      );
    const tip = varying(blade.y);
    const activity = varying(toolWake.add(carrierWake).add(pump.abs()).clamp());
    const tipColor = mix(
      vec3(0.24, 0.47, 0.59),
      vec3(0.68, 0.78, 0.75),
      tip.pow(2)
    );
    material.colorNode = mix(
      mix(vec3(0.026, 0.063, 0.12), tipColor, tip.clamp().pow(0.7)),
      vec3(0.075, 0.26, 0.65),
      activity.mul(0.65).mul(tip)
    ).mul(varying(blade.z).mul(0.5).add(0.82));
    this.mesh = new THREE.Mesh(geometry, material);
    parent.add(this.mesh);
    this.beds = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 0.08, 48),
      new THREE.MeshStandardNodeMaterial({
        color: 0x526773,
        metalness: 0.4,
        roughness: 0.48,
      }),
      3
    );
    const transform = new THREE.Object3D();
    NURSERY_BEDS.forEach(([x, z, rx, rz], i) => {
      transform.position.set(x, 0.06, z);
      transform.scale.set(rx + 0.02, 1, rz + 0.02);
      transform.updateMatrix();
      this.beds.setMatrixAt(i, transform.matrix);
    });
    this.beds.receiveShadow = true;
    parent.add(this.beds);
  }

  update(time: number, frame: FactoryFrame) {
    this.time.value = time;
    this.brush.value.set(frame.pose.x, frame.pose.y, frame.pose.z);
    const p = frame.carrier.position;
    this.carrier.value.set(p.x, p.y, p.z);
    this.contact.value = frame.pose.pressure;
    this.bath.value = Math.sin(Math.PI * frame.process.spectral) ** 2;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const mesh of [this.mesh, this.beds]) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.beds.dispose();
  }
}
