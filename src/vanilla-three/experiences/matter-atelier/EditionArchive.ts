import * as THREE from 'three';
import type { PrintJob } from '@/features/matter-atelier/types';
import type { SurfacePaint } from '@/features/material-surface/paint';
import type { Treatment } from '@/features/matter-atelier/process';

type Edition = { group: THREE.Group; texture: THREE.CanvasTexture };

/** Three bounded, simplified specimens and their actual pigment impressions.
 * Captured only when a completed job is replaced; replay never invents history. */
export class EditionArchive {
  private editions: Edition[] = [];
  constructor(privateScene: THREE.Scene) {
    this.scene = privateScene;
  }
  private scene: THREE.Scene;
  get count() {
    return this.editions.length;
  }
  capture(
    job: PrintJob,
    paint: SurfacePaint,
    seed: number,
    treatment: Treatment
  ) {
    if (this.editions.length === 3) this.release(this.editions.shift()!);
    const group = new THREE.Group();
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const color = new THREE.Color();
    const pigmentMass = paint.mass;
    const rows = Math.min(32, job.contours.length),
      columns = 64;
    for (let row = 0; row < rows; row++) {
      const contour =
        job.contours[
          Math.round((row / (rows - 1)) * (job.contours.length - 1))
        ];
      for (let column = 0; column <= columns; column++) {
        const point =
          contour[Math.floor(((column % columns) / columns) * contour.length)];
        positions.push(point.x, point.y, point.z);
        let phase =
          point.y * 0.52 +
          Math.atan2(point.z, point.x) * 0.19 +
          seed * 0.17 +
          pigmentMass * 7;
        if (treatment === 'glitch') phase = Math.floor(phase * 9) / 9;
        if (treatment === 'recursive')
          phase += Math.sin(point.x * 5 + point.y * 3) * 0.35;
        color.setHSL(((phase % 1) + 1) % 1, 0.74, 0.43);
        colors.push(color.r, color.g, color.b);
        if (row < rows - 1 && column < columns) {
          const a = row * (columns + 1) + column,
            b = a + columns + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const object = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        metalness: 0.2,
        roughness: 0.28,
        clearcoat: 1,
        side: THREE.DoubleSide,
      })
    );
    object.scale.setScalar(0.31);
    object.position.set(-0.42, 0.25, 0);
    object.castShadow = true;
    group.add(object);
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 288;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f0eedd';
    ctx.fillRect(0, 0, 256, 288);
    const pixels = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const coverage =
          1 -
          Math.exp(
            -paint.pigmentAt((x + 0.5) / 256, 1 - (y + 0.5) / 256) * 460
          );
        const n = (y * 256 + x) * 4;
        pixels.data[n] = 240 + (23 - 240) * coverage;
        pixels.data[n + 1] = 238 + (42 - 238) * coverage;
        pixels.data[n + 2] = 221 + (174 - 221) * coverage;
        pixels.data[n + 3] = 255;
      }
    ctx.putImageData(pixels, 0, 0);
    ctx.fillStyle = '#182c3c';
    ctx.font = '14px monospace';
    ctx.fillText(`EDITION ${String(seed).padStart(3, '0')}`, 12, 278);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 1.01),
      new THREE.MeshBasicMaterial({ map: texture })
    );
    paper.position.set(0.55, 0.98, -0.12);
    group.add(paper);
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.12, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xc4d0d5, roughness: 0.45 })
    );
    shelf.position.y = 0.32;
    group.add(shelf);
    this.scene.add(group);
    this.editions.push({ group, texture });
    this.editions.forEach((edition, index) =>
      edition.group.position.set(-1.8 + index * 2.35, 0.6, -6.25)
    );
  }
  private release(edition: Edition) {
    edition.group.removeFromParent();
    edition.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
    edition.texture.dispose();
  }
  dispose() {
    this.editions.forEach((edition) => this.release(edition));
    this.editions = [];
  }
}
