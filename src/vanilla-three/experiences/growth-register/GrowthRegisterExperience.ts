import * as THREE from 'three';
import { studies } from '@/features/lab/registry';
import { GROWTH_REGISTER_SUBDIVISIONS } from '@/features/lab/growthRegisterConfig';
import { BaseExperience } from '../BaseExperience';

const SIMULATION_HZ = 30;
const INITIAL_STEPS = 150;

interface Surface {
  geometry: THREE.BufferGeometry;
  directions: THREE.Vector3[];
  offsets: Uint32Array;
  neighbours: Uint32Array;
}

interface Palette {
  paper: THREE.Color;
  ink: THREE.Color;
  brand: THREE.Color;
  surface: THREE.Color;
  surface2: THREE.Color;
}

const VERTEX_SHADER = /* glsl */ `
  attribute float aGrowth;
  attribute float aAccent;

  varying vec3 vNormalView;
  varying float vGrowth;
  varying float vAccent;

  void main() {
    float relief = 0.018 + pow(clamp(aGrowth, 0.0, 1.0), 1.45) * 0.22;
    vec3 displaced = position + normal * relief;

    vNormalView = normalize(normalMatrix * normal);
    vGrowth = aGrowth;
    vAccent = aAccent;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const FILL_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uPaper;
  uniform vec3 uSurface;
  uniform vec3 uSurface2;
  uniform vec3 uBrand;

  varying vec3 vNormalView;
  varying float vGrowth;
  varying float vAccent;

  void main() {
    vec3 lightDirection = normalize(vec3(-0.45, 0.7, 0.6));
    float diffuse = 0.72 + max(dot(normalize(vNormalView), lightDirection), 0.0) * 0.28;
    vec3 stock = mix(uSurface2, uSurface, diffuse);
    stock = mix(stock, uPaper, vGrowth * 0.15);

    // Orange remains one fill event: the featured seed and any seed planted by
    // the reader. It never becomes a general-purpose glow or gradient.
    float signal = smoothstep(0.16, 0.72, vAccent * (0.35 + vGrowth));
    vec3 colour = mix(stock, uBrand, signal);

    gl_FragColor = vec4(colour, 1.0);
  }
`;

const WIRE_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uInk;
  varying float vGrowth;

  void main() {
    float opacity = mix(0.2, 0.58, vGrowth);
    gl_FragColor = vec4(uInk, opacity);
  }
`;

/** Convert a CSS custom-property colour through the browser's colour engine. */
function readCssColour(variable: string): THREE.Color {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const context = probe.getContext('2d', { willReadFrequently: true });

  if (!context) return new THREE.Color(0xffffff);

  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(
    r / 255,
    g / 255,
    b / 255,
    THREE.SRGBColorSpace
  );
}

function paletteFromDocument(): Palette {
  return {
    paper: readCssColour('--paper'),
    ink: readCssColour('--ink'),
    brand: readCssColour('--brand'),
    surface: readCssColour('--surface'),
    surface2: readCssColour('--surface-2'),
  };
}

/**
 * Build a welded icosphere and its graph adjacency together. The simulation
 * runs on that graph, so the visible triangular measure and the surface on
 * which the field diffuses are literally the same construction.
 */
function createSurface(subdivisions: number): Surface {
  const phi = (1 + Math.sqrt(5)) / 2;
  const directions = [
    new THREE.Vector3(-1, phi, 0),
    new THREE.Vector3(1, phi, 0),
    new THREE.Vector3(-1, -phi, 0),
    new THREE.Vector3(1, -phi, 0),
    new THREE.Vector3(0, -1, phi),
    new THREE.Vector3(0, 1, phi),
    new THREE.Vector3(0, -1, -phi),
    new THREE.Vector3(0, 1, -phi),
    new THREE.Vector3(phi, 0, -1),
    new THREE.Vector3(phi, 0, 1),
    new THREE.Vector3(-phi, 0, -1),
    new THREE.Vector3(-phi, 0, 1),
  ].map((vertex) => vertex.normalize());

  let faces: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];

  for (let level = 0; level < subdivisions; level += 1) {
    const midpoints = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const cached = midpoints.get(key);
      if (cached !== undefined) return cached;

      const index = directions.length;
      directions.push(
        directions[a].clone().add(directions[b]).multiplyScalar(0.5).normalize()
      );
      midpoints.set(key, index);
      return index;
    };

    const nextFaces: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }

  const positions = new Float32Array(directions.length * 3);
  directions.forEach((direction, index) =>
    direction.toArray(positions, index * 3)
  );

  const index = new Uint32Array(faces.length * 3);
  faces.forEach((face, faceIndex) => index.set(face, faceIndex * 3));

  const adjacency = Array.from(
    { length: directions.length },
    () => new Set<number>()
  );
  for (const [a, b, c] of faces) {
    adjacency[a].add(b).add(c);
    adjacency[b].add(a).add(c);
    adjacency[c].add(a).add(b);
  }

  const offsets = new Uint32Array(directions.length + 1);
  for (let i = 0; i < adjacency.length; i += 1) {
    offsets[i + 1] = offsets[i] + adjacency[i].size;
  }

  const neighbours = new Uint32Array(offsets[offsets.length - 1]);
  adjacency.forEach((set, vertexIndex) => {
    neighbours.set([...set], offsets[vertexIndex]);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute(
    'normal',
    new THREE.BufferAttribute(positions.slice(), 3)
  );
  geometry.setAttribute(
    'aGrowth',
    new THREE.BufferAttribute(new Float32Array(directions.length), 1)
  );
  geometry.setAttribute(
    'aAccent',
    new THREE.BufferAttribute(new Float32Array(directions.length), 1)
  );
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeBoundingSphere();

  return { geometry, directions, offsets, neighbours };
}

function studyDirection(edition: number, count: number): THREE.Vector3 {
  const y = 1 - ((edition - 0.5) / count) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = edition * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(
    Math.cos(theta) * radius,
    y,
    Math.sin(theta) * radius
  ).normalize();
}

export class GrowthRegisterExperience extends BaseExperience {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private group = new THREE.Group();
  private fillMesh!: THREE.Mesh;
  private surface!: Surface;
  private fillMaterial!: THREE.ShaderMaterial;
  private wireMaterial!: THREE.ShaderMaterial;
  private resizeObserver!: ResizeObserver;
  private intersectionObserver!: IntersectionObserver;
  private animationFrameId: number | null = null;
  private lastTime = 0;
  private accumulator = 0;
  private isVisible = true;
  private reducedMotion = false;
  private isPointerDown = false;
  private keyboardSeedSteps = 0;
  private targetDirection: THREE.Vector3 | null = null;
  private pointerTarget = new THREE.Vector2();
  private pointerCurrent = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();

  private chemicalA!: Float32Array;
  private chemicalB!: Float32Array;
  private nextA!: Float32Array;
  private nextB!: Float32Array;
  private accent!: Float32Array;
  private nextAccent!: Float32Array;
  private featuredDirection = new THREE.Vector3(0, 1, 0);

  public async init(): Promise<void> {
    this.reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    this.surface = createSurface(GROWTH_REGISTER_SUBDIVISIONS);
    this.initialiseFields();

    for (let i = 0; i < INITIAL_STEPS; i += 1) this.stepSimulation();

    this.initScene();
    this.initRenderer();
    this.initCamera();
    this.initMeshes();
    this.setupEvents();
    this.publishFields();
    this.render();
    this.updateRunningState();
  }

  private initialiseFields(): void {
    const count = this.surface.directions.length;
    this.chemicalA = new Float32Array(count).fill(1);
    this.chemicalB = new Float32Array(count);
    this.nextA = new Float32Array(count);
    this.nextB = new Float32Array(count);
    this.accent = new Float32Array(count);
    this.nextAccent = new Float32Array(count);

    const featured = studies.find((study) => study.featured) ?? studies[0];
    this.featuredDirection = studyDirection(featured.edition, studies.length);

    for (const study of studies) {
      const direction = studyDirection(study.edition, studies.length);
      // Technique count becomes seed area. The later reaction is emergent, but
      // its starting conditions remain legible against the study record.
      const radius = 0.115 + study.technique.length * 0.018;
      const threshold = Math.cos(radius);
      const featuredSeed = study.slug === featured.slug;

      this.surface.directions.forEach((vertex, index) => {
        if (vertex.dot(direction) < threshold) return;
        this.chemicalA[index] = 0.06;
        this.chemicalB[index] = 0.94;
        if (featuredSeed) this.accent[index] = 1;
      });
    }
  }

  private initScene(): void {
    const palette = paletteFromDocument();
    this.scene = new THREE.Scene();
    this.scene.add(this.group);

    this.fillMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FILL_FRAGMENT_SHADER,
      uniforms: {
        uPaper: { value: palette.paper },
        uSurface: { value: palette.surface },
        uSurface2: { value: palette.surface2 },
        uBrand: { value: palette.brand },
      },
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    this.wireMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: WIRE_FRAGMENT_SHADER,
      uniforms: { uInk: { value: palette.ink } },
      wireframe: true,
      transparent: true,
      depthWrite: false,
    });
  }

  private initRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(this.sizes.pixelRatio);
    this.renderer.setSize(this.sizes.width, this.sizes.height, false);
  }

  private initCamera(): void {
    this.camera = new THREE.PerspectiveCamera(
      31,
      this.sizes.width / this.sizes.height,
      0.1,
      20
    );
    // Enough air to keep the relief inside the square masthead field; the
    // object should sit in the layout, not crop into an image treatment.
    this.camera.position.set(0, 0, 5.1);
    this.camera.lookAt(0, 0, 0);
  }

  private initMeshes(): void {
    this.fillMesh = new THREE.Mesh(this.surface.geometry, this.fillMaterial);
    const wireMesh = new THREE.Mesh(this.surface.geometry, this.wireMaterial);
    wireMesh.scale.setScalar(1.0015);
    this.group.add(this.fillMesh, wireMesh);
    this.group.rotation.set(-0.12, -0.42, 0.05);
  }

  private stepSimulation(): void {
    const { offsets, neighbours } = this.surface;
    const feed = 0.034;
    const kill = 0.061;
    const diffusionA = 0.17;
    const diffusionB = 0.085;
    const dt = 0.9;

    for (let i = 0; i < this.chemicalA.length; i += 1) {
      const start = offsets[i];
      const end = offsets[i + 1];
      let laplaceA = 0;
      let laplaceB = 0;
      let laplaceAccent = 0;

      for (let n = start; n < end; n += 1) {
        const neighbour = neighbours[n];
        laplaceA += this.chemicalA[neighbour] - this.chemicalA[i];
        laplaceB += this.chemicalB[neighbour] - this.chemicalB[i];
        laplaceAccent += this.accent[neighbour] - this.accent[i];
      }

      const inverseDegree = 1 / Math.max(1, end - start);
      laplaceA *= inverseDegree;
      laplaceB *= inverseDegree;
      laplaceAccent *= inverseDegree;

      const a = this.chemicalA[i];
      const b = this.chemicalB[i];
      const reaction = a * b * b;
      this.nextA[i] = THREE.MathUtils.clamp(
        a + (diffusionA * laplaceA - reaction + feed * (1 - a)) * dt,
        0,
        1
      );
      this.nextB[i] = THREE.MathUtils.clamp(
        b + (diffusionB * laplaceB + reaction - (kill + feed) * b) * dt,
        0,
        1
      );
      this.nextAccent[i] = THREE.MathUtils.clamp(
        (this.accent[i] + laplaceAccent * 0.045) * 0.998,
        0,
        1
      );
    }

    [this.chemicalA, this.nextA] = [this.nextA, this.chemicalA];
    [this.chemicalB, this.nextB] = [this.nextB, this.chemicalB];
    [this.accent, this.nextAccent] = [this.nextAccent, this.accent];

    this.injectAt(this.featuredDirection, 0.075, false);
    if (this.isPointerDown && this.targetDirection) {
      this.injectAt(this.targetDirection, 0.09, true);
    }
    if (this.keyboardSeedSteps > 0 && this.targetDirection) {
      this.injectAt(this.targetDirection, 0.09, true);
      this.keyboardSeedSteps -= 1;
    }
  }

  private injectAt(
    direction: THREE.Vector3,
    radius: number,
    useSignal: boolean
  ): void {
    const threshold = Math.cos(radius);
    for (let i = 0; i < this.surface.directions.length; i += 1) {
      if (this.surface.directions[i].dot(direction) < threshold) continue;
      this.chemicalA[i] = Math.min(this.chemicalA[i], 0.08);
      this.chemicalB[i] = Math.max(this.chemicalB[i], 0.92);
      if (useSignal) this.accent[i] = 1;
      else this.accent[i] = Math.max(this.accent[i], 0.82);
    }
  }

  private publishFields(): void {
    const growth = this.surface.geometry.getAttribute(
      'aGrowth'
    ) as THREE.BufferAttribute;
    const accent = this.surface.geometry.getAttribute(
      'aAccent'
    ) as THREE.BufferAttribute;

    for (let i = 0; i < this.chemicalB.length; i += 1) {
      growth.setX(i, THREE.MathUtils.smoothstep(this.chemicalB[i], 0.05, 0.72));
      accent.setX(i, this.accent[i]);
    }
    growth.needsUpdate = true;
    accent.needsUpdate = true;
  }

  private setupEvents(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.updateSizes();
      this.camera.aspect = this.sizes.width / this.sizes.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(this.sizes.pixelRatio);
      this.renderer.setSize(this.sizes.width, this.sizes.height, false);
      this.render();
    });
    this.resizeObserver.observe(this.canvas);

    this.intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        this.isVisible = entry.isIntersecting;
        this.updateRunningState();
      },
      { threshold: 0.05 }
    );
    this.intersectionObserver.observe(this.canvas);

    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown);
    this.canvas.addEventListener('pointermove', this.handlePointerMove);
    this.canvas.addEventListener('pointerup', this.handlePointerUp);
    this.canvas.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.addEventListener('keydown', this.handleKeyDown);
    this.canvas.addEventListener('blur', this.handleBlur);
  }

  private handleVisibilityChange = (): void => this.updateRunningState();

  private updatePointer(event: PointerEvent): void {
    const bounds = this.canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    this.pointerTarget.set(x, y);

    this.updateTargetFromPointer();
  }

  private updateTargetFromPointer(): void {
    this.raycaster.setFromCamera(this.pointerTarget, this.camera);
    const hit = this.raycaster.intersectObject(this.fillMesh, false)[0];
    if (!hit) {
      this.targetDirection = null;
      return;
    }

    this.targetDirection = this.group
      .worldToLocal(hit.point.clone())
      .normalize();
  }

  private handlePointerDown = (event: PointerEvent): void => {
    this.isPointerDown = true;
    this.canvas.focus();
    this.canvas.setPointerCapture(event.pointerId);
    this.updatePointer(event);
  };

  private handlePointerMove = (event: PointerEvent): void => {
    this.updatePointer(event);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    this.isPointerDown = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private handlePointerLeave = (): void => {
    if (!this.isPointerDown) {
      this.pointerTarget.set(0, 0);
      this.targetDirection = null;
    }
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const step = 0.1;
    if (event.key === 'ArrowLeft') this.pointerTarget.x -= step;
    else if (event.key === 'ArrowRight') this.pointerTarget.x += step;
    else if (event.key === 'ArrowUp') this.pointerTarget.y += step;
    else if (event.key === 'ArrowDown') this.pointerTarget.y -= step;
    else if (event.key === 'Enter' || event.key === ' ') {
      this.keyboardSeedSteps = 10;
    } else return;

    event.preventDefault();
    this.pointerTarget.clampScalar(-0.82, 0.82);
    this.updateTargetFromPointer();
  };

  private handleBlur = (): void => {
    this.pointerTarget.set(0, 0);
    this.targetDirection = null;
    this.keyboardSeedSteps = 0;
  };

  private updateRunningState(): void {
    const shouldRun = !this.reducedMotion && this.isVisible && !document.hidden;
    if (shouldRun && this.animationFrameId === null) {
      this.lastTime = performance.now();
      this.animationFrameId = requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private tick = (now: number): void => {
    const delta = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.accumulator += delta;

    const interval = 1 / SIMULATION_HZ;
    while (this.accumulator >= interval) {
      this.stepSimulation();
      this.accumulator -= interval;
    }
    this.publishFields();

    const damping = 1 - Math.exp(-delta * 3.5);
    this.pointerCurrent.lerp(this.pointerTarget, damping);
    this.group.rotation.x = THREE.MathUtils.lerp(
      this.group.rotation.x,
      -0.12 - this.pointerCurrent.y * 0.12,
      damping
    );
    this.group.rotation.y += delta * 0.026;
    this.group.rotation.z = THREE.MathUtils.lerp(
      this.group.rotation.z,
      0.05 + this.pointerCurrent.x * 0.08,
      damping
    );

    this.render();
    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    if (this.animationFrameId !== null)
      cancelAnimationFrame(this.animationFrameId);
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    this.canvas.removeEventListener('pointerup', this.handlePointerUp);
    this.canvas.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('pointerleave', this.handlePointerLeave);
    this.canvas.removeEventListener('keydown', this.handleKeyDown);
    this.canvas.removeEventListener('blur', this.handleBlur);
    this.surface?.geometry.dispose();
    this.fillMaterial?.dispose();
    this.wireMaterial?.dispose();
    this.renderer?.dispose();
  }
}
