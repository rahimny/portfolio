import perlinVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import kaleidoscopeFragmentShader from '@/vanilla-three/shaders/gallery/effects/kaleidoscope-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';

export const kaleidoscopeShader: ShaderDefinition = {
  id: 'kaleidoscope',
  vertexShader: perlinVertexShader,
  fragmentShader: kaleidoscopeFragmentShader,
  geometry: 'plane',
  uniforms: {
    uSegments: { value: 6.0 },
    uRotation: { value: 0.0 },
    uScale: { value: 1.0 },
  },
  setupTweakpane: (pane, uniforms) => {
    const defaults = {
      segments: 6.0,
      rotation: 0.0,
      scale: 1.0,
    };

    const settings = {
      segments: uniforms.uSegments.value,
      rotation: uniforms.uRotation.value,
      scale: uniforms.uScale.value,
    };

    pane
      .addBinding(settings, 'segments', {
        label: 'Segments',
        min: 3.0,
        max: 20.0,
        step: 1.0,
      })
      .on('change', (ev) => {
        uniforms.uSegments.value = ev.value;
      });

    pane
      .addBinding(settings, 'rotation', {
        label: 'Rotation',
        min: 0.0,
        max: 6.28,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uRotation.value = ev.value;
      });

    pane
      .addBinding(settings, 'scale', {
        label: 'Scale',
        min: 0.2,
        max: 5.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uScale.value = ev.value;
      });

    pane
      .addButton({
        title: 'Reset to Defaults',
      })
      .on('click', () => {
        uniforms.uSegments.value = defaults.segments;
        uniforms.uRotation.value = defaults.rotation;
        uniforms.uScale.value = defaults.scale;

        Object.assign(settings, defaults);
        pane.refresh();
      });
  },
};
