import * as T from 'three';
import { CHAIN_NODES, SwimmingModel } from '../../../features/nereid/swimming';
import { LIMBS } from '../../../features/nereid/model';
import type { NereidAssembly } from './NereidAssembly';

const COMMON = /* glsl */ `
uniform sampler2D uSwimPose;
uniform float uSwimLimb;
uniform float uSwimWeight;
uniform float uSwimBell;
uniform float uSwimMargin;
uniform float uSwimStroke;
vec3 nereidRotate(vec3 p, vec4 q) {
  return p + 2.0 * cross(q.xyz, cross(q.xyz, p) + q.w * p);
}
vec4 nereidSample(float node, float row) {
  return texture2D(uSwimPose, vec2((node + 0.5) / ${CHAIN_NODES.toFixed(1)}, (uSwimLimb * 3.0 + row + 0.5) / ${(LIMBS * 3).toFixed(1)}));
}
float nereidNode(vec3 p) {
  float length = 5.5 + sin(uSwimLimb * 2.0) * 0.45;
  return clamp((0.85 - p.y) / length, 0.0, 1.0) * ${(CHAIN_NODES - 1).toFixed(1)};
}
vec4 nereidOrientation(vec3 p) {
  float f = nereidNode(p);
  float a = floor(f), b = min(a + 1.0, ${(CHAIN_NODES - 1).toFixed(1)});
  vec4 q = normalize(mix(nereidSample(a, 2.0), nereidSample(b, 2.0), fract(f)));
  return normalize(mix(vec4(0.0, 0.0, 0.0, 1.0), q, uSwimWeight));
}
`;
const LIMB = /* glsl */ `
vec3 nereidDeform(vec3 p) {
  float f = nereidNode(p);
  float a = floor(f), b = min(a + 1.0, ${(CHAIN_NODES - 1).toFixed(1)});
  vec3 rest = mix(nereidSample(a, 0.0).xyz, nereidSample(b, 0.0).xyz, fract(f));
  vec3 live = mix(nereidSample(a, 1.0).xyz, nereidSample(b, 1.0).xyz, fract(f));
  return mix(rest, live, uSwimWeight) + nereidRotate(p - rest, nereidOrientation(p));
}
`;
const BELL = /* glsl */ `
vec3 nereidDeform(vec3 p) {
  float e = clamp((2.72 - p.y) / 1.5, 0.0, 1.0);
  float drive = uSwimStroke * uSwimWeight;
  float compression = drive * (0.72 * uSwimBell * e * e + 0.28 * uSwimMargin * pow(e, 4.0));
  p.xz *= 1.0 - compression;
  p.y += drive * (1.6 * uSwimMargin * pow(e, 3.0));
  return p;
}
vec3 nereidNormal(vec3 p, vec3 n) {
  vec3 origin = nereidDeform(p);
  vec3 dx = (nereidDeform(p + vec3(0.001, 0.0, 0.0)) - origin) * 1000.0;
  vec3 dy = (nereidDeform(p + vec3(0.0, 0.001, 0.0)) - origin) * 1000.0;
  vec3 dz = (nereidDeform(p + vec3(0.0, 0.0, 0.001)) - origin) * 1000.0;
  return cross(dy, dz) * n.x + cross(dz, dx) * n.y + cross(dx, dy) * n.z;
}
`;

/** A tiny CPU rod model supplies poses; the existing detailed meshes deform on the GPU. */
export class SwimDeformation {
  private data = new Float32Array(CHAIN_NODES * LIMBS * 3 * 4);
  private texture = new T.DataTexture(
    this.data,
    CHAIN_NODES,
    LIMBS * 3,
    T.RGBAFormat,
    T.FloatType
  );
  private uniforms = {
    uSwimPose: { value: this.texture },
    uSwimWeight: { value: 1 },
    uSwimBell: { value: 0 },
    uSwimMargin: { value: 0 },
    uSwimStroke: { value: 0.24 },
  };
  private limbWeight = { value: 1 };
  private restTangent = new T.Vector3();
  private liveTangent = new T.Vector3();
  private rotation = new T.Quaternion();
  private disposed = false;

  constructor(assembly: NereidAssembly, model: SwimmingModel) {
    this.texture.minFilter = this.texture.magFilter = T.NearestFilter;
    this.texture.generateMipmaps = false;
    let limb = 0;
    const cache = new Map<string, T.Material>();
    for (const part of assembly.parts) {
      if (!['limb', 'shell', 'ring'].includes(part.kind)) continue;
      const index = part.kind === 'limb' ? limb++ : -1;
      const mode = index >= 0 ? 'limb' : 'bell';
      const materialFor = (source: T.Material) => {
        const key = `${source.uuid}:${index}`;
        const existing = cache.get(key);
        if (existing) return existing;
        const material = source.clone();
        material.onBeforeCompile = (shader) => {
          Object.assign(shader.uniforms, this.uniforms, {
            uSwimWeight:
              mode === 'limb' ? this.limbWeight : this.uniforms.uSwimWeight,
            uSwimLimb: { value: Math.max(0, index) },
          });
          shader.vertexShader =
            COMMON + (mode === 'limb' ? LIMB : BELL) + shader.vertexShader;
          const normal = T.ShaderChunk.defaultnormal_vertex.replace(
            'transformedNormal = normalMatrix * transformedNormal;',
            `
            vec3 nereidRestPosition = position;
            #ifdef USE_INSTANCING
              nereidRestPosition = (instanceMatrix * vec4(position, 1.0)).xyz;
            #endif
            transformedNormal = ${mode === 'limb' ? 'nereidRotate(transformedNormal, nereidOrientation(nereidRestPosition))' : 'nereidNormal(nereidRestPosition, transformedNormal)'};
            transformedNormal = normalMatrix * transformedNormal;
          `
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <defaultnormal_vertex>',
            normal
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            T.ShaderChunk.project_vertex.replace(
              'mvPosition = modelViewMatrix * mvPosition;',
              'mvPosition.xyz = nereidDeform(mvPosition.xyz);\nmvPosition = modelViewMatrix * mvPosition;'
            )
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <worldpos_vertex>',
            T.ShaderChunk.worldpos_vertex.replace(
              'worldPosition = modelMatrix * worldPosition;',
              'worldPosition.xyz = nereidDeform(worldPosition.xyz);\nworldPosition = modelMatrix * worldPosition;'
            )
          );
        };
        material.customProgramCacheKey = () => `nereid-swim-v1-${mode}`;
        assembly.materials.push(material);
        cache.set(key, material);
        return material;
      };
      part.group.traverse((object) => {
        if (object.userData.nereidRigid) return;
        if (!(object instanceof T.Mesh || object instanceof T.LineSegments))
          return;
        object.frustumCulled = false;
        const materials = Array.isArray(object.material)
          ? object.material.map(materialFor)
          : materialFor(object.material);
        object.material = materials;
        if (part.kind === 'shell' && object instanceof T.Mesh) {
          object.userData.nereidOriginal = materials;
          object.userData.nereidXray = materialFor(assembly.glass);
        }
      });
    }
    this.update(model, 1);
  }

  update(model: SwimmingModel, weight: number, limbWeight = weight) {
    this.uniforms.uSwimWeight.value = weight;
    this.limbWeight.value = limbWeight;
    this.uniforms.uSwimBell.value = model.bell;
    this.uniforms.uSwimMargin.value = model.margin;
    this.uniforms.uSwimStroke.value = model.stroke;
    for (let limb = 0; limb < LIMBS; limb++) {
      const chain = model.chains[limb];
      for (let i = 0; i < CHAIN_NODES; i++) {
        const start = (limb * 3 * CHAIN_NODES + i) * 4;
        const j = i * 3;
        this.data.set(chain.rest.subarray(j, j + 3), start);
        this.data.set(
          chain.positions.subarray(j, j + 3),
          start + CHAIN_NODES * 4
        );
        const before = Math.max(0, i - 1) * 3,
          after = Math.min(CHAIN_NODES - 1, i + 1) * 3;
        this.restTangent
          .set(
            chain.rest[after] - chain.rest[before],
            chain.rest[after + 1] - chain.rest[before + 1],
            chain.rest[after + 2] - chain.rest[before + 2]
          )
          .normalize();
        this.liveTangent
          .set(
            chain.positions[after] - chain.positions[before],
            chain.positions[after + 1] - chain.positions[before + 1],
            chain.positions[after + 2] - chain.positions[before + 2]
          )
          .normalize();
        this.rotation.setFromUnitVectors(this.restTangent, this.liveTangent);
        this.rotation.toArray(this.data, start + CHAIN_NODES * 8);
      }
    }
    this.texture.needsUpdate = true;
  }

  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      this.texture.dispose();
    }
  }
}
