import * as THREE from 'three';

/** A continuous field erodes the articulated armour, with a narrow hot boundary. */
export class HandTeleportMaterial extends THREE.MeshPhongMaterial {
  readonly reveal = { value: 0 };
  readonly time = { value: 0 };

  constructor(color: number) {
    super({ color, shininess: 24 });
    this.transparent = true;
    this.onBeforeCompile = (shader) => {
      shader.uniforms.uHandReveal = this.reveal;
      shader.uniforms.uHandTime = this.time;
      shader.vertexShader =
        `varying vec3 vHandPosition;\n${shader.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvHandPosition = (instanceMatrix * vec4(position, 1.0)).xyz;'
        );
      shader.fragmentShader = `
        uniform float uHandReveal;
        uniform float uHandTime;
        varying vec3 vHandPosition;
        float handHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float handNoise(vec3 p) {
          vec3 cell = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(handHash(cell), handHash(cell+vec3(1,0,0)),f.x),
                         mix(handHash(cell+vec3(0,1,0)),handHash(cell+vec3(1,1,0)),f.x),f.y),
                     mix(mix(handHash(cell+vec3(0,0,1)),handHash(cell+vec3(1,0,1)),f.x),
                         mix(handHash(cell+vec3(0,1,1)),handHash(cell+vec3(1,1,1)),f.x),f.y),f.z);
        }
        ${shader.fragmentShader}`
        .replace(
          '#include <alphatest_fragment>',
          `
          float handEdge = 0.0;
          if (uHandReveal < 0.9999) {
            vec3 p = vHandPosition * 4.2;
            p += 0.65 * sin(p.yzx * 1.35 + vec3(0.0, 2.1, 4.2) + uHandTime * 0.65);
            float field = handNoise(p) * 0.65 + handNoise(p * 2.4) * 0.25
                        + (vHandPosition.y + 0.9) * 0.045;
            float boundary = uHandReveal * 1.32 - 0.16 - field;
            float aa = max(fwidth(boundary), 0.009);
            if (boundary < -aa) discard;
            diffuseColor.a *= smoothstep(-aa, aa * 2.0, boundary);
            handEdge = 1.0 - smoothstep(0.015, 0.10, boundary);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.19, 0.025, 0.006), handEdge);
          }
          #include <alphatest_fragment>
        `
        )
        .replace(
          '#include <emissivemap_fragment>',
          `
          #include <emissivemap_fragment>
          totalEmissiveRadiance += handEdge * vec3(1.0, 0.14, 0.018) * 0.8;
        `
        );
    };
  }

  customProgramCacheKey() {
    return 'masthead-machine-teleport-v2';
  }
}
