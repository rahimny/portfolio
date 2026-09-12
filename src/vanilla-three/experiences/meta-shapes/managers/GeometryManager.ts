import * as THREE from 'three';
import { metaShapesConf } from '../constants';

export class GeometryManager {
  public createGeometry(): THREE.BufferGeometry {
    const config = metaShapesConf.instanceMesh.geometry;
    const {
      type,
      size,
      detail,
      height,
      radiusTop,
      radiusBottom,
      radialSegments,
      heightSegments,
      widthSegments,
      phiLength,
      thetaLength,
    } = config;

    switch (type) {
      case 'box':
        return new THREE.BoxGeometry(size, size, size);

      case 'sphere':
        return new THREE.SphereGeometry(
          size / 2,
          widthSegments || 8,
          heightSegments || 6,
          0,
          phiLength || Math.PI * 2,
          0,
          thetaLength || Math.PI
        );

      case 'cylinder':
        return new THREE.CylinderGeometry(
          radiusTop || size / 2,
          radiusBottom || size / 2,
          height || size,
          radialSegments || 8,
          heightSegments || 1
        );

      case 'cone':
        return new THREE.ConeGeometry(
          radiusBottom || size / 2,
          height || size,
          radialSegments || 8,
          heightSegments || 1
        );

      case 'icosahedron':
        return new THREE.IcosahedronGeometry(size / 2, detail || 0);

      case 'octahedron':
        return new THREE.OctahedronGeometry(size / 2, detail || 0);

      case 'tetrahedron':
        return new THREE.TetrahedronGeometry(size / 2, detail || 0);

      case 'dodecahedron':
        return new THREE.DodecahedronGeometry(size / 2, detail || 0);

      default:
        return new THREE.BoxGeometry(size, size, size);
    }
  }
}
