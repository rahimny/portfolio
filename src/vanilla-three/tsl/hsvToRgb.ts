import { Fn, vec4, abs, mix, clamp, fract } from 'three/tsl';

/**
 * Converts HSV color space to RGB using TSL
 * @param hsv - HSV color vector where:
 *   - x (hue): 0-1 range (wraps around)
 *   - y (saturation): 0-1 range
 *   - z (value): 0-1 range
 * @returns RGB color vector (0-1 range)
 */
export const hsvToRgb = /*@__PURE__*/ Fn(([c]: [any]) => {
  const K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  const p = abs(fract(c.xxx.add(K.xyz)).mul(6.0).sub(K.www));
  return c.z.mul(mix(K.xxx, clamp(p.sub(K.xxx), 0.0, 1.0), c.y));
}).setLayout({
  name: 'hsvToRgb',
  type: 'vec3',
  inputs: [{ name: 'c', type: 'vec3' }],
});

// Legacy export for backward compatibility
export const hsvtorgb = hsvToRgb;
