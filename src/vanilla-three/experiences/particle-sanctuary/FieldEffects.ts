import * as THREE from 'three/webgpu';
import {
  Fn,
  attribute,
  cameraPosition,
  color,
  float,
  mix,
  positionGeometry,
  sin,
  cos,
  texture,
  uniform,
  uniformArray,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import {
  BURST_CAPACITY,
  BURST_DURATION,
  BurstPool,
  createBlades,
  FIELD_RADIUS,
  seededRandom,
  type FieldSettings,
} from '../../../features/particle-sanctuary/model';

/** Study-local effects share inputs and resources, but never own an animation loop. */
export class FieldEffects {
  readonly time = uniform(0);
  readonly wind = uniform(0.55);
  readonly interaction = uniform(1);
  readonly bursts = new BurstPool();
  readonly group = new THREE.Group();
  private readonly events = uniformArray<'vec4'>(
    Array.from(
      { length: BURST_CAPACITY },
      () => new THREE.Vector4(0, 0, -1000, 0)
    ),
    'vec4'
  );
  private readonly grassMaterial = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
  });
  private readonly fragmentMaterial = new THREE.MeshBasicNodeMaterial({
    side: THREE.DoubleSide,
  });
  private readonly grass: THREE.Mesh;
  private readonly fragments: THREE.Mesh;
  private disposed = false;
  bladeCount = 0;

  constructor(
    flow: THREE.DataTexture,
    mask: THREE.CanvasTexture,
    settings: FieldSettings
  ) {
    this.wind.value = settings.wind;
    const activity = varying(float(0));
    const tip = attribute<'vec4'>('blade', 'vec4').y;
    const height = attribute<'vec4'>('blade', 'vec4').z;
    const rootUV = positionGeometry.xz.div(FIELD_RADIUS * 2).add(0.5);
    const maskFacing = cameraPosition.xz.normalize();
    const maskUV = vec2(
      positionGeometry.x
        .mul(maskFacing.y)
        .sub(positionGeometry.z.mul(maskFacing.x)),
      positionGeometry.x
        .mul(maskFacing.x)
        .add(positionGeometry.z.mul(maskFacing.y))
    )
      .div(FIELD_RADIUS * 2)
      .add(0.5);
    const growth = texture(mask, maskUV).r;

    this.grassMaterial.positionNode = Fn(() => {
      const shape = attribute<'vec4'>('blade', 'vec4');
      const root = positionGeometry;
      const cameraDirection = cameraPosition.xz.sub(root.xz).normalize();
      const side = vec3(cameraDirection.y, 0, cameraDirection.x.negate());
      const localHeight = height.mul(mix(0.16, 1, growth));
      const windPhase = root.x
        .mul(0.65)
        .add(root.z.mul(0.38))
        .sub(this.time.mul(1.3));
      const gust = sin(windPhase)
        .mul(0.32)
        .add(sin(windPhase.mul(0.47).add(1.8)).mul(0.2));
      const bend = vec2(gust, gust.mul(0.32)).mul(this.wind).toVar();
      const wake = texture(flow, rootUV)
        .rg.sub(128 / 255)
        .mul(255 / 127)
        .mul(this.interaction);
      bend.addAssign(wake.mul(1.5));
      activity.assign(wake.length().mul(0.5));

      for (let i = 0; i < BURST_CAPACITY; i++) {
        const event = this.events.element(i);
        const delta = root.xz.sub(event.xy);
        const distance = delta.length();
        const age = this.time.sub(event.z).max(0);
        const wave = distance
          .sub(age.mul(4.5))
          .div(0.75)
          .pow(2)
          .negate()
          .exp()
          .mul(age.mul(-1.4).exp())
          .mul(event.w)
          .mul(this.interaction);
        bend.addAssign(delta.div(distance.max(0.01)).mul(wave).mul(1.7));
        activity.addAssign(wave.mul(0.8));
      }

      const tipHeight = localHeight.mul(tip);
      const lean = bend.mul(tipHeight);
      return root
        .add(side.mul(shape.x.mul(shape.w)))
        .add(
          vec3(lean.x, tipHeight.div(bend.length().mul(0.7).add(1)), lean.y)
        );
    })();

    const bladeColor = mix(
      color('#243621'),
      color('#a7bc68'),
      tip.pow(0.65)
    ).mul(height.mul(0.4).add(0.75));
    this.grassMaterial.colorNode = mix(
      bladeColor.mul(mix(0.48, 1, growth)),
      color('#ff632b'),
      activity.clamp(0, 0.85).mul(tip.mul(0.7).add(0.3))
    );

    this.grass = new THREE.Mesh(new THREE.BufferGeometry(), this.grassMaterial);
    this.group.add(this.grass);
    this.fragments = new THREE.Mesh(
      new THREE.BufferGeometry(),
      this.fragmentMaterial
    );
    this.group.add(this.fragments);
    this.setFragmentMaterial(flow);
    this.rebuild(settings);
  }

  rebuild(settings: FieldSettings): void {
    const blades = createBlades(
      settings.seed,
      settings.quality === 'high' ? 224 : 160
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(blades.positions, 3)
    );
    geometry.setAttribute('blade', new THREE.BufferAttribute(blades.shapes, 4));
    // Vertex deformation can move tips outside the CPU-side root bounds.
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      FIELD_RADIUS + 3
    );
    this.grass.geometry.dispose();
    this.grass.geometry = geometry;
    this.bladeCount = blades.count;
    this.fragments.geometry.dispose();
    this.fragments.geometry = this.createFragments(settings.seed);
    this.bursts.clear();
    this.syncBursts();
  }

  private createFragments(seed: number): THREE.BufferGeometry {
    const positions: number[] = [];
    const parameters: number[] = [];
    const emitters: number[] = [];
    const random = seededRandom(seed + 101);
    for (let slot = 0; slot < BURST_CAPACITY; slot++) {
      for (let i = 0; i < 192; i++) {
        const angle = random() * Math.PI * 2;
        const speed = 0.5 + random() * 2.7;
        const lift = 0.3 + random() * 2.2;
        const spin = random() * Math.PI * 2;
        for (const point of [
          [-0.035, 0, 0],
          [0.035, 0, 0],
          [0.015, 0.16, 0],
        ]) {
          positions.push(...point);
          parameters.push(angle, speed, lift, spin);
          emitters.push(slot);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
      'flight',
      new THREE.Float32BufferAttribute(parameters, 4)
    );
    geometry.setAttribute(
      'emitter',
      new THREE.Float32BufferAttribute(emitters, 1)
    );
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(),
      FIELD_RADIUS + 7
    );
    return geometry;
  }

  private setFragmentMaterial(flow: THREE.DataTexture): void {
    const ageVarying = varying(float(0));
    this.fragmentMaterial.positionNode = Fn(() => {
      const event = this.events.element(
        attribute<'float'>('emitter', 'float').toUint()
      );
      const flight = attribute<'vec4'>('flight', 'vec4');
      const age = this.time.sub(event.z).max(0);
      ageVarying.assign(age.div(BURST_DURATION).clamp());
      const progress = float(1).sub(age.mul(-1.8).exp());
      const fade = float(1).sub(age.div(BURST_DURATION)).max(0);
      const scale = age
        .mul(16)
        .min(1)
        .mul(fade)
        .mul(event.w)
        .mul(this.interaction);
      const angle = flight.x;
      const distance = progress.mul(flight.y).mul(event.w);
      const root = event.xy.add(vec2(cos(angle), sin(angle)).mul(distance));
      const wake = texture(flow, root.div(FIELD_RADIUS * 2).add(0.5))
        .rg.sub(128 / 255)
        .mul(255 / 127)
        .mul(fade)
        .mul(this.interaction);
      const flutter = sin(age.mul(9).add(flight.w));
      const local = vec3(
        positionGeometry.x.mul(cos(age.mul(6).add(flight.w))),
        positionGeometry.y.mul(flutter),
        positionGeometry.y.mul(cos(age.mul(9).add(flight.w)))
      ).mul(scale);
      const elevation = sin(age.div(BURST_DURATION).clamp().mul(Math.PI))
        .mul(flight.z)
        .mul(event.w);
      return vec3(
        root.x.add(wake.x),
        elevation.add(0.14),
        root.y.add(wake.y)
      ).add(local);
    })();
    this.fragmentMaterial.colorNode = mix(
      color('#ff5b24'),
      color('#b5b971'),
      ageVarying
    );
  }

  syncBursts(): void {
    const events = this.events.array as THREE.Vector4[];
    events.forEach((event, index) =>
      event.fromArray(this.bursts.data, index * 4)
    );
  }

  update(time: number, interaction = true): void {
    this.time.value = time;
    this.interaction.value = interaction ? 1 : 0;
    this.fragments.visible = interaction && this.bursts.activeCount(time) > 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.grass.geometry.dispose();
    this.fragments.geometry.dispose();
    this.grassMaterial.dispose();
    this.fragmentMaterial.dispose();
  }
}
