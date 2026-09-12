import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  mix,
  normalView,
  positionLocal,
  positionView,
  texture,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { SurfacePaint } from '@/features/material-surface/paint';

/** Node-material view of the shared pigment model. The CPU field owns the ink. */
export class PaintedSurface {
  readonly mesh: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshPhysicalNodeMaterial
  >;
  private readonly film: THREE.DataTexture;
  private readonly wet: THREE.DataTexture;
  private filmVersion = -1;
  private wetVersion = -1;
  private readonly paint: SurfacePaint;
  constructor(paint: SurfacePaint, reliefScale = 0.006) {
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
    for (const field of [this.film, this.wet]) {
      field.minFilter = field.magFilter = THREE.NearestFilter;
      field.generateMipmaps = false;
      field.needsUpdate = true;
    }
    // Explicit interpolation also works without float32 texture filtering.
    const sample = (field: THREE.DataTexture, width: number, height: number) =>
      Fn(([coords]: [THREE.Node<'vec2'>]) => {
        const size = vec2(width, height);
        const cell = coords.mul(size).sub(0.5).floor();
        const f = coords.mul(size).sub(0.5).fract();
        return mix(
          mix(
            texture(field, cell.add(0.5).div(size)).level(float(0)),
            texture(field, cell.add(vec2(1.5, 0.5)).div(size)).level(float(0)),
            f.x
          ),
          mix(
            texture(field, cell.add(vec2(0.5, 1.5)).div(size)).level(float(0)),
            texture(field, cell.add(1.5).div(size)).level(float(0)),
            f.x
          ),
          f.y
        );
      });
    const filmAt = sample(this.film, paint.width, paint.height);
    const wetAt = sample(this.wet, paint.wetWidth, paint.wetHeight);
    const liquid = wetAt(uv());
    const pigment = filmAt(uv()).r.add(liquid.r);
    const coverage = pigment.mul(-460).exp().oneMinus();
    const relief = pigment.mul(-24).exp().oneMinus().mul(reliefScale);
    const material = new THREE.MeshPhysicalNodeMaterial({
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.14,
    });
    material.maskNode = coverage.greaterThanEqual(0.025);
    material.colorNode = mix(
      vec3(0.14, 0.19, 0.52),
      vec3(0.008, 0.018, 0.24),
      coverage
    );
    material.positionNode = positionLocal.add(vec3(0, 0, relief));
    material.roughnessNode = mix(
      0.56,
      0.12,
      liquid.g.mul(-190).exp().oneMinus()
    );
    material.normalNode = Fn(() => {
      const dx = positionView.dFdx();
      const dy = positionView.dFdy();
      const r1 = dy.cross(normalView);
      const r2 = normalView.cross(dx);
      const determinant = dx.dot(r1);
      const gradient = r1.mul(relief.dFdx()).add(r2.mul(relief.dFdy()));
      return normalView
        .mul(determinant.abs())
        .sub(gradient.mul(determinant.sign()))
        .normalize();
    })();
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(paint.config.width, paint.config.height, 96, 96),
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
