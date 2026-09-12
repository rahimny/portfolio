// Adapted from Flow. See public/third-party/flow-LICENSE.txt.
import * as THREE from 'three/webgpu';
import { Fn, vec3, instanceIndex } from 'three/tsl';
import { conf } from '../constants';
import { Simulation } from '../mls-mpm/Simulation';

export class ParticleRenderer {
  public simulation: Simulation;
  public object: THREE.Points | null = null;
  public geometry: THREE.InstancedBufferGeometry;

  constructor(simulation: Simulation) {
    this.simulation = simulation;

    this.geometry = new THREE.InstancedBufferGeometry();
    const positionBuffer = new THREE.BufferAttribute(
      new Float32Array(3),
      3,
      false
    );
    const material = new THREE.PointsNodeMaterial();
    this.geometry.setAttribute('position', positionBuffer);
    this.object = new THREE.Points(this.geometry, material);
    material.positionNode = Fn(() => {
      return this.simulation.particleBuffer
        .element(instanceIndex)
        .get('position')
        .mul(vec3(1, 1, 0.4));
    })();

    if (this.object) {
      this.object.frustumCulled = false;

      const s = 1 / conf.world.size;
      this.object.position.set(conf.world.rendererOffset * s, 0, 0);
      this.object.scale.set(s, s, s);
      this.object.castShadow = true;
      this.object.receiveShadow = true;
    }
  }

  update() {
    const { particles } = conf.particles;
    this.geometry.instanceCount = particles;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.object?.material as THREE.Material | undefined)?.dispose();
  }
}
