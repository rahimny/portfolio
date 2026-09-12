export { impastoShader, sutureShader, isofieldShader } from './studies';
import { impastoShader, sutureShader, isofieldShader } from './studies';

// Noise shaders
export { perlinWavesShader } from './noise/perlin-waves';

// Fractal shaders
export { mandelbrotShader } from './fractals/mandelbrot';
export { juliaSetShader } from './fractals/julia-set';

// Effect shaders
export { kaleidoscopeShader } from './effects/kaleidoscope';
export { lavaLampShader } from './effects/lava-lamp';

// Artistic shaders
export { auroraShader } from './artistic/aurora';

// Geometric shaders
export { gasketShader } from './geometric/gasket';
export { quasicityShader } from './geometric/quasicity';

// Aggregate all shaders into a single export
import type { ShaderDefinition } from '../ShaderGalleryExperience';
import { perlinWavesShader } from './noise/perlin-waves';
import { mandelbrotShader } from './fractals/mandelbrot';
import { juliaSetShader } from './fractals/julia-set';
import { kaleidoscopeShader } from './effects/kaleidoscope';
import { lavaLampShader } from './effects/lava-lamp';
import { auroraShader } from './artistic/aurora';
import { gasketShader } from './geometric/gasket';
import { quasicityShader } from './geometric/quasicity';

export const shaderDefinitions: ShaderDefinition[] = [
  impastoShader,
  sutureShader,
  isofieldShader,
  quasicityShader,
  gasketShader,
  perlinWavesShader,
  mandelbrotShader,
  juliaSetShader,
  kaleidoscopeShader,
  lavaLampShader,
  auroraShader,
];
