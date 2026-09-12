import * as THREE from 'three/webgpu';
import {
  Break,
  Fn,
  If,
  Loop,
  cameraFar,
  cameraNear,
  cameraPosition,
  float,
  max,
  min,
  mix,
  modelViewMatrix,
  modelWorldMatrixInverse,
  positionGeometry,
  reflect,
  smoothstep,
  uniform,
  uniformArray,
  varying,
  vec3,
  vec4,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { BATH_LEVEL } from '@/features/matter-atelier/bath';
import { sampleFusion } from '@/features/matter-atelier/fusion';
import {
  BATH,
  OBJECT_SCALE,
  type ProcessState,
} from '@/features/matter-atelier/process';
import type { Point, PrintJob } from '@/features/matter-atelier/types';
import {
  foldedField,
  matterPalette,
  worldIndex,
  type AtelierWorld,
} from './treatmentNodes';

const LOBES = 5;
const BRIDGES = 3;
const MAX_STEPS = 48;
const TAU = Math.PI * 2;
const smoothUnion = Fn(
  ([a, b, width]: [
    THREE.Node<'float'>,
    THREE.Node<'float'>,
    THREE.Node<'float'>,
  ]) => {
    const h = float(0.5).add(b.sub(a).mul(0.5).div(width)).clamp();
    return mix(b, a, h).sub(width.mul(h).mul(h.oneMinus()));
  }
);

/** A local opaque implicit surface, not a screen overlay or fluid solver.
 * Only the reservoir proxy runs the bounded march. Its hit writes real depth,
 * so the specimen, cradle and other machines correctly occlude the liquid. */
export class FusionCore {
  readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicNodeMaterial>;
  private readonly lobesData = Array.from(
    { length: LOBES },
    () => new THREE.Vector4()
  );
  private readonly rootsData = Array.from(
    { length: BRIDGES },
    () => new THREE.Vector4()
  );
  private readonly tipsData = Array.from(
    { length: BRIDGES },
    () => new THREE.Vector4()
  );
  private readonly lobes = uniformArray<'vec4'>(this.lobesData, 'vec4');
  private readonly roots = uniformArray<'vec4'>(this.rootsData, 'vec4');
  private readonly tips = uniformArray<'vec4'>(this.tipsData, 'vec4');
  private readonly union = uniform(0.3);
  private readonly phase = uniform(0);
  private readonly world = uniform(0);
  private readonly presence = uniform(0);
  private readonly anchors: Point[] = Array.from({ length: BRIDGES }, () => ({
    x: 0,
    y: 1,
    z: 0,
  }));
  private job?: PrintJob;
  private disposed = false;

  constructor(parent: THREE.Object3D) {
    const field = Fn(([point]: [THREE.Node<'vec3'>]) => {
      const distance = max(
        point.xz.length().sub(1.24),
        point.y.add(0.11).abs().sub(0.055)
      ).toVar();
      for (let i = 0; i < LOBES; i++) {
        const lobe = this.lobes.element(i);
        const sphere = point.sub(lobe.xyz).length().sub(lobe.w);
        distance.assign(smoothUnion(distance, sphere, this.union));
      }
      for (let i = 0; i < BRIDGES; i++) {
        const root = this.roots.element(i);
        If(root.w.greaterThan(0.003), () => {
          const tip = this.tips.element(i);
          const axis = tip.xyz.sub(root.xyz);
          const fromRoot = point.sub(root.xyz);
          const h = fromRoot.dot(axis).div(axis.dot(axis).max(0.0001)).clamp();
          const capsule = fromRoot.sub(axis.mul(h)).length().sub(root.w);
          distance.assign(smoothUnion(distance, capsule, this.union.mul(0.42)));
        });
      }
      // The meniscus terminates inside the real reactor rim and below its waterline.
      return max(
        distance,
        max(point.xz.length().sub(1.54), point.y.negate().sub(0.018))
      );
    });
    const origin = varying(
      modelWorldMatrixInverse.mul(vec4(cameraPosition, 1)).xyz
    );
    const direction = varying(positionGeometry.sub(origin)).normalize();
    const hit = Fn(() => {
      this.presence.lessThan(0.0001).discard();
      const inverse = direction.reciprocal();
      const near = vec3(-1.6, -0.2, -1.6).sub(origin).mul(inverse);
      const far = vec3(1.6, 2.2, 1.6).sub(origin).mul(inverse);
      const entry = min(near, far);
      const exit = max(near, far);
      const travel = max(max(entry.x, max(entry.y, entry.z)), 0).toVar();
      const limit = min(exit.x, min(exit.y, exit.z));
      const surface = vec4(0).toVar();
      Loop(MAX_STEPS, () => {
        If(travel.greaterThan(limit), () => {
          Break();
        });
        const point = origin.add(direction.mul(travel)).toVar();
        const distance = field(point).toVar();
        If(distance.lessThan(0.003), () => {
          surface.assign(vec4(point, 1));
          Break();
        });
        travel.addAssign(distance.mul(0.82).max(0.002));
      });
      surface.w.lessThan(0.5).discard();
      return surface.xyz;
    })().toVar('fusionSurface');
    const normal = Fn(() => {
      const e = 0.002;
      const a = vec3(e, -e, -e),
        b = vec3(-e, -e, e),
        c = vec3(-e, e, -e),
        d = vec3(e, e, e);
      return a
        .mul(field(hit.add(a)))
        .add(b.mul(field(hit.add(b))))
        .add(c.mul(field(hit.add(c))))
        .add(d.mul(field(hit.add(d))))
        .normalize();
    })().toVar('fusionNormal');
    const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
    material.depthNode = viewZToPerspectiveDepth(
      modelViewMatrix.mul(vec4(hit, 1)).z,
      cameraNear,
      cameraFar
    );
    material.fragmentNode = Fn(() => {
      const view = direction.negate();
      const reflection = reflect(direction, normal);
      const key = vec3(-0.45, 0.82, 0.38).normalize();
      const fill = vec3(0.65, 0.4, -0.6).normalize();
      const fresnel = normal.dot(view).max(0).oneMinus().pow(4);
      const folds = foldedField(
        hit.mul(1.9).add(vec3(0, this.phase.mul(0.075), 0))
      );
      const flow = hit.y
        .mul(0.46)
        .add(folds.mul(0.23))
        .add(this.phase.mul(0.025));
      const pigment = matterPalette(flow, this.world);
      const base = pigment.mul(
        normal
          .dot(key)
          .max(0)
          .mul(0.7)
          .add(normal.dot(fill).max(0).mul(0.23))
          .add(0.2)
      );
      // Broad analytic softboxes make the coalescing silhouette readable without
      // extra reflection, refraction or shadow rays.
      const strip = smoothstep(0.87, 0.98, reflection.y).mul(1.1);
      const highlight = normal.dot(key.add(view).normalize()).max(0).pow(64);
      const rim = reflection.dot(fill).max(0).pow(18);
      const result = base
        .add(vec3(0.9, 0.98, 1).mul(strip.add(highlight.mul(1.65))))
        .add(pigment.mul(fresnel.mul(0.48).add(rim.mul(0.6))))
        .add(pigment.mul(this.presence).mul(0.07));
      return vec4(result, 1);
    })();
    const geometry = new THREE.BoxGeometry(3.2, 2.4, 3.2);
    geometry.translate(0, 1, 0);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'Coalescing matter';
    this.mesh.position.set(BATH.x, BATH_LEVEL, BATH.z);
    this.mesh.userData.movable = true;
    this.mesh.userData.maxMarchSteps = MAX_STEPS;
    // Keep the empty proxy available to the host's initial compileAsync(). The
    // first process update then removes it from every inactive render entirely.
    this.mesh.visible = true;
    parent.add(this.mesh);
  }

  setJob(job: PrintJob) {
    if (job === this.job) return;
    this.job = job;
    // Anchor on the actual inherited lower contour, including uploaded specimens.
    const contour =
      job.contours[
        Math.min(job.contours.length - 1, Math.floor(job.contours.length * 0.2))
      ];
    if (!contour?.length) return;
    for (let i = 0; i < BRIDGES; i++) {
      const point = contour[Math.floor((i / BRIDGES) * (contour.length - 1))];
      Object.assign(this.anchors[i], point);
    }
  }

  update(
    time: number,
    process: ProcessState,
    seed: number,
    softness: number,
    world: AtelierWorld
  ) {
    if (this.disposed) return;
    const state = sampleFusion(process.spectral, softness);
    this.mesh.visible = process.stage === 'spectral' && state.active;
    if (!this.mesh.visible) return;
    this.phase.value = process.spectral * 14 + seed * 0.37;
    this.world.value = worldIndex(world);
    this.union.value = state.union;
    this.presence.value = state.presence;
    for (let i = 0; i < LOBES; i++) {
      const angle = (i / LOBES) * TAU + seed * 0.37 + process.spectral * 0.38;
      const radius =
        state.radius * (1 + 0.07 * Math.sin(time * 0.24 + i * 2.1));
      this.lobesData[i].set(
        Math.cos(angle) * state.spread,
        0.02 +
          state.merge * 0.2 -
          state.drainage * 0.32 +
          Math.sin(angle * 2) * state.presence * 0.055,
        Math.sin(angle) * state.spread,
        radius
      );
    }
    for (let i = 0; i < BRIDGES; i++) {
      const lobe = this.lobesData[Math.floor((i / BRIDGES) * LOBES)];
      const anchor = this.anchors[i];
      const contact = Math.min(1, state.presence * 1.4);
      const tipY = Math.max(
        0.02,
        anchor.y * OBJECT_SCALE + process.object.y - BATH_LEVEL
      );
      this.rootsData[i].set(
        lobe.x,
        Math.min(0.16, lobe.y),
        lobe.z,
        state.bridgeRadius
      );
      this.tipsData[i].set(
        anchor.x * OBJECT_SCALE,
        0.07 + (tipY - 0.07) * contact * (1 - state.drainage),
        anchor.z * OBJECT_SCALE,
        0
      );
    }
    this.mesh.userData.fusionStage = state.stage;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
