import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  atan,
  attribute,
  faceDirection,
  float,
  mix,
  normalGeometry,
  positionGeometry,
  sin,
  smoothstep,
  uniform,
  transformNormalToView,
  varying,
  vec3,
} from 'three/tsl';
import { skinGeometry } from './skinGeometry';
import { filamentGeometry } from './filamentGeometry';
import {
  foldedField,
  softenMatter,
  matterPalette,
  worldIndex,
  type AtelierWorld,
} from './treatmentNodes';
import {
  OBJECT_SCALE,
  type Treatment,
} from '@/features/matter-atelier/process';
import {
  BED_Y,
  type PrintJob,
  type samplePrint,
} from '@/features/matter-atelier/toolpath';
import type { sampleProcess } from '@/features/matter-atelier/process';

/** The nozzle and shader reveal share travelled distance. TSL also shares that
 * mask and the elastic contour deformation with the shadow pass. */
export class FilamentSculpture {
  private readonly uniforms = {
    distance: uniform(0),
    time: uniform(0),
    layer: uniform(0),
    coatingY: uniform(BED_Y - 1),
    beam: uniform(0),
    spectral: uniform(0),
    treatment: uniform(0),
    seed: uniform(1),
    pigment: uniform(0),
    softness: uniform(1),
    world: uniform(0),
    height: uniform(1),
  };
  readonly mesh: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshPhysicalNodeMaterial
  >;
  readonly preview: THREE.LineSegments<
    THREE.BufferGeometry,
    THREE.LineBasicNodeMaterial
  >;
  private readonly extrusionEnds?: Float64Array;
  private disposed = false;
  constructor(scene: THREE.Scene, job: PrintJob, fused = false) {
    const geometry = fused
      ? { solid: skinGeometry(job), preview: new THREE.BufferGeometry() }
      : filamentGeometry(job);
    if (!fused)
      this.extrusionEnds = Float64Array.from(
        job.moves.filter((move) => move.extrude),
        (move) => move.offset + move.length
      );
    const u = this.uniforms;
    u.height.value = job.height;
    const material = new THREE.MeshPhysicalNodeMaterial({
      color: 0xffffff,
      metalness: 0.16,
      roughness: 0.44,
      side: THREE.DoubleSide,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
      iridescence: 0.9,
      iridescenceThicknessRange: [180, 430],
    });
    const point = positionGeometry;
    const printDistance = attribute<'float'>('aPrintDistance', 'float');
    material.maskNode = printDistance.lessThanEqual(u.distance);
    const deform = (position: THREE.Node<'vec3'>) =>
      softenMatter(
        position,
        u.spectral,
        u.treatment,
        u.seed,
        u.height,
        u.softness
      );
    material.positionNode = deform(point);
    if (fused) {
      // Differentiate the deformation along the smooth surface tangent frame.
      // Evaluated at vertices, this keeps the liquid highlight continuous.
      const tangent = normalGeometry
        .cross(
          normalGeometry.y
            .abs()
            .greaterThan(0.9)
            .select(vec3(1, 0, 0), vec3(0, 1, 0))
        )
        .normalize();
      const bitangent = normalGeometry.cross(tangent).normalize();
      const origin = deform(point);
      const dx = deform(point.add(tangent.mul(0.003))).sub(origin);
      const dy = deform(point.add(bitangent.mul(0.003))).sub(origin);
      material.normalNode = varying(
        transformNormalToView(dx.cross(dy).normalize())
      )
        .normalize()
        .mul(faceDirection);
      material.clearcoatNormalNode = material.normalNode;
    }
    const age = u.time.sub(attribute<'float'>('aPrintTime', 'float')).max(0);
    const heat = age.div(-22).exp();
    const fold = sin(atan(point.z, point.x).mul(3).add(point.y.mul(2.2)))
      .mul(0.5)
      .add(0.5);
    const cold = mix(
      vec3(0.006, 0.018, 0.34),
      vec3(0.14, 0.22, 0.68),
      fold.mul(0.7)
    );
    const warm = mix(vec3(1, 0.15, 0.018), vec3(1, 0.68, 0.085), heat.pow(3));
    const coated = smoothstep(
      u.coatingY.sub(0.025),
      u.coatingY.add(0.025),
      point.y
    ).oneMinus();
    const field = foldedField(point.mul(1.6).add(u.seed.mul(0.17)));
    const phase = Fn(() => {
      const value = u.pigment
        .mul(7)
        .add(point.y.mul(0.52))
        .add(atan(point.z, point.x).mul(0.19))
        .add(field.mul(0.24))
        .toVar();
      If(u.treatment.greaterThan(0.5).and(u.treatment.lessThan(1.5)), () => {
        value.assign(
          field.mul(0.8).add(point.y.mul(0.18)).add(u.pigment.mul(7))
        );
      });
      If(u.treatment.greaterThan(1.5), () => {
        value.assign(
          value.mul(9).floor().div(9).add(point.y.mul(12).floor().mul(0.031))
        );
      });
      return value.sub(u.spectral.mul(0.27)).add(u.world.mul(0.09));
    })();
    const spectral = matterPalette(phase, u.world);
    const bands = sin(field.mul(15).add(point.y.mul(18)))
      .mul(0.35)
      .add(0.65);
    const base = mix(cold, warm, smoothstep(0.08, 0.95, heat));
    material.colorNode = mix(
      mix(base, vec3(0.025, 0.04, 0.38), coated.mul(0.35)),
      spectral.mul(bands.mul(0.35).add(0.5)),
      coated.mul(smoothstep(0, 0.55, u.spectral))
    );
    material.iridescenceNode = coated.mul(0.288);
    material.roughnessNode = mix(float(0.44), float(0.25), coated);
    material.iridescenceThicknessNode = sin(point.y.mul(3).add(point.x))
      .mul(140)
      .add(260);
    const scan = abs(point.y.sub(u.coatingY)).mul(-45).exp().mul(u.beam);
    material.emissiveNode = heat
      .pow(2)
      .mul(vec3(1.35, 0.3, 0.025))
      .add(scan.mul(vec3(0.25, 0.4, 1.2)))
      .add(
        spectral
          .mul(bands.pow(8))
          .mul(sin(u.spectral.mul(Math.PI)))
          .mul(0.22)
      );
    this.mesh = new THREE.Mesh(geometry.solid, material);
    geometry.solid.computeBoundingSphere();
    if (geometry.solid.boundingSphere)
      geometry.solid.boundingSphere.radius *= 1.18;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    const preview = new THREE.LineBasicNodeMaterial({
      color: 0x718ded,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    if (!fused) {
      const previewLayer = attribute<'float'>('aLayer', 'float');
      preview.maskNode = attribute<'float'>('aDistance', 'float')
        .greaterThan(u.distance)
        .and(previewLayer.lessThanEqual(u.layer.add(2)))
        .and(previewLayer.greaterThanEqual(u.layer));
    }
    this.preview = new THREE.LineSegments(geometry.preview, preview);
    scene.add(this.mesh, this.preview);
  }
  setSoftness(value: number) {
    this.uniforms.softness.value = Math.max(0, Math.min(1, value));
  }
  setWorld(world: AtelierWorld) {
    this.uniforms.world.value = worldIndex(world);
  }
  public update(
    print: ReturnType<typeof samplePrint>,
    process: ReturnType<typeof sampleProcess>,
    time: number,
    treatment: Treatment = 'prismatic',
    seed = 1,
    pigment = 0
  ) {
    for (const object of [this.mesh, this.preview]) {
      object.scale.setScalar(OBJECT_SCALE);
      object.position.set(process.object.x, process.object.y, process.object.z);
    }
    const u = this.uniforms;
    u.spectral.value = process.spectral;
    u.treatment.value = ['prismatic', 'recursive', 'glitch'].indexOf(treatment);
    u.seed.value = seed;
    u.pigment.value = pigment;
    u.distance.value = print.distance;
    u.time.value = time;
    u.layer.value = print.move.layer;
    u.coatingY.value = process.coatingY;
    u.beam.value = process.beam ? 1 : 0;
    this.preview.visible = process.stage === 'printing';
    if (this.extrusionEnds) {
      // Submit only completed filament and its current segment; mask clips its tip.
      let low = 0,
        high = this.extrusionEnds.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (this.extrusionEnds[middle] < print.distance) low = middle + 1;
        else high = middle;
      }
      this.mesh.geometry.setDrawRange(
        0,
        Math.min(this.extrusionEnds.length, low + 1) * 36
      );
    }
  }
  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.preview.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.preview.geometry.dispose();
    this.preview.material.dispose();
  }
}
