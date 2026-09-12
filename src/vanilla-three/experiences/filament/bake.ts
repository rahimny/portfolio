/** Development-only renderer. The live experience never imports this module. */
import * as THREE from 'three';
import { buildFilament, COLONIES } from '@/features/filament/model';
import {
  filamentVertex,
  particleVertex,
  filamentFragment,
} from './bakeShaders';

export function renderFilamentBake(
  canvas: HTMLCanvasElement,
  size = 2400,
  depthLayer = 0
) {
  const model = buildFilament();
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(size, size, false);
  renderer.setClearColor(depthLayer ? 0x000000 : 0x000100);
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(0, 1024, 0, 1024, 0.1, 2000);
  camera.position.z = 1000;
  const uniforms = {
    uDepthLayer: { value: depthLayer },
    uShells: {
      value: [
        ...COLONIES.map(([x, y, rx, ry]) => new THREE.Vector4(x, y, rx, ry)),
        new THREE.Vector4(511, 520, 205, 210),
      ],
    },
    uRadiiZ: { value: [...COLONIES.map((c) => c[4]), 145] },
    uTime: { value: 0 },
    uTension: { value: 1 },
    uExposure: { value: 1 },
    uPointScale: { value: 1.25 },
    uPixelRatio: { value: size / 1024 },
    uResolution: { value: new THREE.Vector2(size, size) },
    uLineScale: { value: size / 1024 },
  };
  const threads = new THREE.InstancedBufferGeometry();
  threads.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0], 3)
  );
  threads.setIndex([0, 1, 2, 2, 1, 3]);
  const endpoints = new THREE.InstancedInterleavedBuffer(model.positions, 6);
  threads.setAttribute(
    'aStart',
    new THREE.InterleavedBufferAttribute(endpoints, 3, 0)
  );
  threads.setAttribute(
    'aEnd',
    new THREE.InterleavedBufferAttribute(endpoints, 3, 3)
  );
  const light = new THREE.InstancedInterleavedBuffer(model.light, 2);
  threads.setAttribute(
    'aLight',
    new THREE.InterleavedBufferAttribute(light, 1, 0)
  );
  threads.instanceCount = model.segments;
  const points = new THREE.BufferGeometry();
  points.setAttribute('position', new THREE.BufferAttribute(model.points, 3));
  points.setAttribute('aLight', new THREE.BufferAttribute(model.pointLight, 1));
  const material = (particles: boolean) =>
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: particles ? particleVertex : filamentVertex,
      fragmentShader: filamentFragment,
      defines: particles ? { PARTICLES: 1 } : {},
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
  const threadMaterial = material(false),
    pointMaterial = material(true),
    mesh = new THREE.Mesh(threads, threadMaterial);
  mesh.frustumCulled = false;
  scene.add(mesh, new THREE.Points(points, pointMaterial));
  try {
    renderer.render(scene, camera);
    return canvas.toDataURL('image/png');
  } finally {
    threads.dispose();
    points.dispose();
    threadMaterial.dispose();
    pointMaterial.dispose();
    scene.clear();
    renderer.dispose();
  }
}
