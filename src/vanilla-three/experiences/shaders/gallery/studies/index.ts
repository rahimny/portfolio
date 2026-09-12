import { getVariant } from '@/features/lab/registry';
import baseVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import sutureFragment from '@/vanilla-three/shaders/gallery/studies/suture-fragment.glsl';
import isofieldFragment from '@/vanilla-three/shaders/gallery/studies/isofield-fragment.glsl';
import impastoFragment from '@/vanilla-three/shaders/gallery/studies/impasto-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';
import { StudyDriver, setupStudyPane, type StudyControl } from './StudyDriver';

export function study(
  slug: string,
  fragmentShader: string,
  controls: readonly StudyControl[],
  presets: Record<string, Record<string, number>>,
  maxPixels: number,
  options: Partial<
    Pick<ShaderDefinition, 'geometry' | 'pointCount' | 'vertexShader'>
  > = {}
): ShaderDefinition {
  const metadata = getVariant('shader-gallery', slug)!;
  return {
    id: metadata.slug,
    vertexShader: options.vertexShader ?? baseVertexShader,
    fragmentShader,
    geometry: options.geometry ?? 'plane',
    pointCount: options.pointCount,
    pointerTracking: false,
    pixelRatioCap: 1.25,
    maxPixels,
    uniforms: {
      uClock: { value: 8 },
      uSeed: { value: 1 },
      uFocusX: { value: 0 },
      uFocusY: { value: 0 },
      ...Object.fromEntries(
        controls.map((c) => [c.uniform, { value: c.value }])
      ),
    },
    createDriver: (runtime) => new StudyDriver(runtime, controls),
    setupTweakpane: (pane, _uniforms, driver) =>
      setupStudyPane(pane, driver as StudyDriver, controls, presets),
  };
}

export const sutureShader = study(
  'suture',
  sutureFragment,
  [
    { uniform: 'uTension', label: 'Tension', value: 0.65, min: 0, max: 2 },
    { uniform: 'uWeave', label: 'Pleats', value: 18, min: 6, max: 36, step: 1 },
    { uniform: 'uSplit', label: 'Open seam', value: 0.32, min: 0, max: 1.3 },
  ],
  {
    Bound: { uTension: 0.3, uWeave: 12, uSplit: 0 },
    Unravelling: { uTension: 1.4, uWeave: 28, uSplit: 0.7 },
    'Fine stitch': { uTension: 0.75, uWeave: 36, uSplit: 1.1 },
  },
  850_000
);

export const isofieldShader = study(
  'isofield',
  isofieldFragment,
  [
    {
      uniform: 'uRelief',
      label: 'Wave height',
      value: 1.15,
      min: 0.35,
      max: 1.65,
    },
    {
      uniform: 'uContours',
      label: 'Terraces',
      value: 28,
      min: 8,
      max: 46,
      step: 1,
    },
    { uniform: 'uSection', label: 'Slice ceiling', value: 1, min: 0.1, max: 1 },
  ],
  {
    'Standing waves': { uRelief: 1.15, uContours: 28, uSection: 1 },
    Excavation: { uRelief: 1.6, uContours: 40, uSection: 0.45 },
    'Low tide': { uRelief: 0.55, uContours: 12, uSection: 1 },
  },
  1_100_000
);

export const impastoShader = study(
  'impasto',
  impastoFragment,
  [
    { uniform: 'uLoad', label: 'Load', value: 0.78, min: 0.15, max: 1.6 },
    { uniform: 'uSplay', label: 'Splay', value: 0.35, min: 0, max: 1 },
    { uniform: 'uWet', label: 'Wetness', value: 0.45, min: 0, max: 1 },
    { uniform: 'uBrush', label: 'Brush size', value: 1, min: 0.55, max: 1.9 },
  ],
  {
    'Alla prima': { uLoad: 0.78, uSplay: 0.35, uWet: 0.45, uBrush: 1 },
    Scumble: { uLoad: 0.36, uSplay: 0.88, uWet: 0.12, uBrush: 0.72 },
    'Palette knife': { uLoad: 1.45, uSplay: 0.05, uWet: 0.88, uBrush: 1.65 },
  },
  900_000
);
