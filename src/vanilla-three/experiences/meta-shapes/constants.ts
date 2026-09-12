export type GeometryType =
  | 'box'
  | 'sphere'
  | 'cylinder'
  | 'cone'
  | 'icosahedron'
  | 'octahedron'
  | 'tetrahedron'
  | 'dodecahedron';

export type MaterialRenderMode = 'solid' | 'wireframe' | 'edges' | 'both';

export type ColorMode =
  | 'original'
  | 'palette'
  | 'rainbow'
  | 'distance'
  | 'position';

export type MouseEffectType =
  | 'attraction'
  | 'repulsion'
  | 'scale'
  | 'colorWave'
  | 'rotationInfluence'
  | 'heightWave'
  | 'combined';

export type FormationType =
  | 'cube'
  | 'sphere'
  | 'cylinder'
  | 'plane'
  | 'helix'
  | 'random'
  | 'torus'
  | 'wave'
  | 'tesseract';

export interface ColorPalette {
  name: string;
  hues: number[]; // Array of hue values (0-1)
  saturations: number[]; // Array of saturation values (0-1)
  lightnesses: number[]; // Array of lightness values (0-1)
}

export interface ColorConfig {
  mode: ColorMode;
  paletteIndex: number;
  baseHue: number;
  hueRange: number;
  saturation: number;
  lightness: number;
  noiseInfluence: number;
  timeInfluence: number;
}

export interface RotationConfig {
  enabled: boolean;
  rotationSpeed: number;
  noiseInfluenceX: number;
  noiseInfluenceY: number;
  noiseInfluenceZ: number;
  timeInfluence: number;
  individualRotation: boolean;
}

export interface MaterialConfig {
  renderMode: MaterialRenderMode;
  wireframeColor: number;
  edgesColor: number;
  wireframeLinewidth: number;
  wireframeAlpha: number;
  edgesAlpha: number;
}

export interface GeometryConfig {
  type: GeometryType;
  size: number;
  detail?: number; // for polyhedron geometries
  height?: number; // for cylinder/cone
  radiusTop?: number; // for cylinder/cone
  radiusBottom?: number; // for cylinder/cone
  radialSegments?: number; // for sphere/cylinder/cone
  heightSegments?: number; // for sphere/cylinder/cone
  widthSegments?: number; // for sphere
  phiLength?: number; // for sphere
  thetaLength?: number; // for sphere
}

export interface FormationConfig {
  type: FormationType;
  density: number; // Controls how tightly packed instances are
  radius?: number; // For sphere, cylinder, torus
  height?: number; // For cylinder, helix
  turns?: number; // For helix, wave
  amplitude?: number; // For wave
  frequency?: number; // For wave
  randomSeed?: number; // For random formation
  // Tesseract-specific properties
  tesseractScale?: number; // Scale factor for tesseract
  projectionType?: 'stereographic' | 'orthographic'; // 4D to 3D projection method
  rotationW?: number; // Rotation angle in 4D W plane
  timeRotation?: boolean; // Enable time-based 4D rotation
}

export interface InstanceMeshConfig {
  countPerSide: number;
  spacing: number;
  geometry: GeometryConfig;
  material: MaterialConfig;
  formation: FormationConfig;
}

export interface CameraConfig {
  fov: number;
  position: [number, number, number];
  target: [number, number, number];
}

export interface LightConfig {
  ambientIntensity: number;
  directionalIntensity: number;
  directionalPosition: [number, number, number];
}

export interface MouseInteractionConfig {
  enabled: boolean;
  effectType: MouseEffectType;
  intensity: number;
  radius: number; // Base radius of mouse influence
  falloffPower: number; // How quickly the effect falls off with distance
  attractionStrength: number; // For attraction/repulsion effects
  scaleMultiplier: number; // For scale effects
  colorWaveSpeed: number; // For color wave effects
  rotationMultiplier: number; // For rotation influence
  heightWaveAmplitude: number; // For height wave effects
  smoothingFactor: number; // For smooth transitions
  // Trail settings
  trailEnabled: boolean; // Enable mouse trail effects
  trailLength: number; // Number of trail points to keep
  trailFadeTime: number; // How long trail points last (in seconds)
  trailInfluenceStrength: number; // How much trail points influence the effect
  // Dynamic radius settings
  radiusNoiseScale: number; // Scale for radius noise variation
  radiusNoiseAmplitude: number; // How much the radius can vary
  radiusSinFrequency: number; // Frequency of sine wave variation
  radiusSinAmplitude: number; // Amplitude of sine wave variation
  // Curl noise settings
  curlNoiseScale: number; // Scale for curl noise field
  curlNoiseStrength: number; // How much curl noise affects the influence area
}

export interface HandTrackingConfig {
  enabled: boolean;
  replaceMouseInteraction: boolean; // If true, hand tracking takes priority over mouse
  minDetectionConfidence: number; // Minimum confidence for hand detection
  minTrackingConfidence: number; // Minimum confidence for hand tracking
  maxNumHands: number; // Maximum number of hands to track
  modelComplexity: number; // 0 or 1, higher = more accurate but slower
  // Gesture settings
  pinchThreshold: number; // Distance threshold for pinch gesture
  gestureIntensityMultipliers: {
    pinch: number; // Multiplier when pinching
    point: number; // Multiplier when pointing
    fist: number; // Multiplier when making a fist
    open: number; // Multiplier for open hand
  };
  // Depth control settings
  depthSensitivity: number; // How much the Z depth from MediaPipe affects position
  depthSmoothing: number; // Smoothing factor for depth changes
  // Hand tracking specific effects
  enableGestureEffects: boolean; // Enable different effects for different gestures
  showHandFeedback: boolean; // Show visual feedback for hand tracking
}

export interface PostProcessingConfig {
  enabled: boolean;
  bloom: {
    enabled: boolean;
    strength: number;
    radius: number;
    threshold: number;
  };
  chromaticAberration: {
    enabled: boolean;
    strength: number;
  };
  filmGrain: {
    enabled: boolean;
    intensity: number;
  };
  afterimage: {
    enabled: boolean;
    damp: number;
  };
  mirror: {
    enabled: boolean;
    type:
      | 'horizontal'
      | 'vertical'
      | 'kaleidoscope'
      | 'radial'
      | 'diagonal'
      | 'quadrant'
      | 'center';
    intensity: number;
    segments?: number; // For kaleidoscope and radial modes
    offset?: number; // For positioning the mirror line/center
  };
}

export interface MetaShapesConfig {
  instanceMesh: InstanceMeshConfig;
  camera: CameraConfig;
  light: LightConfig;
  color: ColorConfig;
  rotation: RotationConfig;
  mouseInteraction: MouseInteractionConfig;
  handTracking: HandTrackingConfig;
  postProcessing: PostProcessingConfig;
}

// Color palettes
export const colorPalettes: ColorPalette[] = [
  {
    name: 'Original',
    hues: [0.95], // Purple/magenta
    saturations: [1.0],
    lightnesses: [0.2],
  },
  {
    name: 'Mint Green',
    hues: [0.4, 0.45, 0.5], // Green to cyan range
    saturations: [0.6, 0.8, 1.0],
    lightnesses: [0.3, 0.5, 0.7],
  },
  {
    name: 'Rubine Red',
    hues: [0.9, 0.95, 0.0], // Magenta to red range
    saturations: [0.8, 1.0, 0.9],
    lightnesses: [0.2, 0.4, 0.6],
  },
  {
    name: 'Mint & Rubine',
    hues: [0.4, 0.45, 0.9, 0.95, 0.0], // Mix of mint greens and rubine reds
    saturations: [0.7, 0.9, 0.8, 1.0, 0.9],
    lightnesses: [0.3, 0.5, 0.3, 0.4, 0.5],
  },
  {
    name: 'Ocean',
    hues: [0.5, 0.55, 0.6, 0.65], // Blue to cyan
    saturations: [0.7, 0.8, 0.9, 1.0],
    lightnesses: [0.2, 0.3, 0.4, 0.5],
  },
  {
    name: 'Sunset',
    hues: [0.05, 0.1, 0.15, 0.9], // Orange to red
    saturations: [0.8, 0.9, 1.0, 0.8],
    lightnesses: [0.3, 0.4, 0.5, 0.4],
  },
];

export const metaShapesConf: MetaShapesConfig = {
  instanceMesh: {
    countPerSide: 20,
    spacing: 1.0,
    geometry: {
      type: 'box',
      size: 0.5,
      detail: 0,
      height: 1.0,
      radiusTop: 0.5,
      radiusBottom: 0.5,
      radialSegments: 8,
      heightSegments: 1,
      widthSegments: 8,
      phiLength: Math.PI * 2,
      thetaLength: Math.PI,
    },
    material: {
      renderMode: 'solid',
      wireframeColor: 0x00ff00,
      edgesColor: 0xffffff,
      wireframeLinewidth: 1,
      wireframeAlpha: 0.5,
      edgesAlpha: 0.5,
    },
    formation: {
      type: 'cube',
      density: 1.0,
      radius: 8.0,
      height: 16.0,
      turns: 3,
      amplitude: 2.0,
      frequency: 0.5,
      randomSeed: 42,
    },
  },
  camera: {
    fov: 75,
    position: [0, 2, 15],
    target: [0, 0, 0],
  },
  light: {
    ambientIntensity: 0.5,
    directionalIntensity: 1,
    directionalPosition: [5, 5, 5],
  },
  color: {
    mode: 'original',
    paletteIndex: 0,
    baseHue: 0.618,
    hueRange: 0.3,
    saturation: 1.0,
    lightness: 0.2,
    noiseInfluence: 0.1,
    timeInfluence: 0.05,
  },
  rotation: {
    enabled: true,
    rotationSpeed: 1.0,
    noiseInfluenceX: 0.5,
    noiseInfluenceY: 0.3,
    noiseInfluenceZ: 0.2,
    timeInfluence: 0.1,
    individualRotation: true,
  },
  mouseInteraction: {
    enabled: true,
    effectType: 'combined',
    intensity: 0.8,
    radius: 8.0,
    falloffPower: 1.5,
    attractionStrength: 0.5,
    scaleMultiplier: 0.8,
    colorWaveSpeed: 1.6,
    rotationMultiplier: 1.2,
    heightWaveAmplitude: 1.2,
    smoothingFactor: 0.3,
    trailEnabled: true,
    trailLength: 10,
    trailFadeTime: 2.5,
    trailInfluenceStrength: 0.4,
    radiusNoiseScale: 0.05,
    radiusNoiseAmplitude: 0.3,
    radiusSinFrequency: 0.3,
    radiusSinAmplitude: 0.3,
    curlNoiseScale: 0.05,
    curlNoiseStrength: 0.3,
  },
  handTracking: {
    enabled: false,
    replaceMouseInteraction: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.3,
    maxNumHands: 1,
    modelComplexity: 1,
    pinchThreshold: 0.05,
    gestureIntensityMultipliers: {
      pinch: 2.0,
      point: 1.5,
      fist: 0.5,
      open: 1.0,
    },
    depthSensitivity: 20.0,
    depthSmoothing: 0.1,
    enableGestureEffects: true,
    showHandFeedback: true,
  },
  postProcessing: {
    enabled: true,
    bloom: {
      enabled: true,
      strength: 0.2,
      radius: 0.2,
      threshold: 0.1,
    },
    chromaticAberration: {
      enabled: true,
      strength: 1.0,
    },
    filmGrain: {
      enabled: true,
      intensity: 0.3,
    },
    afterimage: {
      enabled: false,
      damp: 0.5,
    },
    mirror: {
      enabled: false,
      type: 'horizontal',
      intensity: 1.0,
      segments: 6,
      offset: 0.5,
    },
  },
};

// Note: Global state management for Leva controls has been removed
// All controls are now handled via Tweakpane in the experience classes
