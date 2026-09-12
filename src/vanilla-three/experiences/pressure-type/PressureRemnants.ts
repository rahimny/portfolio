import * as THREE from 'three';
import { updateNormals } from '@/features/pressure-type/normals';
import { FRAGMENTS, type BurstMotion } from '@/features/pressure-type/motion';

interface SkinPatch {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
  sources: Uint16Array;
  rest: Float32Array;
  center: THREE.Vector3;
}

/** Compact, preallocated skin patches curl and relax after their shared membrane tears. */
export class PressureRemnants {
  private readonly patches: SkinPatch[] = [];
  private readonly material: THREE.MeshPhysicalMaterial;
  private readonly sourceMaterial: THREE.MeshPhysicalMaterial;
  private captured = false;

  constructor(
    source: THREE.BufferGeometry,
    material: THREE.MeshPhysicalMaterial,
    centerX: number,
    scene: THREE.Scene
  ) {
    this.sourceMaterial = material;
    this.material = material.clone();
    this.material.side = THREE.DoubleSide;
    const positions = source.getAttribute('position');
    const sectors = Array.from({ length: FRAGMENTS }, () => [] as number[]);
    const index = source.index!;
    for (let t = 0; t < index.count; t += 3) {
      const a = index.getX(t),
        b = index.getX(t + 1),
        c = index.getX(t + 2);
      const x =
        (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3 -
        centerX;
      const y = (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
      const sector = Math.min(
        FRAGMENTS - 1,
        Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * FRAGMENTS)
      );
      sectors[sector].push(a, b, c);
    }
    for (const sector of sectors) {
      const mapping = new Map<number, number>();
      const indices = sector.map((source) => {
        if (!mapping.has(source)) mapping.set(source, mapping.size);
        return mapping.get(source)!;
      });
      const sources = new Uint16Array(mapping.keys());
      const rest = new Float32Array(sources.length * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(rest.slice(), 3).setUsage(
          THREE.DynamicDrawUsage
        )
      );
      geometry.setAttribute(
        'normal',
        new THREE.BufferAttribute(rest.slice(), 3)
      );
      geometry.setIndex(indices);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.visible = false;
      this.patches.push({ mesh, sources, rest, center: new THREE.Vector3() });
      scene.add(mesh);
    }
  }

  update(source: THREE.BufferGeometry, burst: BurstMotion) {
    if (!burst.active) {
      this.captured = false;
      for (const patch of this.patches) patch.mesh.visible = false;
      return;
    }
    if (!this.captured) {
      const positions = source.getAttribute('position');
      for (const patch of this.patches) {
        patch.center.set(0, 0, 0);
        for (let i = 0; i < patch.sources.length; i++) {
          const n = patch.sources[i];
          patch.rest[i * 3] = positions.getX(n);
          patch.rest[i * 3 + 1] = positions.getY(n);
          patch.rest[i * 3 + 2] = positions.getZ(n);
          patch.center.x += positions.getX(n);
          patch.center.y += positions.getY(n);
          patch.center.z += positions.getZ(n);
        }
        patch.center.divideScalar(patch.sources.length || 1);
        for (let i = 0; i < patch.sources.length; i++) {
          patch.rest[i * 3] -= patch.center.x;
          patch.rest[i * 3 + 1] -= patch.center.y;
          patch.rest[i * 3 + 2] -= patch.center.z;
        }
      }
      this.captured = true;
    }
    this.syncMaterial();
    const release = 1 - Math.exp(-burst.age * 6);
    for (let i = 0; i < this.patches.length; i++) {
      const patch = this.patches[i],
        mesh = patch.mesh,
        n = i * 3;
      const curl = (i % 2 ? 1 : -1) * release * 3;
      const positions = mesh.geometry.getAttribute(
        'position'
      ) as THREE.BufferAttribute;
      for (let v = 0; v < patch.sources.length; v++) {
        const x = patch.rest[v * 3],
          y = patch.rest[v * 3 + 1],
          z = patch.rest[v * 3 + 2];
        positions.setXYZ(
          v,
          Math.abs(curl) > 0.001 ? Math.sin(x * curl) / curl : x,
          y,
          z * (1 - release * 0.65) +
            (Math.abs(curl) > 0.001 ? (1 - Math.cos(x * curl)) / curl : 0)
        );
      }
      positions.needsUpdate = true;
      const normal = mesh.geometry.getAttribute(
        'normal'
      ) as THREE.BufferAttribute;
      updateNormals(
        positions.array as Float32Array,
        mesh.geometry.index!.array as Uint16Array,
        normal.array as Float32Array
      );
      normal.needsUpdate = true;
      const scale = 1 - Math.min(0.55, burst.age * 2.5);
      mesh.visible = true;
      mesh.scale.setScalar(scale);
      mesh.rotation.set(release * (i % 2 ? 0.45 : -0.45), 0, burst.angles[i]);
      mesh.position.set(
        patch.center.x + burst.positions[n],
        patch.center.y + burst.positions[n + 1],
        patch.center.z + burst.positions[n + 2]
      );
    }
  }

  syncMaterial() {
    if (this.material.clearcoat > 0 !== this.sourceMaterial.clearcoat > 0)
      this.material.needsUpdate = true;
    this.material.color.copy(this.sourceMaterial.color);
    this.material.metalness = this.sourceMaterial.metalness;
    this.material.roughness = this.sourceMaterial.roughness;
    this.material.clearcoat = this.sourceMaterial.clearcoat;
    this.material.clearcoatRoughness = this.sourceMaterial.clearcoatRoughness;
    this.material.envMapIntensity = this.sourceMaterial.envMapIntensity;
    this.material.wireframe = this.sourceMaterial.wireframe;
  }

  dispose(scene: THREE.Scene) {
    for (const patch of this.patches) {
      scene.remove(patch.mesh);
      patch.mesh.geometry.dispose();
    }
    this.material.dispose();
  }
}
