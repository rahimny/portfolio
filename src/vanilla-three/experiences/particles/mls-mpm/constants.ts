import * as THREE from 'three/webgpu';

export const conf = {
  maxParticles: 8192 * 16,
  particles: 8192 * 4,
  gui: null,
  bloom: true,
  run: true,
  noise: 1.0,
  speed: 1,
  stiffness: 3.0,
  restDensity: 1.0,
  density: 1,
  dynamicViscosity: 0.1,
  gravity: 0,
  gravitySensorReading: new THREE.Vector3(),
  accelerometerReading: new THREE.Vector3(),
  actualSize: 1,
  size: 1,
  points: false,

  camera: {
    position: [0.008, 0.867, -0.874],
    target: [0.008, 0.611, 0.153],
    fov: 60,
  },

  light: {
    position: [0, 1.2, -0.8],
    target: [0, 0.7, 0],
  },

  world: {
    size: 64,
    rendererOffset: -32,
  },
};
