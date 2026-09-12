import * as THREE from 'three';
import type { PressureSettings } from '@/features/pressure-type/settings';

/** A baked reflection studio and one live shadow light. No per-frame environment capture. */
export class PressureStudio {
  readonly material = new THREE.MeshPhysicalMaterial({
    color: 0x141719,
    metalness: 0,
    roughness: 0.18,
    ior: 1.48,
    clearcoat: 0.65,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.0,
  });
  private readonly environment: THREE.WebGLRenderTarget;
  private readonly ground: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.ShadowMaterial
  >;
  private readonly key: THREE.DirectionalLight;
  private readonly fill: THREE.HemisphereLight;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const studio = new THREE.Scene();
    studio.background = new THREE.Color(0x343b47);
    const geometry = new THREE.PlaneGeometry(1, 1);
    const panels: THREE.MeshBasicMaterial[] = [];
    const panel = (
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      intensity: number,
      tint: number
    ) => {
      const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(tint).multiplyScalar(intensity),
        side: THREE.DoubleSide,
      });
      panels.push(material);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(width, height, 1);
      mesh.lookAt(0, 0, 0);
      studio.add(mesh);
    };
    panel(-3, 3, 5, 5, 7, 4, 0xfff5e8);
    panel(0, 0, 9, 12, 10, 0.55, 0xe5edff);
    panel(4.5, 0.4, 3, 0.45, 5, 4, 0xe6efff);
    panel(-1.5, -3.5, 3, 4, 0.4, 1.5, 0xffffff);
    panel(0, -4, 1, 10, 6, 0.7, 0xdde3ec);
    const pmrem = new THREE.PMREMGenerator(renderer);
    try {
      this.environment = pmrem.fromScene(studio, 0.002, 0.1, 30, { size: 256 });
    } catch (error) {
      this.material.dispose();
      throw error;
    } finally {
      pmrem.dispose();
      geometry.dispose();
      for (const material of panels) material.dispose();
      studio.clear();
    }
    scene.environment = this.environment.texture;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    this.key = new THREE.DirectionalLight(0xfff5e8, 3);
    this.key.position.set(-3, 3, 8);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    Object.assign(this.key.shadow.camera, {
      left: -3.5,
      right: 3.5,
      top: 2.5,
      bottom: -2.5,
      near: 0.5,
      far: 22,
    });
    this.key.shadow.radius = 5;
    this.key.shadow.blurSamples = 8;
    this.key.shadow.normalBias = 0.015;
    this.key.shadow.bias = -0.0002;
    this.fill = new THREE.HemisphereLight(0xe5edff, 0x64594a, 0.3);
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: 0x28201a, opacity: 0.22 })
    );
    this.ground.position.z = -0.62;
    this.ground.receiveShadow = true;
    scene.add(this.key, this.fill, this.ground);
  }

  update(
    settings: PressureSettings,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene
  ) {
    this.material.color.set(settings.color);
    this.material.metalness = settings.metalness;
    this.material.roughness = settings.roughness;
    if (this.material.clearcoat > 0 !== settings.coat > 0)
      this.material.needsUpdate = true;
    this.material.clearcoat = settings.coat;
    this.material.clearcoatRoughness = settings.coatRoughness;
    this.material.envMapIntensity = settings.environment;
    renderer.toneMappingExposure = settings.exposure;
    scene.environmentRotation.z = settings.lightAngle;
    const c = Math.cos(settings.lightAngle),
      s = Math.sin(settings.lightAngle);
    this.key.position.set(-3 * c - 3 * s, -3 * s + 3 * c, 8);
    this.key.intensity = settings.key;
    this.key.shadow.radius = settings.shadowSoftness;
    this.ground.material.opacity = settings.shadow;
  }

  dispose(scene: THREE.Scene) {
    scene.environment = null;
    scene.remove(this.key, this.fill, this.ground);
    this.environment.dispose();
    this.material.dispose();
    this.key.shadow.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
  }
}
