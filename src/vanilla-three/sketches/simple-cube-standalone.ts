import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export function simpleCubeStandalone(canvas: HTMLCanvasElement): () => void {
  console.log('🎬 Three.js scene starting...');

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#2a2a2a');

  // Camera
  const aspect = canvas.clientWidth / canvas.clientHeight;
  const camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
  camera.position.set(0, 0, 5);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
  });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(5, 5, 5);
  scene.add(directionalLight);

  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
  const cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  const clock = new THREE.Clock();

  const handleResize = () => {
    const aspect = canvas.clientWidth / canvas.clientHeight;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  };

  window.addEventListener('resize', handleResize);

  let animationId: number;
  let frameCount = 0;

  const animate = () => {
    animationId = requestAnimationFrame(animate);
    frameCount++;

    const elapsed = clock.getElapsedTime();

    controls.update();

    cube.rotation.x = elapsed * 0.5;
    cube.rotation.y = elapsed * 0.3;

    renderer.render(scene, camera);

    if (frameCount % 120 === 0) {
      console.log(
        `🔄 Animation running... Frame ${frameCount}, Elapsed: ${elapsed.toFixed(
          1
        )}s`
      );
    }
  };

  // Start animation
  animate();
  console.log('✅ Three.js scene initialized');

  // Return cleanup function
  return () => {
    cancelAnimationFrame(animationId);
    window.removeEventListener('resize', handleResize);
    renderer.dispose();
    geometry.dispose();
    material.dispose();
  };
}
