import { createBrushAtlas } from './brushAtlas';
import { type MedusaSettings } from '@/features/medusa/settings';
import * as T from 'three/webgpu';
import {
  Fn,
  If,
  attribute,
  cameraProjectionMatrix,
  clamp,
  cos,
  float,
  floor,
  fract,
  mix,
  modelViewMatrix,
  mx_noise_float,
  normalize,
  cross,
  positionGeometry,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  CHAINS,
  NODES,
  createPaintSamples,
  type Anatomy,
} from '@/features/medusa/model';

import PALETTES from '@/features/medusa/palettes.json';
export { PALETTES };

export class OilPainter {
  readonly time = uniform(0);
  readonly revealAge = uniform(5);
  readonly pulseAmount = uniform(1);
  readonly brushSize = uniform(1);
  readonly paintMotion = uniform(0.5);
  readonly aspect = uniform(1);
  readonly distortion = uniform(1);
  readonly grain = uniform(1);
  readonly cutoff = uniform(0.35);
  readonly armWidth = uniform(0.46);
  readonly folds = uniform(22);
  readonly contrast = uniform(1);
  readonly rimLight = uniform(0.55);
  readonly depthSoftness = uniform(0.5);
  readonly atmosphere = uniform(0.65);
  readonly suspension = uniform(0.6);
  readonly viewDistance = uniform(14.8);
  readonly lightDirection = uniform(new T.Vector3(-0.6, 1, 0.8));
  readonly root: T.Mesh<T.InstancedBufferGeometry, T.MeshBasicNodeMaterial>;
  readonly background: T.Mesh<T.PlaneGeometry, T.MeshBasicNodeMaterial>;
  readonly pose: T.DataTexture;
  readonly count: number;
  private atlas: T.CanvasTexture;
  private dark = uniform(new T.Color(PALETTES[0].dark));
  private mid = uniform(new T.Color(PALETTES[0].mid));
  private pale = uniform(new T.Color(PALETTES[0].pale));
  private edge = uniform(new T.Color(PALETTES[0].edge));
  private ground = uniform(new T.Color(PALETTES[0].ground));
  private groundLight = uniform(new T.Color(PALETTES[0].light));

  constructor(anatomy: Anatomy, positions: Float32Array) {
    const samples = createPaintSamples(anatomy);
    this.count = samples.count;
    this.pose = new T.DataTexture(
      positions,
      NODES,
      CHAINS,
      T.RGBAFormat,
      T.FloatType
    );
    this.pose.minFilter = this.pose.magFilter = T.NearestFilter;
    this.pose.needsUpdate = true;
    this.atlas = createBrushAtlas(anatomy.seed, anatomy.settings.brushStyle);
    const plane = new T.PlaneGeometry(1, 1);
    const geometry = new T.InstancedBufferGeometry();
    geometry.index = plane.index;
    geometry.setAttribute('position', plane.attributes.position);
    geometry.setAttribute('uv', plane.attributes.uv);
    geometry.setAttribute(
      'binding',
      new T.InstancedBufferAttribute(samples.binding, 4)
    );
    geometry.setAttribute(
      'shape',
      new T.InstancedBufferAttribute(samples.shape, 4)
    );
    geometry.setAttribute(
      'pigment',
      new T.InstancedBufferAttribute(samples.pigment, 4)
    );
    geometry.setAttribute(
      'growth',
      new T.InstancedBufferAttribute(samples.growth, 2)
    );
    geometry.instanceCount = samples.count;
    plane.dispose();

    const material = new T.MeshBasicNodeMaterial();
    material.side = T.DoubleSide;
    material.depthTest = true;
    material.depthWrite = true;
    material.alphaToCoverage = false;
    const binding = attribute<'vec4'>('binding', 'vec4');
    const shape = attribute<'vec4'>('shape', 'vec4');
    const pigment = attribute<'vec4'>('pigment', 'vec4');
    const birth = attribute<'vec2'>('growth', 'vec2');
    const paintTint = varying(vec3(0), 'paintTint');
    const atlasIndex = varying(float(0), 'atlasIndex');

    const activation = Fn(([t]: [T.Node<'float'>]) => {
      const phase = fract(t.mul(0.28));
      const result = float(0).toVar();
      If(phase.lessThan(0.22), () => {
        result.assign(cos(phase.div(0.22).mul(Math.PI)).mul(-0.5).add(0.5));
      }).ElseIf(phase.lessThan(0.8), () => {
        result.assign(
          cos(phase.sub(0.22).div(0.58).mul(Math.PI)).mul(0.5).add(0.5)
        );
      });
      return result.mul(this.pulseAmount);
    });
    const bell = Fn(() => {
      const theta = binding.y;
      const angle = binding.z;
      const contraction = activation(this.time.sub(theta.mul(0.2)));
      const rim = sin(theta).pow(6);
      const radius = sin(theta)
        .mul(anatomy.width)
        .mul(contraction.mul(-0.24).add(1))
        .mul(
          cos(angle.mul(anatomy.lobes))
            .mul(rim)
            .mul(anatomy.settings.scallop)
            .add(1)
        );
      const y = cos(theta)
        .mul(anatomy.dome)
        .add(1.35)
        .add(
          sin(this.time.mul(Math.PI * 2 * 0.28).sub(0.6))
            .mul(this.suspension)
            .mul(0.25)
        )
        .add(contraction.mul(rim).mul(0.3))
        .add(
          sin(angle.mul(anatomy.lobes)).mul(rim).mul(anatomy.settings.scallop)
        );
      return vec3(cos(angle).mul(radius), y, sin(angle).mul(radius)).add(
        vec3(
          cos(angle).mul(sin(theta)),
          cos(theta),
          sin(angle).mul(sin(theta))
        ).mul(binding.w)
      );
    });
    const sampleChain = Fn(([along]: [T.Node<'float'>]) => {
      const index = clamp(along, 0, 0.9999).mul(NODES - 1);
      const row = binding.z.add(0.5).div(CHAINS);
      const a = texture(
        this.pose,
        vec2(floor(index).add(0.5).div(NODES), row)
      ).xyz;
      const b = texture(
        this.pose,
        vec2(floor(index).add(1.5).div(NODES), row)
      ).xyz;
      return mix(a, b, fract(index));
    });
    const arm = Fn(([along]: [T.Node<'float'>]) => {
      const centre = sampleChain(along);
      const spin = along
        .mul(this.folds)
        .add(sin(along.mul(9).add(binding.z)).mul(1.5))
        .add(binding.z.mul(1.7))
        .add(this.time.mul(0.22));
      const width = sin(along.mul(2.7).add(0.3))
        .mul(this.armWidth)
        .mul(binding.w);
      return centre.add(
        vec3(
          cos(spin).mul(width),
          sin(binding.w.mul(8).add(along.mul(35))).mul(0.065),
          sin(spin).mul(width)
        )
      );
    });

    material.vertexNode = Fn(() => {
      const centre = vec3(0).toVar();
      const tangent = vec3(0, -1, 0).toVar();
      const shade = float(0).toVar();
      const edgeLight = float(0).toVar();
      If(binding.x.lessThan(0.5), () => {
        centre.assign(bell());
        tangent.assign(
          vec3(
            cos(binding.z).mul(cos(binding.y)),
            sin(binding.y).negate(),
            sin(binding.z).mul(cos(binding.y))
          )
        );
        const normal = normalize(
          vec3(
            cos(binding.z).mul(sin(binding.y)).mul(anatomy.dome),
            cos(binding.y).mul(anatomy.width),
            sin(binding.z).mul(sin(binding.y)).mul(anatomy.dome)
          )
        );
        const facing = normalize(
          modelViewMatrix.mul(vec4(normal, 0)).xyz
        ).z.abs();
        const ribs = cos(binding.z.mul(anatomy.lobes).mul(0.5))
          .abs()
          .pow(18)
          .mul(sin(binding.y).pow(0.7));
        edgeLight.assign(facing.oneMinus().pow(3).mul(0.7).add(ribs.mul(0.18)));
        shade.assign(
          normal.dot(normalize(this.lightDirection)).mul(0.45).add(0.4)
        );
        shade.addAssign(pigment.x.sub(0.5).mul(0.18));
        shade.addAssign(
          sin(binding.z.mul(anatomy.lobes).add(binding.y.mul(4))).mul(0.035)
        );
      }).Else(() => {
        centre.assign(sampleChain(binding.y));
        tangent.assign(
          sampleChain(binding.y.add(0.01)).sub(sampleChain(binding.y.sub(0.01)))
        );
        If(binding.x.lessThan(1.5), () => {
          centre.assign(arm(binding.y));
          tangent.assign(
            arm(binding.y.add(0.006)).sub(arm(binding.y.sub(0.006)))
          );
          const spin = binding.y
            .mul(this.folds)
            .add(sin(binding.y.mul(9).add(binding.z)).mul(1.5))
            .add(binding.z.mul(1.7))
            .add(this.time.mul(0.22));
          const acrossRibbon = vec3(cos(spin), 0, sin(spin));
          const normal = normalize(cross(tangent, acrossRibbon));
          edgeLight.assign(
            normalize(modelViewMatrix.mul(vec4(normal, 0)).xyz)
              .z.abs()
              .oneMinus()
              .pow(3)
              .mul(0.4)
          );
          const lighting = normal.dot(normalize(this.lightDirection)).abs();
          shade.assign(
            lighting.mul(0.46).add(0.24).add(binding.w.abs().mul(0.1))
          );
        }).Else(() => {
          centre.addAssign(vec3(binding.w, 0, binding.w));
          shade.assign(pigment.x.mul(0.2).add(0.58));
          edgeLight.assign(0.15);
        });
      });
      // Compose the stamp in view space about its anatomical 3D anchor.
      const view = modelViewMatrix.mul(vec4(centre, 1)).toVar();
      const direction = modelViewMatrix.mul(vec4(tangent, 0)).xy;
      const unit = normalize(direction.add(vec2(0.00001, 0)));
      const perpendicular = vec2(unit.y.negate(), unit.x);
      const grainFlow = mx_noise_float(
        view.xyz.mul(0.9).add(this.time.mul(0.025))
      );
      const wobble = grainFlow
        .mul(1.2)
        .add(pigment.y.sub(0.5).mul(0.1))
        .mul(this.distortion);
      const along = unit.mul(cos(wobble)).add(perpendicular.mul(sin(wobble)));
      const across = vec2(along.y.negate(), along.x);
      const breath = sin(this.time.mul(0.8).add(pigment.z.mul(30)))
        .mul(this.paintMotion)
        .mul(0.045)
        .add(1);
      const emergence = smoothstep(
        birth.x,
        birth.x.add(birth.y),
        this.revealAge
      );
      // Extend each loaded stroke from one end; opacity stays materially opaque.
      const local = vec2(
        positionGeometry.x.add(0.5).mul(emergence).sub(0.5),
        positionGeometry.y.mul(smoothstep(0, 0.35, emergence))
      )
        .mul(shape.xy)
        .mul(vec2(this.aspect, this.aspect.sqrt().reciprocal()))
        .mul(this.brushSize)
        .mul(1.65)
        .mul(breath);
      view.xy.addAssign(along.mul(local.x).add(across.mul(local.y)));
      shade.assign(shade.sub(0.5).mul(this.contrast).add(0.5));
      const under = mix(this.dark, this.mid, smoothstep(0.02, 0.52, shade));
      const over = mix(under, this.pale, smoothstep(0.48, 0.93, shade));
      const painted = mix(over, this.edge, smoothstep(0.88, 1.1, shade)).mul(
        pigment.y.mul(0.035).add(0.98)
      );
      const pearl = mix(painted, this.edge, edgeLight.mul(this.rimLight));
      // Depth belongs to the same underwater world: back filaments recede into
      // its pigment, while near strokes retain their saturated colour.
      const distance = smoothstep(
        this.viewDistance.sub(0.8),
        this.viewDistance.add(2.6),
        view.z.negate()
      );
      const immersion = mix(0.12, 0.65, smoothstep(0.5, 2, binding.x));
      paintTint.assign(
        mix(pearl, this.ground, distance.mul(this.depthSoftness).mul(immersion))
      );
      atlasIndex.assign(shape.w);
      return cameraProjectionMatrix.mul(view);
    })();
    const brushTexel = texture(
      this.atlas,
      vec2(uv().x.add(atlasIndex).mul(0.25), uv().y)
    );
    const mask = brushTexel.r;
    // Atlas-scale pigment variation remains stable under minification. Screen-
    // frequency hash grain here previously shimmered across moving tiny stamps.
    material.colorNode = paintTint
      .mul(uv().y.mul(-0.035).add(1))
      .mul(mask.sub(1).mul(this.grain).mul(0.06).add(1))
      .mul(brushTexel.g.sub(0.5).mul(this.grain).mul(0.28).add(1));
    material.opacityNode = mask;
    material.alphaTestNode = this.cutoff;
    this.root = new T.Mesh(geometry, material);
    this.root.frustumCulled = false;
    this.root.rotation.z = 0.28;

    const backgroundMaterial = new T.MeshBasicNodeMaterial({
      depthWrite: false,
      depthTest: false,
    });
    backgroundMaterial.vertexNode = vec4(positionGeometry.xy.mul(2), 0.999, 1);
    const washCoordinates = uv().sub(vec2(0.36, 0.67)).mul(vec2(0.9, 1));
    const pool = washCoordinates.dot(washCoordinates).mul(-3.2).exp();
    const haze = mix(
      uv().y.mul(0.6).add(uv().x.oneMinus().mul(0.4)),
      pool,
      this.atmosphere
    );
    const cloud = mx_noise_float(vec3(uv().mul(2.8), 2)).mul(0.045);
    const paper = fract(
      sin(uv().mul(vec2(1831, 1277)).dot(vec2(12.9898, 78.233))).mul(43758.5453)
    )
      .sub(0.5)
      .mul(0.011)
      .mul(this.grain);
    const falloff = smoothstep(0.15, 0.75, uv().sub(0.5).length())
      .mul(this.atmosphere)
      .mul(0.22);
    backgroundMaterial.colorNode = mix(
      this.ground,
      this.groundLight,
      haze.mul(0.58)
    )
      .mul(falloff.oneMinus())
      .add(cloud)
      .add(paper);
    this.background = new T.Mesh(new T.PlaneGeometry(1, 1), backgroundMaterial);
    this.background.frustumCulled = false;
    this.background.renderOrder = -10;
  }

  applySettings(settings: MedusaSettings) {
    for (const key of [
      'brushSize',
      'pulseAmount',
      'paintMotion',
      'aspect',
      'distortion',
      'grain',
      'cutoff',
      'armWidth',
      'folds',
      'contrast',
      'rimLight',
      'depthSoftness',
      'atmosphere',
      'suspension',
    ] as const)
      this[key].value = settings[key];
    for (const key of ['dark', 'mid', 'pale', 'edge', 'ground'] as const)
      this[key].value.set(settings[key]);
    this.groundLight.value.set(settings.light);
    this.lightDirection.value.set(settings.lightX, 1, settings.lightZ);
    this.root.rotation.z = settings.tilt;
  }

  dispose() {
    this.root.geometry.dispose();
    this.root.material.dispose();
    this.background.geometry.dispose();
    this.background.material.dispose();
    this.atlas.dispose();
    this.pose.dispose();
  }
}
