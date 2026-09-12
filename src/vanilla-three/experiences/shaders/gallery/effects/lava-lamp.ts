import perlinVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import lavaLampFragmentShader from '@/vanilla-three/shaders/gallery/effects/lava-lamp-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';

export const lavaLampShader: ShaderDefinition = {
  id: 'lava-lamp',
  vertexShader: perlinVertexShader,
  fragmentShader: lavaLampFragmentShader,
  geometry: 'plane',
  uniforms: {
    uBlobCount: { value: 4.0 },
    uBlobSize: { value: 0.08 },
    uFlowSpeed: { value: 1.0 },
  },
  setupTweakpane: (pane, uniforms) => {
    const defaults = {
      blobCount: 4.0,
      blobSize: 0.08,
      flowSpeed: 1.0,
    };

    const settings = {
      blobCount: uniforms.uBlobCount.value,
      blobSize: uniforms.uBlobSize.value,
      flowSpeed: uniforms.uFlowSpeed.value,
    };

    pane
      .addBinding(settings, 'blobCount', {
        label: 'Blob Count',
        min: 1,
        max: 8,
        step: 1,
      })
      .on('change', (ev) => {
        uniforms.uBlobCount.value = ev.value;
      });

    pane
      .addBinding(settings, 'blobSize', {
        label: 'Blob Size',
        min: 0.02,
        max: 0.2,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uBlobSize.value = ev.value;
      });

    pane
      .addBinding(settings, 'flowSpeed', {
        label: 'Flow Speed',
        min: 0.1,
        max: 3.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uFlowSpeed.value = ev.value;
      });

    pane
      .addButton({
        title: 'Reset to Defaults',
      })
      .on('click', () => {
        uniforms.uBlobCount.value = defaults.blobCount;
        uniforms.uBlobSize.value = defaults.blobSize;
        uniforms.uFlowSpeed.value = defaults.flowSpeed;

        Object.assign(settings, defaults);
        pane.refresh();
      });
  },
};
