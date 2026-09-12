import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { metaShapesConf, type FormationConfig } from '../constants';

export class FormationManager {
  public calculateFormationPosition(
    index: number,
    x: number,
    y: number,
    z: number,
    totalCount: number,
    countPerSide: number
  ): THREE.Vector3 {
    const formation = metaShapesConf.instanceMesh.formation;
    const spacing = metaShapesConf.instanceMesh.spacing;

    switch (formation.type) {
      case 'cube':
        return this.calculateCubePosition(x, y, z, countPerSide, spacing);

      case 'sphere':
        return this.calculateSpherePosition(index, totalCount, formation);

      case 'cylinder':
        return this.calculateCylinderPosition(index, totalCount, formation);

      case 'plane':
        return this.calculatePlanePosition(x, z, countPerSide, spacing);

      case 'helix':
        return this.calculateHelixPosition(index, totalCount, formation);

      case 'random':
        return this.calculateRandomPosition(index, formation);

      case 'torus':
        return this.calculateTorusPosition(index, totalCount, formation);

      case 'wave':
        return this.calculateWavePosition(
          x,
          z,
          countPerSide,
          spacing,
          formation
        );

      case 'tesseract':
        return this.calculateTesseractPosition(index, totalCount, formation);

      default:
        return this.calculateCubePosition(x, y, z, countPerSide, spacing);
    }
  }

  private calculateCubePosition(
    x: number,
    y: number,
    z: number,
    countPerSide: number,
    spacing: number
  ): THREE.Vector3 {
    const offset = (countPerSide - 1) / 2;
    return new THREE.Vector3(
      (x - offset) * spacing,
      (y - offset) * spacing,
      (z - offset) * spacing
    );
  }

  private calculateSpherePosition(
    index: number,
    totalCount: number,
    formation: FormationConfig
  ): THREE.Vector3 {
    const radius = formation.radius || 8.0;

    // Use golden ratio spiral for even distribution
    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const theta = (2 * Math.PI * index) / goldenRatio;
    const phi = Math.acos(1 - (2 * index) / totalCount);

    return new THREE.Vector3(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi)
    );
  }

  private calculateCylinderPosition(
    index: number,
    totalCount: number,
    formation: FormationConfig
  ): THREE.Vector3 {
    const radius = formation.radius || 8.0;
    const height = formation.height || 16.0;

    const layerCount = Math.ceil(Math.sqrt(totalCount));
    const instancesPerLayer = Math.ceil(totalCount / layerCount);

    const layer = Math.floor(index / instancesPerLayer);
    const indexInLayer = index % instancesPerLayer;

    const angle = (indexInLayer / instancesPerLayer) * Math.PI * 2;
    const y = (layer / (layerCount - 1)) * height - height / 2;

    return new THREE.Vector3(
      radius * Math.cos(angle),
      y,
      radius * Math.sin(angle)
    );
  }

  private calculatePlanePosition(
    x: number,
    z: number,
    countPerSide: number,
    spacing: number
  ): THREE.Vector3 {
    const offset = (countPerSide - 1) / 2;
    return new THREE.Vector3((x - offset) * spacing, 0, (z - offset) * spacing);
  }

  private calculateHelixPosition(
    index: number,
    totalCount: number,
    formation: FormationConfig
  ): THREE.Vector3 {
    const radius = formation.radius || 8.0;
    const height = formation.height || 16.0;
    const turns = formation.turns || 3;

    const t = index / totalCount;
    const angle = t * turns * Math.PI * 2;
    const y = t * height - height / 2;

    return new THREE.Vector3(
      radius * Math.cos(angle),
      y,
      radius * Math.sin(angle)
    );
  }

  private calculateRandomPosition(
    index: number,
    formation: FormationConfig
  ): THREE.Vector3 {
    const radius = formation.radius || 8.0;
    const seed = formation.randomSeed || 42;

    // Simple seeded random using index
    const seedValue = (seed + index) * 9301 + 49297;
    const random1 = (seedValue % 233280) / 233280;
    const random2 = ((seedValue * 1.1) % 233280) / 233280;
    const random3 = ((seedValue * 1.3) % 233280) / 233280;

    return new THREE.Vector3(
      (random1 - 0.5) * radius * 2,
      (random2 - 0.5) * radius * 2,
      (random3 - 0.5) * radius * 2
    );
  }

  private calculateTorusPosition(
    index: number,
    totalCount: number,
    formation: FormationConfig
  ): THREE.Vector3 {
    const majorRadius = formation.radius || 8.0;
    const minorRadius = majorRadius * 0.3;

    const ringCount = Math.ceil(Math.sqrt(totalCount / 4));
    const instancesPerRing = Math.ceil(totalCount / ringCount);

    const ring = Math.floor(index / instancesPerRing);
    const indexInRing = index % instancesPerRing;

    const u = (ring / ringCount) * Math.PI * 2;
    const v = (indexInRing / instancesPerRing) * Math.PI * 2;

    return new THREE.Vector3(
      (majorRadius + minorRadius * Math.cos(v)) * Math.cos(u),
      minorRadius * Math.sin(v),
      (majorRadius + minorRadius * Math.cos(v)) * Math.sin(u)
    );
  }

  private calculateWavePosition(
    x: number,
    z: number,
    countPerSide: number,
    spacing: number,
    formation: FormationConfig
  ): THREE.Vector3 {
    const offset = (countPerSide - 1) / 2;
    const amplitude = formation.amplitude || 2.0;
    const frequency = formation.frequency || 0.5;

    const xPos = (x - offset) * spacing;
    const zPos = (z - offset) * spacing;

    const y =
      amplitude * Math.sin(xPos * frequency) * Math.cos(zPos * frequency);

    return new THREE.Vector3(xPos, y, zPos);
  }

  private calculateTesseractPosition(
    index: number,
    totalCount: number,
    formation: FormationConfig
  ): THREE.Vector3 {
    const scale = formation.tesseractScale || 8.0;
    const projectionType = formation.projectionType || 'stereographic';
    const rotationW = formation.rotationW || 0;
    const timeRotation = formation.timeRotation || false;

    // Generate 4D hypercube vertices (tesseract has 16 vertices)
    const verticesPerDimension = Math.ceil(Math.pow(totalCount, 1 / 4));
    const spacing4D = 2 / (verticesPerDimension - 1);

    // Convert linear index to 4D coordinates
    const w =
      Math.floor(index / Math.pow(verticesPerDimension, 3)) %
      verticesPerDimension;
    const z =
      Math.floor(index / Math.pow(verticesPerDimension, 2)) %
      verticesPerDimension;
    const y = Math.floor(index / verticesPerDimension) % verticesPerDimension;
    const x = index % verticesPerDimension;

    // Create 4D point in hypercube [-1, 1]^4
    const point4D = {
      x: x * spacing4D - 1,
      y: y * spacing4D - 1,
      z: z * spacing4D - 1,
      w: w * spacing4D - 1,
    };

    // Apply 4D rotation if enabled
    let rotatedPoint = point4D;
    if (timeRotation) {
      const time = performance.now() * 0.001;
      const angle = rotationW + time * 0.1;
      rotatedPoint = this.rotate4D(point4D, angle);
    }

    // Project from 4D to 3D
    let projected3D: THREE.Vector3;
    if (projectionType === 'stereographic') {
      projected3D = this.stereographicProjection(rotatedPoint, scale);
    } else {
      projected3D = this.orthographicProjection(rotatedPoint, scale);
    }

    return projected3D;
  }

  private rotate4D(
    point: { x: number; y: number; z: number; w: number },
    angle: number
  ) {
    // Simple 4D rotation in XW plane
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    return {
      x: point.x * cos - point.w * sin,
      y: point.y,
      z: point.z,
      w: point.x * sin + point.w * cos,
    };
  }

  private stereographicProjection(
    point4D: { x: number; y: number; z: number; w: number },
    scale: number
  ): THREE.Vector3 {
    // Stereographic projection from 4D to 3D
    const denominator = 1 - point4D.w;
    const factor = denominator !== 0 ? 1 / denominator : 1;

    return new THREE.Vector3(
      point4D.x * factor * scale,
      point4D.y * factor * scale,
      point4D.z * factor * scale
    );
  }

  private orthographicProjection(
    point4D: { x: number; y: number; z: number; w: number },
    scale: number
  ): THREE.Vector3 {
    // Simple orthographic projection (drop W coordinate)
    return new THREE.Vector3(
      point4D.x * scale,
      point4D.y * scale,
      point4D.z * scale
    );
  }

  public adjustCameraForFormation(
    camera: THREE.PerspectiveCamera,
    controls: OrbitControls
  ): void {
    const formation = metaShapesConf.instanceMesh.formation;
    const [x, y] = metaShapesConf.camera.position;
    let z = 15;

    switch (formation.type) {
      case 'sphere':
        z = (formation.radius || 8) * 2.5;
        break;
      case 'cylinder':
        z = Math.max(
          (formation.radius || 8) * 2.5,
          (formation.height || 16) * 1.2
        );
        break;
      case 'helix':
        z = Math.max(
          (formation.radius || 8) * 2.5,
          (formation.height || 16) * 1.2
        );
        break;
      case 'torus':
        z = (formation.radius || 8) * 3;
        break;
      case 'tesseract':
        z = (formation.tesseractScale || 8) * 3;
        break;
      default:
        z = metaShapesConf.instanceMesh.countPerSide * 1.8;
    }

    camera.position.set(x, y, z);
    controls.update();
  }
}
