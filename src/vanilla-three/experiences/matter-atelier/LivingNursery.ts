import * as THREE from 'three/webgpu';
import {
  attribute,
  color,
  float,
  mat4,
  mix,
  positionGeometry,
  positionView,
  sin,
  smoothstep,
  uniform,
  uniformArray,
  uv,
  varying,
  vec3,
  vec4,
} from 'three/tsl';
import { seededRandom } from '@/features/fibre-field/blades';
import type {
  EditionGenome,
  LivingState,
} from '@/features/matter-atelier/living';
import { BATH } from '@/features/matter-atelier/process';
import { NURSERY_BEDS } from './AtelierFibres';

const PLANTS_PER_BED = 5;
const BRANCHES_PER_PLANT = 16;
const BRANCHES_PER_BED = PLANTS_PER_BED * BRANCHES_PER_PLANT;
const PETALS_PER_FLOWER = 18;
const LEAVES_PER_PLANT = 4;
const PETALS_PER_BED = PLANTS_PER_BED * (PETALS_PER_FLOWER + LEAVES_PER_PLANT);
const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;

export interface LivingNurseryOptions {
  flora: boolean;
  communication: boolean;
  style: 'atelier' | 'bioelectric' | 'signal';
}

/** Fixed-capacity organisms. Parent segments finish before their children emerge;
 * received material owns their growth, and the edition genome owns their markings.
 * The only recurring CPU work is updating three colony uniform records. */
export class LivingNursery {
  readonly group = new THREE.Group();
  private readonly flora = new THREE.Group();
  private readonly communication = new THREE.Group();
  private readonly time = uniform(0);
  private readonly style = uniform(0);
  private readonly expressionData = [0.55, 0.55, 0.55];
  private readonly expression = uniformArray<'float'>(
    this.expressionData,
    'float'
  );
  private readonly colonyData = [
    new THREE.Vector4(),
    new THREE.Vector4(),
    new THREE.Vector4(),
  ];
  private readonly colony = uniformArray<'vec4'>(this.colonyData, 'vec4');
  private readonly genomeData = [
    new THREE.Vector4(0.1, 5, 1, 0.5),
    new THREE.Vector4(0.1, 5, 1, 0.5),
    new THREE.Vector4(0.1, 5, 1, 0.5),
  ];
  private readonly genomes = uniformArray<'vec4'>(this.genomeData, 'vec4');
  private readonly packet = uniform(new THREE.Vector4(-1, 0, 0, 0));
  private readonly branches: THREE.InstancedMesh;
  private readonly petals: THREE.InstancedMesh;
  private readonly caps: THREE.InstancedMesh;
  private readonly hearts: THREE.InstancedMesh;
  private readonly branchData = new Float32Array(BRANCHES_PER_BED * 3 * 4);
  private readonly petalData = new Float32Array(PETALS_PER_BED * 3 * 4);
  private readonly capData = new Float32Array(PLANTS_PER_BED * 3 * 4);
  private readonly seedByBed = [-1, -1, -1];
  private readonly dummy = new THREE.Object3D();
  private readonly direction = new THREE.Vector3();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly instances = new Set<THREE.InstancedMesh>();
  private readonly transforms = new Map<
    THREE.InstancedMesh,
    THREE.InstancedInterleavedBuffer
  >();
  private disposed = false;

  constructor(parent: THREE.Object3D) {
    this.group.name = 'Living nursery';
    this.flora.name = 'Inherited organisms';
    this.communication.name = 'Nutrient recovery channels';
    this.group.userData.movable = true;
    this.group.add(this.flora, this.communication);
    parent.add(this.group);
    this.branches = this.createBranches();
    this.petals = this.createPetals();
    this.caps = this.createCaps();
    this.hearts = this.createHearts();
    this.flora.add(this.branches, this.petals, this.caps, this.hearts);
    this.createChannels();
    this.createBedRims();
    for (let bed = 0; bed < 3; bed++) this.rebuildBed(bed, 71 + bed * 13);
  }

  setOptions(options: Partial<LivingNurseryOptions>) {
    if (options.flora !== undefined) this.flora.visible = options.flora;
    if (options.communication !== undefined)
      this.communication.visible = options.communication;
    if (options.style !== undefined)
      this.style.value =
        options.style === 'bioelectric'
          ? 1
          : options.style === 'signal'
            ? 2
            : 0;
  }

  update(time: number, state: LivingState) {
    if (this.disposed) return;
    this.time.value = time;
    // Empty slots stay rooted but dormant. A new occupant is revealed from its
    // own birth front instead of changing an already-flowered neighbour.
    for (let i = 0; i < 3; i++) this.colonyData[i].set(0, 0, 0, 0);
    for (const colony of state.colonies) {
      const bed = ((colony.id % 3) + 3) % 3;
      this.expressionData[bed] = colony.expression;
      if (this.seedByBed[bed] !== colony.seed) {
        this.seedByBed[bed] = colony.seed;
        this.rebuildBed(bed, colony.seed, colony.genome);
      }
      this.colonyData[bed].set(
        colony.growth,
        colony.bloom,
        Math.min(1, colony.energy * 45),
        colony.care.receiptRate
      );
      this.genomeData[bed].set(
        colony.genome.phase,
        colony.genome.lobes,
        colony.genome.twist,
        colony.genome.branching
      );
    }
    const recovery = state.recovery;
    this.packet.value.set(
      ((recovery.editionId % 3) + 3) % 3,
      recovery.progress,
      recovery.active ? Math.min(1, recovery.amount * 45) : 0,
      recovery.arrived ? 1 : 0
    );
  }

  private ownGeometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private ownMaterial<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  private makeInstances(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    count: number
  ) {
    const mesh = new THREE.InstancedMesh(
      this.ownGeometry(geometry),
      this.ownMaterial(material),
      count
    );
    // NodeMaterial applies its ordinary instance transform before positionNode.
    // Our surfaces deform in their template coordinates, so apply the matching
    // matrix explicitly afterwards. The normal path still uses Three's own
    // instancing implementation. Both attributes share the same CPU storage.
    if (material instanceof THREE.NodeMaterial && material.positionNode) {
      const transforms = new THREE.InstancedInterleavedBuffer(
        mesh.instanceMatrix.array,
        16
      );
      this.transforms.set(mesh, transforms);
      for (let column = 0; column < 4; column++)
        geometry.setAttribute(
          `nurseryMatrix${column}`,
          new THREE.InterleavedBufferAttribute(transforms, 4, column * 4)
        );
      const instanceMatrix = mat4(
        attribute<'vec4'>('nurseryMatrix0', 'vec4'),
        attribute<'vec4'>('nurseryMatrix1', 'vec4'),
        attribute<'vec4'>('nurseryMatrix2', 'vec4'),
        attribute<'vec4'>('nurseryMatrix3', 'vec4')
      );
      material.positionNode = instanceMatrix.mul(
        vec4(material.positionNode as THREE.Node<'vec3'>, 1)
      ).xyz;
    }
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    this.instances.add(mesh);
    return mesh;
  }

  private createBranches() {
    const geometry = new THREE.CylinderGeometry(0.68, 1, 1, 6, 3, true);
    geometry.setAttribute(
      'nurseryBranch',
      new THREE.InstancedBufferAttribute(this.branchData, 4)
    );
    const data = attribute<'vec4'>('nurseryBranch', 'vec4');
    const colony = this.colony.element(data.x.toInt());
    const genome = this.genomes.element(data.x.toInt());
    const grown = colony.x.sub(data.y).div(data.z).clamp();
    const extension = smoothstep(0, 1, grown);
    const local = positionGeometry;
    const longitudinal = local.y.add(0.5);
    const radius = smoothstep(0, 0.12, grown);
    const material = new THREE.MeshStandardNodeMaterial({
      roughness: 0.35,
      metalness: 0.32,
    });
    material.positionNode = vec3(
      local.x.mul(radius),
      longitudinal.mul(extension).sub(0.5),
      local.z.mul(radius)
    );
    const age = varying(data.y.add(longitudinal.mul(data.z)));
    const current = varying(colony.x);
    const energy = varying(colony.z);
    // One illuminated growth front travels outwards along the tree's ancestry.
    const front = current.sub(age).sub(0.035).abs().mul(-65).exp().mul(energy);
    const receipt = varying(colony.w).mul(age.mul(-8).exp()).mul(0.35);
    const response = front.add(receipt).clamp();
    const silver = mix(color(0x496c7c), color(0xb1cdcc), age);
    const bio = mix(color(0x3356bd), color(0x93e4b2), this.style.clamp(0, 1));
    material.colorNode = mix(silver, bio, response.mul(0.7));
    material.emissiveNode = bio
      .mul(response)
      .mul(this.style.mul(0.32).add(0.12));
    material.roughnessNode = float(0.36).sub(varying(genome.w).mul(0.1));
    return this.makeInstances(geometry, material, BRANCHES_PER_BED * 3);
  }

  private createPetals() {
    const geometry = new THREE.PlaneGeometry(2, 1, 8, 12);
    // UV supplies the physical petal coordinates. Every instance shares this
    // small patch; opening bends the surface instead of scaling a finished leaf.
    geometry.setAttribute(
      'nurseryPetal',
      new THREE.InstancedBufferAttribute(this.petalData, 4)
    );
    const data = attribute<'vec4'>('nurseryPetal', 'vec4');
    const colony = this.colony.element(data.x.toInt());
    const genome = this.genomes.element(data.x.toInt());
    const u = uv().x.mul(2).sub(1);
    const v = uv().y;
    const leaf = data.z;
    const bloom = colony.y.sub(data.y).div(float(1).sub(data.y)).clamp();
    const unfold = smoothstep(0, 1, bloom);
    const stemReady = smoothstep(0.63, 0.88, colony.x);
    const birth = stemReady.mul(smoothstep(0, 0.12, bloom));
    const width = sin(v.mul(Math.PI)).max(0).pow(0.65);
    const serration = mix(
      float(1),
      sin(v.mul(12 * Math.PI))
        .abs()
        .mul(0.16)
        .add(0.84),
      leaf
    );
    const spread = unfold.mul(0.88).add(0.12);
    const bend = mix(
      v.mul(0.87),
      sin(v.mul(Math.PI * 0.85))
        .mul(0.28)
        .sub(v.pow(2).mul(0.12)),
      unfold
    );
    const curl = u.pow(2).mul(v).mul(0.16).mul(unfold);
    const slowSway = sin(this.time.mul(0.52).add(data.w).add(genome.x.mul(TAU)))
      .mul(0.012)
      .mul(v.pow(2))
      .mul(unfold)
      .mul(this.expression.element(data.x.toInt()));
    const material = new THREE.MeshPhysicalNodeMaterial({
      side: THREE.DoubleSide,
      roughness: 0.44,
      metalness: 0.02,
      clearcoat: 0.38,
      clearcoatRoughness: 0.4,
    });
    material.positionNode = vec3(
      u.mul(width).mul(0.35).mul(serration).mul(spread),
      bend.add(curl).add(slowSway),
      v.mul(spread).mul(mix(1, 1.2, leaf))
    ).mul(birth);
    // Derivatives follow the unfurling surface, keeping the curved highlights
    // attached to the real petal rather than the flat source patch.
    material.normalNode = positionView
      .dFdx()
      .cross(positionView.dFdy())
      .normalize();
    material.clearcoatNormalNode = material.normalNode;
    const family = varying(genome);
    const marking = v
      .mul(family.y.mul(2).add(8))
      .add(sin(u.mul(family.y).mul(Math.PI)).mul(0.52))
      .add(family.x.mul(TAU));
    const vein = smoothstep(0.86, 0.97, sin(marking)).mul(
      smoothstep(0.06, 0.22, v)
    );
    const leafKind = varying(leaf);
    const pearl = mix(color(0xf0f1df), color(0x96b8ad), leafKind);
    const pigment = mix(color(0x2044ad), color(0x346e6c), leafKind);
    const body = mix(pearl, pigment, vein.mul(0.85).add(v.pow(3).mul(0.1)));
    const inheritedColor = vec3(0, 2.1, 4.2)
      .add(family.x.mul(TAU))
      .add(v.mul(1.9))
      .cos()
      .mul(0.5)
      .add(0.5);
    material.colorNode = mix(
      body,
      inheritedColor,
      this.style.mul(0.08).mul(varying(colony.z)).mul(vein)
    );
    material.emissiveNode = inheritedColor
      .mul(vein)
      .mul(varying(colony.z))
      .mul(this.style.mul(0.24));
    return this.makeInstances(geometry, material, PETALS_PER_BED * 3);
  }

  private createCaps() {
    const points = [
      new THREE.Vector2(0, 0.36),
      new THREE.Vector2(0.16, 0.33),
      new THREE.Vector2(0.3, 0.23),
      new THREE.Vector2(0.41, 0.11),
      new THREE.Vector2(0.45, 0.045),
      new THREE.Vector2(0.42, 0.01),
      new THREE.Vector2(0.29, 0.045),
      new THREE.Vector2(0.14, 0.09),
      new THREE.Vector2(0, 0.11),
    ];
    const geometry = new THREE.LatheGeometry(points, 32);
    geometry.setAttribute(
      'nurseryCap',
      new THREE.InstancedBufferAttribute(this.capData, 4)
    );
    const data = attribute<'vec4'>('nurseryCap', 'vec4');
    const colony = this.colony.element(data.x.toInt());
    const genome = this.genomes.element(data.x.toInt());
    const grown = smoothstep(0.73, 0.94, colony.x);
    const opening = smoothstep(0.05, 0.7, colony.y);
    const material = new THREE.MeshPhysicalNodeMaterial({
      roughness: 0.43,
      metalness: 0.05,
      clearcoat: 0.35,
      clearcoatRoughness: 0.35,
    });
    const spread = opening.mul(0.68).add(0.32).mul(grown);
    material.positionNode = vec3(
      positionGeometry.x.mul(spread),
      positionGeometry.y.mul(grown).mul(opening.mul(-0.24).add(1.24)),
      positionGeometry.z.mul(spread)
    );
    const family = varying(genome);
    const radial = uv().x.mul(family.y.mul(7)).mul(TAU);
    const gill = smoothstep(0.85, 0.98, sin(radial));
    const lowRim = smoothstep(0.38, 0.62, uv().y);
    const tint = mix(color(0xf3eedb), color(0x7599a2), uv().y);
    material.colorNode = mix(tint, color(0x365c8a), gill.mul(lowRim).mul(0.68));
    material.emissiveNode = color(0x81c5d0)
      .mul(gill)
      .mul(lowRim)
      .mul(varying(colony.z))
      .mul(this.style.mul(0.3));
    return this.makeInstances(geometry, material, PLANTS_PER_BED * 3);
  }

  private createHearts() {
    const geometry = new THREE.SphereGeometry(1, 12, 8);
    geometry.setAttribute(
      'nurseryHeart',
      new THREE.InstancedBufferAttribute(this.capData, 4)
    );
    const data = attribute<'vec4'>('nurseryHeart', 'vec4');
    const colony = this.colony.element(data.x.toInt());
    const opening = smoothstep(0.01, 0.32, colony.y);
    const material = new THREE.MeshPhysicalNodeMaterial({
      color: 0xe48646,
      metalness: 0.18,
      roughness: 0.35,
      clearcoat: 0.7,
    });
    material.positionNode = positionGeometry.mul(opening);
    material.emissiveNode = color(0xe4b779)
      .mul(varying(colony.z))
      .mul(this.style.mul(0.1).add(0.035));
    return this.makeInstances(geometry, material, PLANTS_PER_BED * 3);
  }

  private createChannels() {
    const routes = [
      [
        [BATH.x - 0.6, BATH.z + 1.35],
        [2.6, -0.72],
        [-1.8, -0.72],
        [-3.7, 0.32],
        [-4.75, 2.1],
        [NURSERY_BEDS[0][0], NURSERY_BEDS[0][1]],
      ],
      [
        [BATH.x - 1.05, BATH.z + 1.2],
        [2.65, -1.1],
        [1.55, -1.42],
        [NURSERY_BEDS[1][0], NURSERY_BEDS[1][1]],
      ],
      [
        [BATH.x + 1.05, BATH.z + 1.2],
        [5.48, -0.86],
        [NURSERY_BEDS[2][0], NURSERY_BEDS[2][1]],
      ],
    ];
    const sheath = this.ownMaterial(
      new THREE.MeshPhysicalNodeMaterial({
        color: 0xafced8,
        metalness: 0.24,
        roughness: 0.18,
        clearcoat: 1,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      })
    );
    const couplingMaterial = this.ownMaterial(
      new THREE.MeshStandardNodeMaterial({
        color: 0xd47c50,
        metalness: 0.36,
        roughness: 0.34,
      })
    );
    const couplingGeometry = this.ownGeometry(
      new THREE.TorusGeometry(0.066, 0.014, 6, 16)
    );
    const forward = new THREE.Vector3(0, 0, 1);
    for (let bed = 0; bed < 3; bed++) {
      const curve = new THREE.CatmullRomCurve3(
        routes[bed].map(([x, z]) => new THREE.Vector3(x, 0.145, z)),
        false,
        'catmullrom',
        0.18
      );
      const geometry = this.ownGeometry(
        new THREE.TubeGeometry(curve, 80, 0.056, 8, false)
      );
      this.communication.add(new THREE.Mesh(geometry, sheath));
      const coreGeometry = this.ownGeometry(
        new THREE.TubeGeometry(curve, 80, 0.024, 6, false)
      );
      const core = this.ownMaterial(new THREE.MeshBasicNodeMaterial());
      const selected = this.packet.x.sub(bed).abs().lessThan(0.1).toFloat();
      const distance = uv().x.sub(this.packet.y);
      const head = distance.mul(48).pow(2).negate().exp();
      const tail = distance
        .mul(14)
        .exp()
        .mul(float(1).sub(smoothstep(-0.005, 0.025, distance)))
        .mul(0.32);
      const light = head.add(tail).mul(this.packet.z).mul(selected);
      const pulseColor = mix(
        color(0x648eea),
        color(0x9ff0bc),
        this.style.clamp(0, 1)
      );
      core.colorNode = mix(color(0x466979), pulseColor.mul(2.3), light.clamp());
      this.communication.add(new THREE.Mesh(coreGeometry, core));
      for (const t of [0.035, 0.36, 0.7, 0.965]) {
        const ring = new THREE.Mesh(couplingGeometry, couplingMaterial);
        curve.getPoint(t, ring.position);
        curve.getTangent(t, this.direction);
        ring.quaternion.setFromUnitVectors(forward, this.direction);
        this.communication.add(ring);
      }
    }
  }

  private createBedRims() {
    const material = this.ownMaterial(
      new THREE.MeshStandardNodeMaterial({
        color: 0xd6e4e3,
        metalness: 0.36,
        roughness: 0.27,
      })
    );
    for (const [x, z, rx, rz] of NURSERY_BEDS) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * TAU;
        points.push(
          new THREE.Vector3(
            x + Math.cos(angle) * rx,
            0.11,
            z + Math.sin(angle) * rz
          )
        );
      }
      const curve = new THREE.CatmullRomCurve3(points, true);
      const geometry = this.ownGeometry(
        new THREE.TubeGeometry(curve, 64, 0.035, 6, true)
      );
      this.flora.add(new THREE.Mesh(geometry, material));
    }
  }

  private rebuildBed(bed: number, seed: number, genome?: EditionGenome) {
    const random = seededRandom(seed);
    const [cx, cz, rx, rz] = NURSERY_BEDS[bed];
    const heightRatio = bed === 0 ? 1.08 : bed === 1 ? 0.93 : 0.88;
    let branchIndex = bed * BRANCHES_PER_BED;
    let petalIndex = bed * PETALS_PER_BED;
    const phase = (genome?.phase ?? 0.1) * TAU;
    const branching = genome?.branching ?? 0.5;
    for (let plant = 0; plant < PLANTS_PER_BED; plant++) {
      const t = (plant + 0.5) / PLANTS_PER_BED;
      const axis = (t * 2 - 1) * 0.81;
      const lateral = (random() - 0.5) * 0.44;
      const x = cx + (rx > rz ? axis : lateral) * rx;
      const z = cz + (rx > rz ? lateral : axis) * rz;
      const yaw = phase + plant * 2.399963 + random() * 0.32;
      const height = (0.75 + random() * 0.35) * heightRatio;
      const start = new THREE.Vector3(cx, 0.127, cz);
      const middle = new THREE.Vector3(
        cx + (x - cx) * 0.53 + Math.cos(yaw) * 0.045,
        0.14,
        cz + (z - cz) * 0.53 + Math.sin(yaw) * 0.045
      );
      const root = new THREE.Vector3(x, 0.15, z);
      const joint = new THREE.Vector3(
        x + Math.cos(yaw) * 0.038,
        0.15 + height * 0.44,
        z + Math.sin(yaw) * 0.038
      );
      const neck = new THREE.Vector3(
        x + Math.cos(yaw + 0.25) * 0.065,
        0.15 + height * 0.73,
        z + Math.sin(yaw + 0.25) * 0.065
      );
      const crown = new THREE.Vector3(
        x + Math.cos(yaw + 0.4) * 0.07,
        0.15 + height,
        z + Math.sin(yaw + 0.4) * 0.07
      );
      const offset = plant * 0.016;
      branchIndex = this.putBranch(
        branchIndex,
        bed,
        start,
        middle,
        0.014,
        0.01 + offset,
        0.12,
        yaw
      );
      branchIndex = this.putBranch(
        branchIndex,
        bed,
        middle,
        root,
        0.011,
        0.13 + offset,
        0.11,
        yaw
      );
      branchIndex = this.putBranch(
        branchIndex,
        bed,
        root,
        joint,
        0.026,
        0.25 + offset,
        0.18,
        yaw
      );
      branchIndex = this.putBranch(
        branchIndex,
        bed,
        joint,
        neck,
        0.02,
        0.43 + offset,
        0.17,
        yaw
      );
      branchIndex = this.putBranch(
        branchIndex,
        bed,
        neck,
        crown,
        0.014,
        0.6 + offset,
        0.19,
        yaw
      );
      let mushroom = crown;
      for (let fork = 0; fork < 2; fork++) {
        const angle = yaw + (fork ? 2.45 : -0.7);
        const forkStart = fork ? neck : joint;
        const spread = 0.12 + branching * 0.085;
        const elbow = new THREE.Vector3(
          forkStart.x + Math.cos(angle) * spread * 0.7,
          forkStart.y + height * 0.055,
          forkStart.z + Math.sin(angle) * spread * 0.7
        );
        const tip = new THREE.Vector3(
          forkStart.x + Math.cos(angle) * spread,
          forkStart.y + height * 0.18,
          forkStart.z + Math.sin(angle) * spread
        );
        const birth = (fork ? 0.61 : 0.44) + offset;
        branchIndex = this.putBranch(
          branchIndex,
          bed,
          forkStart,
          elbow,
          0.01,
          birth,
          0.1,
          angle
        );
        branchIndex = this.putBranch(
          branchIndex,
          bed,
          elbow,
          tip,
          0.007,
          birth + 0.1,
          0.1,
          angle
        );
        if (fork === 0) mushroom = tip;
        for (let leaf = 0; leaf < 2; leaf++) {
          this.putPetal(
            petalIndex++,
            bed,
            tip,
            angle + (leaf ? 0.6 : -0.6),
            0.34 + branching * 0.13,
            0.1 + fork * 0.03,
            1,
            angle
          );
        }
      }
      // A final low branch forks from the root into the surrounding fibres.
      const feeder = new THREE.Vector3(
        root.x + Math.cos(yaw + 2.1) * 0.15,
        0.18,
        root.z + Math.sin(yaw + 2.1) * 0.15
      );
      branchIndex = this.putBranch(
        branchIndex,
        bed,
        root,
        feeder,
        0.008,
        0.25 + offset,
        0.14,
        yaw
      );
      // A bounded two-generation mycelium forks from the feeder tip. Every
      // child starts after its parent arrives; the genome changes the opening
      // angle, so the colony's branching trait has a visible consequence.
      const extendMycelium = (
        parentTip: THREE.Vector3,
        direction: number,
        depth: number,
        birth: number
      ) => {
        if (depth > 2) return;
        for (let child = 0; child < 2; child++) {
          const turn = (child ? 1 : -1) * (0.48 + branching * 0.55);
          const angle = direction + turn + (random() - 0.5) * 0.18;
          const length = (0.17 - depth * 0.035) * (0.8 + random() * 0.4);
          const tip = new THREE.Vector3(
            parentTip.x + Math.cos(angle) * length,
            parentTip.y + (3 - depth) * 0.044,
            parentTip.z + Math.sin(angle) * length
          );
          const boundary = Math.hypot((tip.x - cx) / rx, (tip.z - cz) / rz);
          if (boundary > 0.93) {
            tip.x = cx + ((tip.x - cx) / boundary) * 0.93;
            tip.z = cz + ((tip.z - cz) / boundary) * 0.93;
          }
          branchIndex = this.putBranch(
            branchIndex,
            bed,
            parentTip,
            tip,
            0.009 / depth,
            birth,
            0.09,
            angle
          );
          extendMycelium(tip, angle, depth + 1, birth + 0.095);
        }
      };
      extendMycelium(feeder, yaw + 2.1, 1, 0.395 + offset);
      const lobes = Math.round(Math.max(3, Math.min(9, genome?.lobes ?? 5)));
      for (let petal = 0; petal < PETALS_PER_FLOWER; petal++) {
        const tier = petal < 9 ? 0 : 1;
        const petalNumber = petal % 9;
        const angle =
          yaw + (petalNumber / lobes) * TAU + (tier * Math.PI) / lobes;
        this.putPetal(
          petalIndex++,
          bed,
          crown,
          angle,
          (petalNumber < lobes ? (tier ? 0.29 : 0.4) : 0.00001) *
            (0.92 + random() * 0.17),
          tier * 0.12 + petalNumber * 0.018 + plant * 0.012,
          0,
          phase + petal * 0.2
        );
      }
      const index = bed * PLANTS_PER_BED + plant;
      this.capData.set([bed, plant * 0.02, 0, yaw], index * 4);
      this.dummy.position.copy(mushroom);
      this.dummy.rotation.set(0.05 * Math.cos(yaw), yaw, 0.04 * Math.sin(yaw));
      this.dummy.scale.setScalar(0.52 + random() * 0.2);
      this.dummy.updateMatrix();
      this.caps.setMatrixAt(index, this.dummy.matrix);
      this.dummy.position.copy(crown);
      this.dummy.position.y += 0.025;
      this.dummy.rotation.set(0, yaw, 0);
      this.dummy.scale.set(0.077, 0.046, 0.077);
      this.dummy.updateMatrix();
      this.hearts.setMatrixAt(index, this.dummy.matrix);
    }
    for (const mesh of [this.branches, this.petals, this.caps, this.hearts]) {
      mesh.instanceMatrix.needsUpdate = true;
      const transforms = this.transforms.get(mesh);
      if (transforms) transforms.needsUpdate = true;
    }
    this.branches.geometry.getAttribute('nurseryBranch').needsUpdate = true;
    this.petals.geometry.getAttribute('nurseryPetal').needsUpdate = true;
    this.caps.geometry.getAttribute('nurseryCap').needsUpdate = true;
    this.hearts.geometry.getAttribute('nurseryHeart').needsUpdate = true;
  }

  private putBranch(
    index: number,
    bed: number,
    start: THREE.Vector3,
    end: THREE.Vector3,
    radius: number,
    birth: number,
    duration: number,
    phase: number
  ) {
    this.direction.subVectors(end, start);
    const length = this.direction.length();
    this.dummy.position.copy(start).addScaledVector(this.direction, 0.5);
    this.direction.divideScalar(Math.max(0.0001, length));
    this.dummy.quaternion.setFromUnitVectors(UP, this.direction);
    this.dummy.scale.set(radius, length, radius);
    this.dummy.updateMatrix();
    this.branches.setMatrixAt(index, this.dummy.matrix);
    this.branchData.set([bed, birth, duration, phase], index * 4);
    return index + 1;
  }

  private putPetal(
    index: number,
    bed: number,
    origin: THREE.Vector3,
    angle: number,
    size: number,
    delay: number,
    kind: number,
    phase: number
  ) {
    this.dummy.position.copy(origin);
    this.dummy.rotation.set(0, angle, 0);
    this.dummy.scale.setScalar(size);
    this.dummy.updateMatrix();
    this.petals.setMatrixAt(index, this.dummy.matrix);
    this.petalData.set([bed, delay, kind, phase], index * 4);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.instances.forEach((mesh) => mesh.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => material.dispose());
    this.instances.clear();
    this.transforms.clear();
    this.geometries.clear();
    this.materials.clear();
    this.group.clear();
  }
}
