import perlinVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import perlinWavesFragmentShader from '@/vanilla-three/shaders/gallery/noise/perlin-waves-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';

export const perlinWavesShader: ShaderDefinition = {
  id: 'perlin-waves',
  vertexShader: perlinVertexShader,
  fragmentShader: perlinWavesFragmentShader,
  geometry: 'plane',
  uniforms: {
    uSpeed: { value: 1.0 },
    uAmplitude: { value: 0.5 },
    uFrequency: { value: 3.0 },
  },
  setupTweakpane: (pane, uniforms) => {
    const defaults = {
      speed: 1.0,
      amplitude: 0.5,
      frequency: 3.0,
    };

    const settings = {
      speed: uniforms.uSpeed.value,
      amplitude: uniforms.uAmplitude.value,
      frequency: uniforms.uFrequency.value,
    };

    const waveFolder = pane.addFolder({
      title: 'Wave Properties',
      expanded: true,
    });

    waveFolder
      .addBinding(settings, 'speed', {
        label: 'Animation Speed',
        min: 0.1,
        max: 3.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uSpeed.value = ev.value;
      });

    waveFolder
      .addBinding(settings, 'amplitude', {
        label: 'Wave Amplitude',
        min: 0.1,
        max: 2.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uAmplitude.value = ev.value;
      });

    waveFolder
      .addBinding(settings, 'frequency', {
        label: 'Wave Frequency',
        min: 1.0,
        max: 10.0,
        step: 0.5,
      })
      .on('change', (ev) => {
        uniforms.uFrequency.value = ev.value;
      });

    pane
      .addButton({
        title: 'Reset to Defaults',
      })
      .on('click', () => {
        uniforms.uSpeed.value = defaults.speed;
        uniforms.uAmplitude.value = defaults.amplitude;
        uniforms.uFrequency.value = defaults.frequency;

        settings.speed = defaults.speed;
        settings.amplitude = defaults.amplitude;
        settings.frequency = defaults.frequency;
        pane.refresh();
      });
  },
};
