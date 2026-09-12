import * as THREE from 'three';
import chromaticAberrationVertexShader from './chromatic-aberration-vertex.glsl';
import chromaticAberrationFragmentShader from './chromatic-aberration-fragment.glsl';
import mirrorVertexShader from './mirror-vertex.glsl';
import mirrorFragmentShader from './mirror-fragment.glsl';

export const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    uStrength: { value: 0.001 },
  },
  vertexShader: chromaticAberrationVertexShader,
  fragmentShader: chromaticAberrationFragmentShader,
};

export const MirrorShader = {
  uniforms: {
    tDiffuse: { value: null },
    uMirrorType: { value: 0 }, // 0=horizontal, 1=vertical, 2=kaleidoscope, etc.
    uIntensity: { value: 1.0 },
    uSegments: { value: 6.0 },
    uOffset: { value: 0.5 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: mirrorVertexShader,
  fragmentShader: mirrorFragmentShader,
};
