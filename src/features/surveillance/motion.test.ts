import { describe, expect, it } from 'vitest';
import { advanceMotion, createMotion } from './motion';

describe('surveillance servos', () => {
  it('acquires a sampled pointer target promptly', () => {
    const motion = createMotion();
    for (let i = 0; i < 12; i++)
      advanceMotion(motion, 1 / 60, { x: 1, y: -1 }, true);
    expect(motion.gazeX).toBeGreaterThan(0.9);
    expect(motion.gazeY).toBeLessThan(-0.9);
  });
  it('holds time and pose when paused and bounds resumed time', () => {
    const motion = createMotion();
    advanceMotion(motion, 0, { x: 1, y: 1 }, true);
    expect(motion.time).toBe(0);
    expect(motion.gazeX).toBe(0);
    advanceMotion(motion, 20, { x: 100, y: -100 }, true);
    expect(motion.time).toBe(0.05);
    expect(motion.targetX).toBe(1);
    expect(motion.targetY).toBe(-1);
  });
});
