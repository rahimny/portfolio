import perlinVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import juliaSetFragmentShader from '@/vanilla-three/shaders/gallery/fractals/julia-set-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';

export const juliaSetShader: ShaderDefinition = {
  id: 'julia-set',
  vertexShader: perlinVertexShader,
  fragmentShader: juliaSetFragmentShader,
  geometry: 'plane',
  uniforms: {
    uC: { value: [-0.4, 0.6] },
    uZoom: { value: 1.0 },
    uMaxIterations: { value: 80 },
  },
  setupTweakpane: (pane, uniforms) => {
    const defaults = {
      cX: -0.4,
      cY: 0.6,
      zoom: 1.0,
      maxIterations: 80,
    };

    const settings = {
      cX: uniforms.uC.value[0],
      cY: uniforms.uC.value[1],
      zoom: uniforms.uZoom.value,
      maxIterations: uniforms.uMaxIterations.value,
    };

    const juliaFolder = pane.addFolder({
      title: 'Julia Constant',
      expanded: true,
    });

    juliaFolder
      .addBinding(settings, 'cX', {
        label: 'C Real',
        min: -2.0,
        max: 2.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uC.value = [ev.value, settings.cY];
      });

    juliaFolder
      .addBinding(settings, 'cY', {
        label: 'C Imaginary',
        min: -2.0,
        max: 2.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uC.value = [settings.cX, ev.value];
      });

    pane
      .addBinding(settings, 'zoom', {
        label: 'Zoom Level',
        min: 0.1,
        max: 5.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uZoom.value = ev.value;
      });

    pane
      .addBinding(settings, 'maxIterations', {
        label: 'Max Iterations',
        min: 20,
        max: 200,
        step: 10,
      })
      .on('change', (ev) => {
        uniforms.uMaxIterations.value = ev.value;
      });

    pane
      .addButton({
        title: 'Reset to Defaults',
      })
      .on('click', () => {
        uniforms.uC.value = [defaults.cX, defaults.cY];
        uniforms.uZoom.value = defaults.zoom;
        uniforms.uMaxIterations.value = defaults.maxIterations;

        Object.assign(settings, defaults);
        pane.refresh();
      });
  },
};
