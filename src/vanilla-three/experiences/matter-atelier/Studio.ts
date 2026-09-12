import * as THREE from 'three';
import { SceneAssembly } from './SceneAssembly';
import { BRUSH_BASE } from '@/features/matter-atelier/process';

export class Studio extends SceneAssembly {
  private ground: THREE.MeshStandardMaterial;
  private wall: THREE.MeshStandardMaterial;
  private key: THREE.DirectionalLight;
  private rim: THREE.DirectionalLight;
  private hemisphere: THREE.HemisphereLight;
  private background = new THREE.Color(0xc5d7df);
  private groundTarget = new THREE.Color(0x9eb6c2);
  private wallTarget = new THREE.Color(0xadc3cf);
  private keyTarget = new THREE.Color(0xfff1df);
  private rimTarget = new THREE.Color(0xb9ceff);
  private remaining = 0;
  constructor(scene: THREE.Scene) {
    super(scene);
    scene.background = this.background.clone();
    scene.fog = new THREE.FogExp2(this.background, 0.009);
    const floor = this.material(0x9eb6c2, 0.08, 0.7);
    this.ground = floor;
    const white = this.material(0xe5e9e8, 0.1, 0.55);
    const dark = this.material(0x344654, 0.25, 0.55);
    this.box(scene, [90, 0.2, 90], [0, -0.21, 0], floor);
    // A raised workshop slab and expansion joints establish the scale of the room.
    this.box(scene, [19, 0.16, 13], [0.2, -0.06, 0.2], white, 0.05);
    for (const x of [-8, -4, 0, 4, 8])
      this.box(scene, [0.018, 0.005, 12.8], [x, 0.024, 0.2], floor, 0);
    for (const z of [-5.5, -1.5, 2.5, 6.5])
      this.box(scene, [18.8, 0.005, 0.018], [0.2, 0.024, z], floor, 0);
    this.box(
      scene,
      [6.5, 0.035, 6.5],
      [BRUSH_BASE.x, 0.055, BRUSH_BASE.z],
      dark,
      0.01
    );
    const paper = new THREE.Mesh(
      new THREE.RingGeometry(0.81, 3.025, 128),
      this.material(0xf0eedd, 0, 0.8)
    );
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(BRUSH_BASE.x, 0.087, BRUSH_BASE.z);
    paper.receiveShadow = true;
    scene.add(paper);
    this.hemisphere = new THREE.HemisphereLight(0xe4efff, 0x657184, 1.0);
    scene.add(this.hemisphere);
    const key = new THREE.DirectionalLight(0xfff1df, 2.1);
    this.key = key;
    key.position.set(-8, 15, 9);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {
      left: -15,
      right: 15,
      top: 12,
      bottom: -12,
      near: 0.5,
      far: 45,
    });
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.0001;
    key.shadow.radius = 3;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xb9ceff, 1.25);
    this.rim = rim;
    rim.position.set(5, 8, -7);
    scene.add(rim);
    const grazing = new THREE.SpotLight(0xffe2b7, 14, 12, 0.75, 0.65, 2);
    grazing.position.set(-4.5, 1.2, 5.8);
    grazing.target.position.set(BRUSH_BASE.x, 0.1, BRUSH_BASE.z);
    scene.add(grazing, grazing.target);
    this.box(
      scene,
      [0.08, 0.08, 2.8],
      [-4.25, 0.3, 3.8],
      this.material(0x283b50, 0.3, 0.4)
    );
    this.wall = this.material(0xadc3cf, 0.06, 0.72);
    this.box(scene, [22, 6.5, 0.15], [0, 3.1, -7.2], this.wall);
    for (const x of [-9, -3, 3, 9])
      this.box(scene, [0.065, 6.5, 0.1], [x, 3.15, -7.05], white);
    this.label('MATTER / 011', 4.2, [-5.5, 4.95, -7.03], scene, '#24394b');
    this.label(
      'FORM → GESTURE → SPECTRUM → LIFE',
      6.4,
      [-4.4, 4.3, -7.03],
      scene,
      '#24394b'
    );
    // Empty specimen mounts await a finished edition, rather than unrelated props.
    for (let i = 0; i < 3; i++) {
      this.box(
        scene,
        [1.35, 0.14, 1.5],
        [6.7 + i * 0.1, 0.15 + i * 0.46, -5.1],
        white,
        0.035
      );
    }
  }
  setStyle(style: 'atelier' | 'bioelectric' | 'signal', reduced = false) {
    const palette = {
      atelier: [0xc5d7df, 0x9eb6c2, 0xadc3cf, 0xfff1df, 0xb9ceff],
      bioelectric: [0x233b43, 0x27444a, 0x1c333a, 0xcaffd9, 0x748ffe],
      signal: [0xbbb9d4, 0x8f9cbb, 0x969cb9, 0xffe6d1, 0xdb9dff],
    }[style];
    this.background.setHex(palette[0]);
    this.groundTarget.setHex(palette[1]);
    this.wallTarget.setHex(palette[2]);
    this.keyTarget.setHex(palette[3]);
    this.rimTarget.setHex(palette[4]);
    this.remaining = 1;
    if (reduced) this.update(1);
  }
  update(delta: number) {
    if (this.remaining <= 0) return false;
    this.remaining = Math.max(0, this.remaining - delta);
    const alpha = this.remaining === 0 ? 1 : 1 - Math.exp(-delta * 6);
    (this.scene.background as THREE.Color).lerp(this.background, alpha);
    this.scene.fog?.color.copy(this.scene.background as THREE.Color);
    this.ground.color.lerp(this.groundTarget, alpha);
    this.wall.color.lerp(this.wallTarget, alpha);
    this.key.color.lerp(this.keyTarget, alpha);
    this.rim.color.lerp(this.rimTarget, alpha);
    return this.remaining > 0;
  }
}
