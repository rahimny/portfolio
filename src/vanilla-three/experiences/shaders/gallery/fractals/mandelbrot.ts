import perlinVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import mandelbrotFragmentShader from '@/vanilla-three/shaders/gallery/fractals/mandelbrot-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';

export const mandelbrotShader: ShaderDefinition = {
  id: 'mandelbrot',
  vertexShader: perlinVertexShader,
  fragmentShader: mandelbrotFragmentShader,
  geometry: 'plane',
  uniforms: {
    uZoom: { value: 1.0 },
    uCenter: { value: [-0.5, 0.0] },
    uMaxIterations: { value: 100 },
    uColorIntensity: { value: 1.0 },
  },
  setupTweakpane: (pane, uniforms) => {
    const defaults = {
      zoom: 1.0,
      centerX: -0.5,
      centerY: 0.0,
      maxIterations: 100,
      colorIntensity: 1.0,
    };

    const settings = {
      zoom: uniforms.uZoom.value,
      centerX: uniforms.uCenter.value[0],
      centerY: uniforms.uCenter.value[1],
      maxIterations: uniforms.uMaxIterations.value,
      colorIntensity: uniforms.uColorIntensity.value,
    };

    const fractalFolder = pane.addFolder({
      title: 'Fractal Properties',
      expanded: true,
    });

    fractalFolder
      .addBinding(settings, 'zoom', {
        label: 'Zoom Level',
        min: 0.1,
        max: 10.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uZoom.value = ev.value;
      });

    const centerFolder = fractalFolder.addFolder({
      title: 'Center Point',
      expanded: false,
    });

    centerFolder
      .addBinding(settings, 'centerX', {
        label: 'X',
        min: -2.0,
        max: 2.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uCenter.value = [ev.value, settings.centerY];
      });

    centerFolder
      .addBinding(settings, 'centerY', {
        label: 'Y',
        min: -2.0,
        max: 2.0,
        step: 0.01,
      })
      .on('change', (ev) => {
        uniforms.uCenter.value = [settings.centerX, ev.value];
      });

    fractalFolder
      .addBinding(settings, 'maxIterations', {
        label: 'Max Iterations',
        min: 20,
        max: 300,
        step: 10,
      })
      .on('change', (ev) => {
        uniforms.uMaxIterations.value = ev.value;
      });

    fractalFolder
      .addBinding(settings, 'colorIntensity', {
        label: 'Color Intensity',
        min: 0.1,
        max: 3.0,
        step: 0.1,
      })
      .on('change', (ev) => {
        uniforms.uColorIntensity.value = ev.value;
      });

    pane
      .addButton({
        title: 'Reset to Defaults',
      })
      .on('click', () => {
        uniforms.uZoom.value = defaults.zoom;
        uniforms.uCenter.value = [defaults.centerX, defaults.centerY];
        uniforms.uMaxIterations.value = defaults.maxIterations;
        uniforms.uColorIntensity.value = defaults.colorIntensity;

        Object.assign(settings, defaults);
        pane.refresh();
      });
  },
};
