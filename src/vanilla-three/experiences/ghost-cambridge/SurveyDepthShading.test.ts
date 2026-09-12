import { describe, expect, it, vi } from 'vitest';
import type { WebGLRenderer, WebGLRenderTarget } from 'three';
import { SurveyDepthShading } from './SurveyDepthShading';

describe('survey depth target', () => {
  it('preserves its drawing buffer through an empty host and resumes at a valid size', () => {
    const sizes: number[][] = [];
    const renderer = {
      extensions: { has: () => true },
      capabilities: { maxSamples: 2 },
      getRenderTarget: () => null,
      getContext: () => ({
        FRAMEBUFFER: 1,
        FRAMEBUFFER_COMPLETE: 2,
        checkFramebufferStatus: () => 2,
      }),
      setRenderTarget: vi.fn((target: WebGLRenderTarget | null) => {
        if (target) sizes.push([target.width, target.height]);
      }),
    };
    const shading = new SurveyDepthShading(
      renderer as unknown as WebGLRenderer
    );
    shading.resize(800, 600, 1);
    shading.resize(0, 0, 1);
    shading.resize(800, 0, 1);
    shading.resize(Number.NaN, 600, 1);
    shading.resize(640, 480, 1);
    expect(sizes).toEqual([
      [800, 600],
      [640, 480],
    ]);
    expect(shading.available).toBe(true);
    shading.dispose();
    shading.resize(800, 600, 1);
    expect(sizes).toHaveLength(2);
  });
});
