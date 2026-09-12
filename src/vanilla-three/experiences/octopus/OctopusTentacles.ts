import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ARM_COUNT,
  ARM_SEGMENTS,
  armLength,
  armRadius,
  sampleArm,
  type OctopusPose,
  type OctopusView,
} from '@/features/octopus/model';

const N = ARM_SEGMENTS + 1;
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const Y = V(0, 1, 0);
const COMMON = /* glsl */ `
uniform sampler2D uArmPose;
uniform float uArmIndex;
uniform float uArmLength;
uniform float uArmPeel;
vec4 armSample(float node, float row) {
  return texture2D(uArmPose, vec2((node + .5) / ${N.toFixed(1)}, (uArmIndex * 2. + row + .5) / 16.));
}
vec3 armRotate(vec3 p, vec4 q) { return p + 2. * cross(q.xyz, cross(q.xyz,p)+q.w*p); }
vec4 armOrientation(vec3 p) {
  float f = clamp(p.y/uArmLength, 0., 1.) * ${ARM_SEGMENTS.toFixed(1)};
  return normalize(mix(armSample(floor(f),1.),armSample(min(floor(f)+1.,${ARM_SEGMENTS.toFixed(1)}),1.),fract(f)));
}
vec3 armDeform(vec3 p) {
  float f = clamp(p.y/uArmLength,0.,1.) * ${ARM_SEGMENTS.toFixed(1)};
  vec3 centre = mix(armSample(floor(f),0.).xyz,armSample(min(floor(f)+1.,${ARM_SEGMENTS.toFixed(1)}),0.).xyz,fract(f));
  return centre + armRotate(vec3(p.x*(1.+uArmPeel),0.,p.z*(1.+uArmPeel)),armOrientation(p));
}
`;

export class OctopusTentacles {
  readonly root = new T.Group();
  private data = new Float32Array(N * 16 * 4);
  private texture = new T.DataTexture(
    this.data,
    N,
    16,
    T.RGBAFormat,
    T.FloatType
  );
  private groups: T.Group[] = [];
  private materials: T.Material[] = [];
  private armour: { mesh: T.Mesh; solid: T.Material; glass: T.Material }[] = [];
  private peel: { value: number }[] = [];
  private disposed = false;
  constructor(palette: {
    ceramic: T.Material;
    dark: T.Material;
    steel: T.Material;
    red: T.Material;
    glass: T.Material;
  }) {
    this.texture.minFilter = this.texture.magFilter = T.NearestFilter;
    this.texture.generateMipmaps = false;
    for (let arm = 0; arm < ARM_COUNT; arm++) {
      const group = new T.Group();
      this.root.add(group);
      this.groups.push(group);
      const length = armLength(arm);
      const cache = new Map<string, T.Material>();
      const material = (source: T.Material, peels = false) => {
        const key = source.uuid + peels;
        if (cache.has(key)) return cache.get(key)!;
        const m = source.clone();
        const peel = { value: 0 };
        if (peels) this.peel.push(peel);
        m.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, {
            uArmPose: { value: this.texture },
            uArmIndex: { value: arm },
            uArmLength: { value: length },
            uArmPeel: peel,
          });
          shader.vertexShader = COMMON + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <beginnormal_vertex>',
            '#include <beginnormal_vertex>\nobjectNormal = armRotate(objectNormal,armOrientation(position));'
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            'vec3 transformed = armDeform(position);'
          );
        };
        m.customProgramCacheKey = () => 'octopus-lattice-v2';
        this.materials.push(m);
        cache.set(key, m);
        return m;
      };
      const buckets = new Map<T.Material, T.BufferGeometry[]>();
      const add = (
        g: T.BufferGeometry,
        m: T.Material,
        p = V(),
        scale = V(1, 1, 1),
        q = new T.Quaternion()
      ) => {
        g.applyMatrix4(new T.Matrix4().compose(p, q, scale));
        const gs = buckets.get(m) ?? [];
        gs.push(g);
        buckets.set(m, gs);
      };
      const rod = (a: T.Vector3, b: T.Vector3, r: number, m: T.Material) => {
        add(
          new T.CylinderGeometry(r, r, a.distanceTo(b), 5),
          m,
          a.clone().add(b).multiplyScalar(0.5),
          undefined,
          new T.Quaternion().setFromUnitVectors(Y, b.clone().sub(a).normalize())
        );
      };
      const point = (u: number, t: number, mult = 1) =>
        V(
          Math.cos(u * TAU) * armRadius(t) * mult,
          t * length,
          Math.sin(u * TAU) * armRadius(t) * mult
        );
      const metal = material(palette.steel),
        dark = material(palette.dark),
        red = material(palette.red),
        white = material(palette.ceramic),
        armour = material(palette.ceramic, true);
      // Pointy hexagons tile the tapered cylindrical envelope. Only three edges are owned per cell.
      const rows = 48,
        columns = 8;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < columns; col++) {
          const hex = Array.from({ length: 6 }, (_, corner) => {
            const a = Math.PI / 6 + (corner * Math.PI) / 3;
            return point(
              (col + (row % 2) * 0.5 + Math.cos(a) / Math.sqrt(3)) / columns,
              (row + (Math.sin(a) * 2) / 3 + 0.7) / (rows + 1.4)
            );
          });
          for (let e = 0; e < (row === 0 ? 6 : 3); e++)
            rod(
              hex[e],
              hex[(e + 1) % 6],
              0.012 * (1 - (row / rows) * 0.64),
              metal
            );
        }
      // The visible voids expose three independently wound service tendons and an axial line.
      for (let c = 0; c < 4; c++)
        for (let j = 0; j < 96; j++) {
          const t = j / 96,
            next = (j + 1) / 96;
          const mult = c === 3 ? 0.08 : 0.48;
          rod(
            point(c / 3 + t * 1.45, t, mult),
            point(c / 3 + next * 1.45, next, mult),
            c === 3 ? 0.022 : 0.024 * (1 - t * 0.67),
            c === 0 ? red : c === 3 ? dark : metal
          );
        }
      const turnZ = new T.Quaternion().setFromAxisAngle(
        V(1, 0, 0),
        Math.PI / 2
      );
      for (let j = 0; j < 36; j++) {
        const t = (j + 0.35) / 37,
          r = armRadius(t);
        // Sparse vertebral collars leave the hex cells legible between hard points.
        if (j % 3 === 0) {
          add(
            new T.CylinderGeometry(
              r * 1.035,
              r * 1.06,
              j === 0 ? 0.25 : 0.065,
              12,
              1,
              true
            ),
            j % 9 === 0 ? red : armour,
            V(0, t * length, 0)
          );
          for (let b = 0; b < 6; b++)
            add(new T.SphereGeometry(0.024, 6, 4), dark, point(b / 6, t, 1.09));
        }
        // Larger proximal armour islands articulate over the continuous lattice.
        if (j < 10 && j % 2 === 0) {
          add(
            new T.CylinderGeometry(
              r * 1.03,
              r * 1.16,
              0.27,
              12,
              1,
              true,
              0.4,
              3.7
            ),
            armour,
            V(0, t * length, 0)
          );
        }
        for (const side of [-1, 1]) {
          const size = r * 0.38;
          const pos = V(side * r * 0.43, t * length, r * 0.82);
          add(
            new T.CylinderGeometry(size * 0.8, size, 0.065, 12),
            dark,
            pos,
            undefined,
            turnZ
          );
          add(
            new T.TorusGeometry(size * 0.8, size * 0.14, 5, 12),
            white,
            pos.clone().add(V(0, 0, 0.045))
          );
          add(
            new T.TorusGeometry(size * 0.4, size * 0.08, 4, 10),
            metal,
            pos.clone().add(V(0, 0, 0.049))
          );
          rod(
            pos.clone().add(V(0, -0.05, -0.035)),
            point(side < 0 ? 0.32 : 0.18, t, 0.43),
            0.009,
            red
          );
        }
      }
      for (const [m, gs] of buckets) {
        const g = mergeGeometries(gs)!;
        gs.forEach((g) => g.dispose());
        const mesh = new T.Mesh(g, m);
        mesh.frustumCulled = false;
        group.add(mesh);
        if (m === armour)
          this.armour.push({
            mesh,
            solid: m,
            glass: material(palette.glass, true),
          });
      }
    }
  }
  setXray(enabled: boolean) {
    for (const a of this.armour) a.mesh.material = enabled ? a.glass : a.solid;
  }
  update(
    time: number,
    pose: OctopusPose,
    separation: number,
    view: OctopusView
  ) {
    const x = V(),
      y = V(),
      z = V(),
      m = new T.Matrix4(),
      q = new T.Quaternion(),
      previous = new T.Quaternion();
    for (let arm = 0; arm < ARM_COUNT; arm++) {
      this.groups[arm].visible = view !== 'arm' || arm === 1;
      const points = sampleArm(arm, time, pose);
      for (let i = 0; i < N; i++) {
        const p = points[i],
          a = points[Math.max(0, i - 1)],
          b = points[Math.min(N - 1, i + 1)];
        y.set(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
        x.set(Math.sin(p.angle), 0, -Math.cos(p.angle));
        z.crossVectors(x, y).normalize();
        x.crossVectors(y, z).normalize();
        q.setFromRotationMatrix(m.makeBasis(x, y, z));
        // Keep neighbouring quaternions in one hemisphere before interpolation.
        if (i && q.dot(previous) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
        previous.copy(q);
        const offset = (arm * 2 * N + i) * 4;
        const rootAngle = (arm * Math.PI) / 4 + Math.PI / 8;
        this.data.set(
          [
            p.x + Math.cos(rootAngle) * separation * 1.7,
            p.y - separation * 0.8,
            p.z + Math.sin(rootAngle) * separation * 1.7,
            1,
          ],
          offset
        );
        q.toArray(this.data, offset + N * 4);
      }
    }
    for (const p of this.peel) p.value = separation * 0.65;
    this.texture.needsUpdate = true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.traverse((o) => {
      if (o instanceof T.Mesh) o.geometry.dispose();
    });
    this.materials.forEach((m) => m.dispose());
    this.texture.dispose();
    this.root.clear();
  }
}
