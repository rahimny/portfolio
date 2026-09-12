import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export class SceneAssembly {
  protected readonly scene: THREE.Scene;
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }
  protected material(color: number, metalness = 0, roughness = 0.5) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
  }
  protected box(
    parent: THREE.Object3D,
    size: number[],
    position: number[],
    material: THREE.Material,
    radius = 0.025
  ) {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius),
      material
    );
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  protected cylinder(
    parent: THREE.Object3D,
    radius: number,
    length: number,
    position: number[],
    material: THREE.Material
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 20),
      material
    );
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  protected label(
    text: string,
    width: number,
    position: number[],
    parent: THREE.Object3D,
    color = '#a9bac1'
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.font = '500 66px monospace';
    const size = Math.min(66, (66 * 960) / ctx.measureText(text).width);
    ctx.font = `500 ${size}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(text, 512, 88);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width / 8),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
      })
    );
    mesh.position.set(position[0], position[1], position[2]);
    parent.add(mesh);
    return mesh;
  }
}
