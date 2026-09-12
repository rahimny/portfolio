import { describe, expect, it } from 'vitest';
import { sampleFusion } from './fusion';

describe('reactor fusion', () => {
  it('forms a contact before bridging and pinches the bridge during emergence', () => {
    expect(sampleFusion(0).active).toBe(false);
    expect(sampleFusion(0.1).radius).toBeGreaterThan(0);
    expect(sampleFusion(0.1).bridgeRadius).toBe(0);
    expect(sampleFusion(0.44).bridgeRadius).toBeGreaterThan(
      sampleFusion(0.72).bridgeRadius
    );
    expect(sampleFusion(0.44).spread).toBeLessThan(sampleFusion(0.1).spread);
    expect(sampleFusion(0.99).active).toBe(false);
  });
  it('is reversible, bounded and continuous across its phase boundaries', () => {
    const samples = Array.from({ length: 1001 }, (_, i) =>
      sampleFusion(i / 1000)
    );
    for (let i = 1000; i >= 0; i--)
      expect(sampleFusion(i / 1000)).toEqual(samples[i]);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].radius).toBeGreaterThanOrEqual(0);
      expect(samples[i].radius).toBeLessThanOrEqual(0.4);
      expect(Math.abs(samples[i].radius - samples[i - 1].radius)).toBeLessThan(
        0.005
      );
      expect(
        Math.abs(samples[i].bridgeRadius - samples[i - 1].bridgeRadius)
      ).toBeLessThan(0.005);
    }
  });
});
