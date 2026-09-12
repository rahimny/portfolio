import * as THREE from 'three';
import type { SurfacePaint } from '@/features/material-surface/paint';

/** Three.js adapter only. The material model owns all pigment and wetness. */
export class PaintedSurface {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshPhysicalMaterial>;
  private readonly film: THREE.DataTexture;
  private readonly wet: THREE.DataTexture;
  private filmVersion = -1;
  private wetVersion = -1;
  private readonly paint: SurfacePaint;
  constructor(paint: SurfacePaint, reliefScale = 0.048) {
    this.paint = paint;
    this.film = new THREE.DataTexture(
      paint.density,
      paint.width,
      paint.height,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.wet = new THREE.DataTexture(
      paint.surface,
      paint.wetWidth,
      paint.wetHeight,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    for (const texture of [this.film, this.wet]) {
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
    }
    const material = new THREE.MeshPhysicalMaterial({
      color: 0x263cdf,
      roughness: 0.25,
      metalness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.13,
    });
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        reliefScale: { value: reliefScale },
        pigmentField: { value: this.film },
        wetField: { value: this.wet },
        wetSize: { value: new THREE.Vector2(paint.wetWidth, paint.wetHeight) },
        filmSize: { value: new THREE.Vector2(paint.width, paint.height) },
      });
      shader.vertexShader =
        `varying vec2 paintUv;
        uniform sampler2D pigmentField, wetField;
        uniform float reliefScale;
        float relief(vec2 uv) {
          float pigment = texture2D(pigmentField, uv).r + texture2D(wetField, uv).r;
          return reliefScale * (1.0-exp(-pigment*24.0));
        }
` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.z += relief(uv);'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        '#include <uv_vertex>\npaintUv = uv;'
      );
      shader.fragmentShader =
        `
        uniform sampler2D pigmentField, wetField;
        uniform float reliefScale;
        uniform vec2 wetSize, filmSize;
        varying vec2 paintUv;
        vec2 reservoir(vec2 uv) {
          vec2 cell = floor(uv * wetSize - .5), f = fract(uv * wetSize - .5);
          return mix(mix(texture2D(wetField, (cell+.5)/wetSize).rg,
            texture2D(wetField, (cell+vec2(1.5,.5))/wetSize).rg, f.x),
            mix(texture2D(wetField, (cell+vec2(.5,1.5))/wetSize).rg,
            texture2D(wetField, (cell+1.5)/wetSize).rg, f.x), f.y);
        }
        float filmAt(vec2 uv) {
          vec2 cell = floor(uv * filmSize - .5), f = fract(uv * filmSize - .5);
          return mix(mix(texture2D(pigmentField, (cell+.5)/filmSize).r,
            texture2D(pigmentField, (cell+vec2(1.5,.5))/filmSize).r, f.x),
            mix(texture2D(pigmentField, (cell+vec2(.5,1.5))/filmSize).r,
            texture2D(pigmentField, (cell+1.5)/filmSize).r, f.x), f.y);
        }
        float pigmentAt(vec2 uv) { return filmAt(uv) + reservoir(uv).r; }
        float reliefAt(vec2 uv) { return reliefScale*(1.0-exp(-pigmentAt(uv)*24.0)); }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 liquid = reservoir(paintUv);
        float pigment = filmAt(paintUv) + liquid.r;
        float coverage = 1.0-exp(-pigment*460.0);
        if(coverage < .025) discard;
        diffuseColor.rgb = mix(vec3(.14,.19,.52), vec3(.008,.018,.24), coverage);
      `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        float paintHeight = reliefAt(paintUv);
        vec3 surfaceX = dFdx(-vViewPosition), surfaceY = dFdy(-vViewPosition);
        vec3 r1 = cross(surfaceY, normal), r2 = cross(normal, surfaceX);
        float determinant = dot(surfaceX, r1);
        vec2 delta = vec2(dFdx(paintHeight), dFdy(paintHeight));
        normal = normalize(abs(determinant)*normal - sign(determinant)*(delta.x*r1+delta.y*r2));
      `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(.56,.12,1.0-exp(-liquid.g*190.0));
      `
      );
    };
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(
        paint.config.width,
        paint.config.height,
        192,
        192
      ),
      material
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  upload() {
    if (this.filmVersion !== this.paint.filmVersion) {
      this.film.needsUpdate = true;
      this.filmVersion = this.paint.filmVersion;
    }
    if (this.wetVersion !== this.paint.surfaceVersion) {
      this.wet.needsUpdate = true;
      this.wetVersion = this.paint.surfaceVersion;
    }
  }
  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.film.dispose();
    this.wet.dispose();
  }
}
