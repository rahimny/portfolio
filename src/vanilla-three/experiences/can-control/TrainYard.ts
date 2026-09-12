import * as THREE from 'three';
import { seededRandom } from '@/features/particle-sanctuary/model';

/** Static scenery is batched by material. Coordinates share the paint plane at z=0. */
export class TrainYard {
  readonly root = new THREE.Group();
  readonly time = { value: 0 };
  readonly downwash = { value: new THREE.Vector3(2.5, 0.42, 0.9) };
  private readonly owned: { dispose(): void }[] = [];
  private disposed = false;

  constructor() {
    const palette = [
      0x76868a, 0x263638, 0x364341, 0x555449, 0xd2d5c7, 0x677f81, 0xcca974,
      0x37484e,
    ];
    const materials = palette.map(
      (color) => new THREE.MeshLambertMaterial({ color })
    );
    this.owned.push(...materials);
    const boxes: THREE.Matrix4[][] = palette.map(() => []);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const add = (
      material: number,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      angle = 0
    ) => {
      matrix.compose(
        new THREE.Vector3(x, y, z),
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle),
        new THREE.Vector3(w, h, d)
      );
      boxes[material].push(matrix.clone());
    };
    const ground = -1.15;
    add(2, 0, ground - 0.2, -3, 80, 0.4, 65);
    // Ballast beds and rails recede along the length of the yard.
    for (const track of [-1.05, -6.1, 5.2]) {
      add(3, 0, ground + 0.04, track, 65, 0.08, 2.7);
      for (let x = -28; x < 29; x += 0.62) {
        add(1, x, ground + 0.11, track, 0.24, 0.15, 2.35);
      }
      for (const z of [track - 0.74, track + 0.74]) {
        add(0, 0, ground + 0.22, z, 65, 0.14, 0.065);
        add(1, 0, ground + 0.16, z, 65, 0.035, 0.14);
      }
    }
    // Original freight wagon: clear central panel, end framing and a deep chassis.
    add(4, 1.6, 1.28, -1.02, 7.7, 2.66, 1.99);
    add(5, 1.6, 2.68, -1.02, 7.85, 0.16, 2.04);
    add(1, 1.6, -0.18, -1.02, 7.85, 0.3, 2.0);
    add(0, 1.6, 0.02, 0.015, 7.85, 0.12, 0.08);
    for (const x of [-2.22, -1.55, -0.65, 3.86, 4.76, 5.42]) {
      add(5, x, 1.34, 0.055, 0.095, 2.53, 0.09);
      add(5, x, 1.34, -2.07, 0.095, 2.53, 0.09);
    }
    for (const x of [-2.28, 5.48]) {
      add(1, x, -0.29, -1.02, 0.75, 0.15, 0.23);
      for (let y = 0.25; y < 2.5; y += 0.3) add(1, x, y, -0.2, 0.08, 0.04, 0.4);
    }
    // Small service markings and a safety plate belong to the wagon, away from paint.
    for (let i = 0; i < 5; i++)
      add(
        0,
        -1.15 + i * 0.075,
        0.3,
        0.032,
        0.045,
        0.065 + (i % 2) * 0.04,
        0.018
      );
    add(6, 4.5, 0.37, 0.033, 0.36, 0.14, 0.02);
    for (const x of [-0.95, 4.15]) add(1, x, -0.47, -1.03, 1.5, 0.3, 1.8);

    // Neighbouring stock and depot buildings create three depth layers.
    for (const x of [-10, 0.4, 11]) {
      add(7, x, 0.94, -6.15, 8.8, 2.65, 2.1);
      add(1, x, -0.45, -6.15, 9, 0.32, 1.8);
      for (let rib = -4; rib <= 4; rib += 0.65)
        add(0, x + rib, 0.96, -4.99, 0.075, 2.65, 0.085);
    }
    const random = seededRandom(81);
    for (let i = 0; i < 15; i++) {
      const x = -35 + i * 5;
      const h = 2.2 + random() * 5;
      add(7, x, ground + h / 2, -14 - random() * 7, 4 + random() * 3, h, 4);
    }
    add(0, 9, ground + 0.4, 0.8, 5.4, 0.8, 2);
    add(1, 9, 0.2, -0.15, 5.4, 0.06, 0.05);
    for (const x of [6.4, 8.2, 10, 11.6])
      add(1, x, -0.24, -0.15, 0.055, 0.9, 0.055);
    // One warm lamp provides the target's visual anchor.
    add(1, 5.95, 1.9, -0.3, 0.09, 6.1, 0.09);
    add(1, 5.45, 4.9, 0.05, 1.05, 0.065, 0.065);
    add(1, 4.98, 4.84, 0.18, 0.5, 0.13, 0.38);
    for (let x = -15; x < 23; x += 8) {
      add(1, x, 2.7, -8.2, 0.13, 7.7, 0.13);
      add(1, x, 6.5, -4.2, 0.11, 0.13, 8.2);
    }
    // Concrete blocks at the perimeter frame the stage without blocking the panel.
    add(0, -4.4, -0.58, 1.5, 1.8, 1.15, 0.8, -0.12);
    add(3, 7.5, -0.72, 3.8, 1.2, 0.7, 1.0, 0.15);
    const cube = new THREE.BoxGeometry();
    this.owned.push(cube);
    boxes.forEach((transforms, i) => {
      const mesh = new THREE.InstancedMesh(
        cube,
        materials[i],
        transforms.length
      );
      transforms.forEach((transform, j) => mesh.setMatrixAt(j, transform));
      mesh.castShadow = i !== 2 && i !== 3;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
      this.owned.push(mesh);
    });
    const wheelGeometry = new THREE.CylinderGeometry(0.29, 0.29, 0.15, 16);
    const wheels = new THREE.InstancedMesh(wheelGeometry, materials[1], 8);
    let index = 0;
    for (const axle of [-1.4, -0.5, 3.7, 4.6]) {
      for (const z of [-0.31, -1.79]) {
        matrix.compose(
          new THREE.Vector3(axle, -0.61, z),
          quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
          new THREE.Vector3(1, 1, 1)
        );
        wheels.setMatrixAt(index++, matrix);
      }
    }
    wheels.castShadow = true;
    wheels.computeBoundingSphere();
    this.root.add(wheels);
    this.owned.push(wheels, wheelGeometry);
    const lampGeometry = new THREE.PlaneGeometry(0.4, 0.22);
    const lampMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd092,
      side: THREE.DoubleSide,
    });
    const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(4.98, 4.765, 0.18);
    this.root.add(lamp);
    this.owned.push(lampGeometry, lampMaterial);
    const light = new THREE.SpotLight(0xffd2a0, 42, 14, 0.7, 0.7, 1.4);
    light.position.set(4.98, 4.72, 0.18);
    light.target.position.set(1.7, 0.4, 0.15);
    this.root.add(light, light.target);
    this.addGrass();
  }

  private addGrass() {
    const random = seededRandom(119);
    const positions: number[] = [],
      shapes: number[] = [];
    for (let i = 0; i < 7200; i++) {
      const x = -13 + random() * 28;
      const z = 0.9 + random() * 7;
      if (Math.abs(z - 5.2) < 1.2 || (x > 5.5 && z < 2)) continue;
      const patch = Math.sin(x * 1.1 + z * 0.8) + Math.cos(z * 1.8 - x * 0.4);
      if (patch < 0.35) continue;
      const height = 0.12 + random() * 0.32;
      const width = 0.012 + random() * 0.018;
      for (const [side, tip] of [
        [-1, 0],
        [1, 0],
        [0.15, 1],
      ]) {
        positions.push(x, -1.1, z);
        shapes.push(side * width, tip, height, random());
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute('blade', new THREE.Float32BufferAttribute(shapes, 4));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(1, 0, 4), 23);
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        time: this.time,
        drone: this.downwash,
        ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      },
      fog: true,
      vertexShader: `
        uniform float time; uniform vec3 drone; attribute vec4 blade;
        varying float vTip; varying float vShade;
        #include <fog_pars_vertex>
        void main() {
          vec3 root = position;
          vec2 toCamera = normalize(cameraPosition.xz - root.xz);
          vec3 side = vec3(toCamera.y, 0., -toCamera.x);
          float gust = sin(root.x*.65+root.z*.38-time*1.3)*.32 + sin(root.x*.3-time*.61+1.8)*.2;
          vec2 delta = root.xz - drone.xz;
          float wash = exp(-dot(delta, delta)*1.4) * exp(-max(0., drone.y+1.1)*.65);
          vec2 bend = vec2(gust, gust*.32)*.6 + delta/max(length(delta),.01)*wash*1.6;
          vec3 p = root + side*blade.x + vec3(bend.x, 1./(1.+length(bend)*.7), bend.y)*blade.y*blade.z;
          vTip = blade.y; vShade = blade.w;
          vec4 mvPosition = modelViewMatrix * vec4(p,1.);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        varying float vTip; varying float vShade;
        #include <fog_pars_fragment>
        void main() {
          vec3 c = mix(vec3(.055,.085,.061),vec3(.23,.28,.12),vTip)*(.75+vShade*.25);
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.root.add(new THREE.Mesh(geometry, material));
    this.owned.push(geometry, material);
  }

  update(time: number, body: { x: number; y: number; z: number }) {
    this.time.value = time;
    this.downwash.value.set(body.x, body.y, body.z);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    this.owned.forEach((resource) => resource.dispose());
  }
}
