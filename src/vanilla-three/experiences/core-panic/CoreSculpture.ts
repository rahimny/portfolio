import * as THREE from 'three';
import {
  growth,
  opening,
  gatherPosition,
  salvoSize,
  type Game,
  type GameEvent,
} from '@/features/core-panic/model';
import {
  auraFragment,
  coreFragment,
  coreVertex,
  knotFragment,
  knotVertex,
  fieldVertex,
  haloFragment,
  impactFragment,
  ribbonVertex,
  ribbonFragment,
} from './shaders';

const TRAIL_LENGTH = 52;
function ribbon(length: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(length * 6), 3).setUsage(
      THREE.DynamicDrawUsage
    )
  );
  const fades = new Float32Array(length * 2),
    across = new Float32Array(length * 2),
    indices: number[] = [];
  for (let j = 0; j < length; j++) {
    fades[j * 2] = fades[j * 2 + 1] = 1 - j / (length - 1);
    across[j * 2] = -1;
    across[j * 2 + 1] = 1;
    if (j < length - 1)
      indices.push(
        j * 2,
        j * 2 + 1,
        j * 2 + 2,
        j * 2 + 1,
        j * 2 + 3,
        j * 2 + 2
      );
  }
  geometry.setAttribute('fade', new THREE.BufferAttribute(fades, 1));
  geometry.setAttribute('across', new THREE.BufferAttribute(across, 1));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 1 } },
      vertexShader: ribbonVertex,
      fragmentShader: ribbonFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
  );
  mesh.frustumCulled = false;
  return mesh;
}
export class CoreSculpture {
  public readonly root = new THREE.Group();
  private impacts = Array.from(
    { length: 6 },
    () => new THREE.Vector4(0, 0, 0, 100)
  );
  private born = Array<number>(6).fill(-100);
  private impactIndex = 0;
  private auraAt = -100;
  private previousTime = 0;
  private aura = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShaderMaterial({
      vertexShader: fieldVertex,
      fragmentShader: auraFragment,
      uniforms: {
        uCharge: { value: 0 },
        uAge: { value: 100 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  private uniforms = {
    uTime: { value: 0 },
    uPressure: { value: 0 },
    uCharge: { value: 0 },
    uImpacts: { value: this.impacts },
    uKnots: { value: Array.from({ length: 5 }, () => new THREE.Vector4()) },
  };
  private knots: Array<{
    group: THREE.Group;
    orb: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
    ring: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    lock: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
    iris: THREE.Mesh<THREE.TorusGeometry, THREE.ShaderMaterial>;
  }> = [];
  private missiles: Array<{
    head: THREE.Mesh;
    trail: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    history: THREE.Vector3[];
    wasActive: boolean;
    finished: number;
  }> = [];
  private gatherers: Array<{
    head: THREE.Mesh;
    trail: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  }> = [];
  private links: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>[] =
    [];
  private splashes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] =
    [];
  private haloTransform = new THREE.Object3D();
  private halos = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.42, 0.42),
    new THREE.ShaderMaterial({
      vertexShader: fieldVertex,
      fragmentShader: haloFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    24
  );
  constructor() {
    this.aura.position.z = -2;
    this.root.add(this.aura);
    this.halos.frustumCulled = false;
    this.halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.halos);
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(1, 144, 100),
      new THREE.ShaderMaterial({
        vertexShader: coreVertex,
        fragmentShader: coreFragment,
        uniforms: this.uniforms,
      })
    );
    body.frustumCulled = false;
    this.root.add(body);
    const orbGeometry = new THREE.SphereGeometry(1, 32, 24);
    for (let i = 0; i < 5; i++) {
      const group = new THREE.Group();
      const orb = new THREE.Mesh(
        orbGeometry,
        new THREE.ShaderMaterial({
          vertexShader: knotVertex,
          fragmentShader: knotFragment,
          uniforms: {
            uTime: { value: 0 },
            uGrowth: { value: 0 },
            uLocked: { value: 0 },
            uOpen: { value: 0 },
          },
        })
      );
      const ringGeometry = new THREE.BufferGeometry();
      ringGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(65 * 3), 3)
      );
      const ring = new THREE.Line(
        ringGeometry,
        new THREE.LineBasicMaterial({
          color: 0xffda9e,
          transparent: true,
          opacity: 0.65,
        })
      );
      ring.position.z = 0.1;
      const lock = new THREE.Mesh(
        new THREE.TorusGeometry(0.3, 0.006, 5, 64),
        new THREE.MeshBasicMaterial({
          color: 0xfff3d4,
          transparent: true,
          opacity: 0,
        })
      );
      lock.position.z = 0.18;
      const iris = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.045, 12, 64),
        orb.material
      );
      iris.position.z = 0.2;
      group.add(iris);
      group.add(orb, ring, lock);
      this.root.add(group);
      this.knots.push({ group, orb, ring, lock, iris });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(33 * 3), 3)
      );
      const link = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: 0xffc28c,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        })
      );
      link.frustumCulled = false;
      this.root.add(link);
      this.links.push(link);
    }
    const headGeometry = new THREE.SphereGeometry(0.036, 12, 8);
    const headMaterial = new THREE.MeshBasicMaterial({ color: 0xffedb3 });
    for (let i = 0; i < 6; i++) {
      const head = new THREE.Mesh(headGeometry, headMaterial);
      const trail = ribbon(33);
      this.root.add(head, trail);
      this.gatherers.push({ head, trail });
    }
    for (let i = 0; i < 18; i++) {
      const head = new THREE.Mesh(headGeometry, headMaterial);
      const trail = ribbon(TRAIL_LENGTH);
      this.root.add(head, trail);
      this.missiles.push({
        head,
        trail,
        history: Array.from(
          { length: TRAIL_LENGTH },
          () => new THREE.Vector3()
        ),
        wasActive: false,
        finished: -100,
      });
    }
    for (let i = 0; i < 6; i++) {
      const splash = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 3.6),
        new THREE.ShaderMaterial({
          vertexShader: fieldVertex,
          fragmentShader: impactFragment,
          uniforms: {
            uAge: { value: 100 },
            uPower: { value: 1 },
            uFailure: { value: 0 },
          },
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      this.root.add(splash);
      this.splashes.push(splash);
    }
  }
  public event(event: GameEvent, time: number): void {
    if (event.type === 'shot' || event.type === 'breach') return;
    const i = this.impactIndex++ % 6;
    if (event.type === 'hit' || event.type === 'chain') this.auraAt = time;
    this.born[i] = time;
    this.impacts[i].set(
      ...(event.type === 'blocked'
        ? ([100, 0, 0] as [number, number, number])
        : event.position),
      0
    );
    this.splashes[i].position.set(...event.position);
    this.splashes[i].position.z = 2.3;
    const failure = event.type === 'rupture' || event.type === 'blocked';
    this.splashes[i].material.uniforms.uFailure.value = failure ? 1 : 0;
    this.splashes[i].material.uniforms.uPower.value = event.power;
    this.splashes[i].scale.setScalar(
      event.type === 'blocked' ? 0.45 : event.type === 'chain' ? 1.2 : 1
    );
  }
  private halo(index: number, head: THREE.Mesh, reduced: boolean): void {
    this.haloTransform.position.copy(head.position);
    this.haloTransform.position.z += 0.045;
    this.haloTransform.scale.setScalar(head.visible && !reduced ? 1 : 0);
    this.haloTransform.updateMatrix();
    this.halos.setMatrixAt(index, this.haloTransform.matrix);
  }
  public update(game: Game, time: number, reduced: boolean): void {
    this.uniforms.uTime.value = reduced ? 0 : time;
    this.uniforms.uPressure.value = game.pressure / 100;
    const delta = Math.max(0, Math.min(0.05, time - this.previousTime));
    this.previousTime = time;
    const charge = game.gathering ? Math.min(1, game.charge / 1.28) : 0;
    this.uniforms.uCharge.value = reduced
      ? charge
      : THREE.MathUtils.lerp(
          this.uniforms.uCharge.value,
          charge,
          1 - Math.exp(-delta * 12)
        );
    this.aura.visible = !reduced;
    this.aura.material.uniforms.uCharge.value = this.uniforms.uCharge.value;
    this.aura.material.uniforms.uAge.value = Math.max(0, time - this.auraAt);
    this.aura.material.uniforms.uTime.value = time;
    for (let i = 0; i < 6; i++) {
      const age = time - this.born[i];
      this.impacts[i].w = reduced ? 100 : age;
      const splash = this.splashes[i];
      splash.visible = !reduced && age >= 0 && age < 1.2;
      splash.material.uniforms.uAge.value = Math.max(0, age);
    }
    game.knots.forEach((k, i) => {
      const visual = this.knots[i],
        mature = growth(game, k),
        age = game.time - k.resolved;
      const live = k.state === 'active' || k.state === 'targeted';
      visual.group.visible = live || (k.state === 'collapsing' && age < 0.5);
      visual.group.position.set(...k.position);
      const scale = live ? 1 : Math.max(0, 1 - age / 0.35);
      visual.group.scale.setScalar(scale);
      const aperture = opening(game, k);
      visual.orb.scale.setScalar(
        (0.12 + mature * 0.095) * (k.wounded ? 0.78 : 1)
      );
      visual.orb.material.uniforms.uOpen.value = aperture;
      visual.iris.scale.set(0.3 + aperture * 0.85, 0.3 + aperture * 0.85, 1);
      visual.orb.scale.multiplyScalar(0.35 + aperture * 0.65);
      visual.orb.material.uniforms.uTime.value = reduced ? 0 : time;
      visual.orb.material.uniforms.uGrowth.value = mature;
      visual.orb.material.uniforms.uLocked.value =
        k.state === 'targeted' ? 1 : 0;
      visual.lock.material.opacity =
        game.selected === i || k.state === 'targeted' ? 0.9 : 0;
      visual.lock.material.color.setHex(aperture >= 0.65 ? 0xffefd0 : 0x9474bd);
      visual.lock.scale.setScalar(k.state === 'targeted' ? 1 : 1.35);
      visual.ring.material.color.setHex(mature > 0.8 ? 0xff8c63 : 0xffd19f);
      const positions = visual.ring.geometry.attributes.position;
      for (let j = 0; j <= 64; j++) {
        const a = (j / 64) * Math.PI * 2 * mature;
        positions.setXYZ(j, Math.sin(a) * 0.265, Math.cos(a) * 0.265, 0);
      }
      positions.needsUpdate = true;
      this.uniforms.uKnots.value[i].set(
        ...k.position,
        live ? mature * (0.3 + aperture * 0.7) : 0
      );
      const link = this.links[i],
        other = game.knots[k.link];
      link.visible =
        live &&
        !!other &&
        i < k.link &&
        (other.state === 'active' || other.state === 'targeted');
      if (link.visible) {
        const pos = link.geometry.attributes.position;
        for (let j = 0; j <= 32; j++) {
          const t = j / 32;
          pos.setXYZ(
            j,
            THREE.MathUtils.lerp(k.position[0], other.position[0], t),
            THREE.MathUtils.lerp(k.position[1], other.position[1], t) +
              Math.sin(t * Math.PI) * 0.09,
            1.88 + Math.sin(t * Math.PI) * 0.04
          );
        }
        pos.needsUpdate = true;
        link.material.opacity = mature >= 0.55 ? 0.65 : 0.23;
      }
    });
    this.gatherers.forEach((visual, i) => {
      const visible = game.gathering && i < salvoSize(game);
      visual.head.visible = visible;
      visual.trail.visible = visible && !reduced;
      if (!visible) {
        this.halo(i, visual.head, reduced);
        return;
      }
      const p = gatherPosition(game, i);
      visual.head.position.set(...p);
      this.halo(i, visual.head, reduced);
      if (reduced) {
        visual.head.position.set((i - 2.5) * 0.12, -1.95, 2);
        return;
      }
      const positions = visual.trail.geometry.attributes.position;
      for (let j = 0; j <= 32; j++) {
        const a = game.gatherAngle + (i * Math.PI) / 3 - j * 0.022;
        const r = 2.03 + Math.sin(a * 2) * 0.05;
        const width = 0.055 * Math.pow(1 - j / 33, 0.7);
        for (let side = 0; side < 2; side++) {
          const offset = side === 0 ? -width : width;
          positions.setXYZ(
            j * 2 + side,
            Math.cos(a) * (r + offset),
            Math.sin(a) * (r + offset) * 0.86,
            0.8 + Math.sin(a + 0.9) * 0.95
          );
        }
      }
      positions.needsUpdate = true;
    });
    game.missiles.forEach((m, i) => {
      const visual = this.missiles[i],
        active = m.active && m.age >= 0;
      visual.head.visible = active;
      if (!active && visual.wasActive) visual.finished = time;
      const tail = active
        ? 1
        : Math.max(0, 1 - (time - visual.finished) / 0.28);
      visual.trail.visible = tail > 0 && !reduced;
      visual.trail.material.uniforms.uOpacity.value = tail;
      if (active) {
        visual.head.position.set(...m.position);
        if (!visual.wasActive)
          visual.history.forEach((p) => p.set(...m.position));
        for (let j = TRAIL_LENGTH - 1; j > 0; j--)
          visual.history[j].copy(visual.history[j - 1]);
        visual.history[0].set(...m.position);
        const positions = visual.trail.geometry.attributes.position;
        for (let j = 0; j < TRAIL_LENGTH; j++) {
          const p = visual.history[j],
            next = visual.history[Math.max(0, j - 1)];
          const dx = next.x - p.x,
            dy = next.y - p.y,
            d = Math.max(0.001, Math.hypot(dx, dy));
          const width = 0.07 * Math.pow(1 - j / TRAIL_LENGTH, 0.7);
          positions.setXYZ(
            j * 2,
            p.x - (dy / d) * width,
            p.y + (dx / d) * width,
            p.z
          );
          positions.setXYZ(
            j * 2 + 1,
            p.x + (dy / d) * width,
            p.y - (dx / d) * width,
            p.z
          );
        }
        positions.needsUpdate = true;
      }
      this.halo(i + 6, visual.head, reduced);
      visual.wasActive = active;
    });
    this.halos.instanceMatrix.needsUpdate = true;
  }
  public reset(): void {
    this.born.fill(-100);
    this.auraAt = -100;
    this.uniforms.uCharge.value = 0;
    this.missiles.forEach((m) => {
      m.wasActive = false;
      m.finished = -100;
    });
  }
  public dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        geometries.add(object.geometry);
        (Array.isArray(object.material)
          ? object.material
          : [object.material]
        ).forEach((m) => materials.add(m));
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.halos.dispose();
    this.root.clear();
  }
}
