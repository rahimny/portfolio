import perlinVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import auroraFragmentShader from '@/vanilla-three/shaders/gallery/artistic/aurora-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';

export const auroraShader: ShaderDefinition = {
  id: 'aurora',
  vertexShader: perlinVertexShader,
  fragmentShader: auroraFragmentShader,
  geometry: 'plane',
  uniforms: {
    uSpeed: { value: 1.0 },
    uIntensity: { value: 1.5 },
    uWaveHeight: { value: 0.3 },
  },
  setupTweakpane: (pane, uniforms) => {
    const defaults = {
      speed: 1.0,
      intensity: 1.5,
      waveHeight: 0.3,
    };

    const settings = {
      speed: uniforms.uSpeed.value,
      intensity: uniforms.uIntensity.value,
      waveHeight: uniforms.uWaveHeight.value,
    };

    const auroraFolder = pane.addFolder({
      title: 'Aurora Properties',
      expanded: true,
    });

    auroraFolder
      .addBinding(settings, 'speed', {
        label: 'Animation Speed',
        min: 0.1,
        max: 3.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uSpeed.value = ev.value;
      });

    auroraFolder
      .addBinding(settings, 'intensity', {
        label: 'Light Intensity',
        min: 0.5,
        max: 3.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uIntensity.value = ev.value;
      });

    auroraFolder
      .addBinding(settings, 'waveHeight', {
        label: 'Wave Height',
        min: 0.1,
        max: 1.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uWaveHeight.value = ev.value;
      });

    pane
      .addButton({
        title: 'Reset to Defaults',
      })
      .on('click', () => {
        uniforms.uSpeed.value = defaults.speed;
        uniforms.uIntensity.value = defaults.intensity;
        uniforms.uWaveHeight.value = defaults.waveHeight;

        Object.assign(settings, defaults);
        pane.refresh();
      });
  },
};
