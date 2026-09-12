import * as THREE from 'three';
import perlinVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import gasketFragmentShader from '@/vanilla-three/shaders/gallery/geometric/gasket-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';
import { GASKET_CIRCLE_CAP, packGasket } from './packGasket';

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function circleUniformArray(): {
  circles: THREE.Vector4[];
  count: number;
  kMax: number;
} {
  const packed = packGasket();
  const kMax = packed.reduce((m, c) => Math.max(m, Math.abs(c.k)), 1);
  const circles = Array.from({ length: GASKET_CIRCLE_CAP }, (_, i) => {
    const c = packed[i];
    if (!c) return new THREE.Vector4(0, 0, 0, -1);
    return new THREE.Vector4(c.x, c.y, Math.abs(1 / c.k), Math.abs(c.k));
  });
  return { circles, count: packed.length, kMax };
}

const PACKED = circleUniformArray();
const REDUCED = reducedMotion();
const GROW_RATE = 0.2;

function growthFromTime(time: number, speed: number): number {
  return 1 - Math.exp(-time * Math.max(speed, 0) * GROW_RATE);
}

export const gasketShader: ShaderDefinition = {
  id: 'gasket',
  vertexShader: perlinVertexShader,
  fragmentShader: gasketFragmentShader,
  geometry: 'plane',
  uniforms: {
    uCircles: { value: PACKED.circles },
    uCircleCount: { value: PACKED.count },
    uKMax: { value: PACKED.kMax },
    uGrowth: { value: REDUCED ? 1.0 : 0.0 },
    uSpeed: { value: REDUCED ? 0.0 : 1.0 },
    uAutoGrow: { value: REDUCED ? 0.0 : 1.0 },
    uDetail: { value: 1.0 },
    uStroke: { value: 1.0 },
    uLayer: { value: 1.15 },
    uFill: { value: 0.35 },
    uInfluence: { value: 0.5 },
    uDrift: { value: 0.0 },
    uInvert: { value: 0.0 },
    uPaper: { value: new THREE.Vector3(0.969, 0.961, 0.945) },
    uInk: { value: new THREE.Vector3(0.145, 0.137, 0.125) },
    uBrand: { value: new THREE.Vector3(1.0, 0.2118, 0.0) },
  },
  setupTweakpane: (pane, uniforms) => {
    const defaults = {
      autoGrow: !REDUCED,
      growth: REDUCED ? 1.0 : 0.0,
      speed: REDUCED ? 0.0 : 1.0,
      detail: 1.0,
      stroke: 1.0,
      layer: 1.15,
      fill: 0.35,
      influence: 0.5,
      drift: 0.0,
      invert: false,
    };

    const settings = {
      autoGrow: uniforms.uAutoGrow.value > 0.5,
      growth: uniforms.uGrowth.value as number,
      speed: uniforms.uSpeed.value as number,
      detail: uniforms.uDetail.value as number,
      stroke: uniforms.uStroke.value as number,
      layer: uniforms.uLayer.value as number,
      fill: uniforms.uFill.value as number,
      influence: uniforms.uInfluence.value as number,
      drift: uniforms.uDrift.value as number,
      invert: uniforms.uInvert.value > 0.5,
    };

    const growthFolder = pane.addFolder({
      title: 'Growth',
      expanded: true,
    });

    let syncing = false;

    growthFolder
      .addBinding(settings, 'autoGrow', { label: 'Auto grow' })
      .on('change', (ev) => {
        uniforms.uAutoGrow.value = ev.value ? 1.0 : 0.0;
        if (syncing || ev.value) return;
        const t = (uniforms.uTime?.value as number) ?? 0;
        const frozen = growthFromTime(t, uniforms.uSpeed.value as number);
        uniforms.uGrowth.value = frozen;
        settings.growth = frozen;
        syncing = true;
        pane.refresh();
        syncing = false;
      });

    growthFolder
      .addBinding(settings, 'growth', {
        label: 'Growth',
        min: 0.0,
        max: 1.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uGrowth.value = ev.value;
        uniforms.uAutoGrow.value = 0.0;
        settings.autoGrow = false;
        syncing = true;
        pane.refresh();
        syncing = false;
      });

    growthFolder
      .addBinding(settings, 'speed', {
        label: 'Speed',
        min: 0.0,
        max: 3.0,
        step: 0.05,
      })
      .on('change', (ev) => {
        uniforms.uSpeed.value = ev.value;
      });

    growthFolder
      .addBinding(settings, 'detail', {
        label: 'Detail',
        min: 0.0,
        max: 1.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uDetail.value = ev.value;
      });

    const drawFolder = pane.addFolder({
      title: 'Construction',
      expanded: true,
    });

    drawFolder
      .addBinding(settings, 'stroke', {
        label: 'Stroke',
        min: 0.4,
        max: 3.0,
        step: 0.05,
      })
      .on('change', (ev) => {
        uniforms.uStroke.value = ev.value;
      });

    drawFolder
      .addBinding(settings, 'layer', {
        label: 'Layers',
        min: 0.25,
        max: 2.0,
        step: 0.05,
      })
      .on('change', (ev) => {
        uniforms.uLayer.value = ev.value;
      });

    drawFolder
      .addBinding(settings, 'fill', {
        label: 'Fill',
        min: 0.0,
        max: 1.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uFill.value = ev.value;
      });

    drawFolder
      .addBinding(settings, 'influence', {
        label: 'Pointer',
        min: 0.0,
        max: 0.7,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uInfluence.value = ev.value;
      });

    drawFolder
      .addBinding(settings, 'drift', {
        label: 'Drift',
        min: 0.0,
        max: 0.4,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uDrift.value = ev.value;
      });

    drawFolder
      .addBinding(settings, 'invert', { label: 'Invert' })
      .on('change', (ev) => {
        uniforms.uInvert.value = ev.value ? 1.0 : 0.0;
      });

    pane
      .addButton({
        title: 'Reset to Defaults',
      })
      .on('click', () => {
        uniforms.uAutoGrow.value = defaults.autoGrow ? 1.0 : 0.0;
        uniforms.uGrowth.value = defaults.growth;
        uniforms.uSpeed.value = defaults.speed;
        uniforms.uDetail.value = defaults.detail;
        uniforms.uStroke.value = defaults.stroke;
        uniforms.uLayer.value = defaults.layer;
        uniforms.uFill.value = defaults.fill;
        uniforms.uInfluence.value = defaults.influence;
        uniforms.uDrift.value = defaults.drift;
        uniforms.uInvert.value = defaults.invert ? 1.0 : 0.0;
        Object.assign(settings, defaults);
        pane.refresh();
      });
  },
};
