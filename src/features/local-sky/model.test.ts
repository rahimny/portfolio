import { expect, it } from 'vitest';
import { londonSky } from './model';

it('uses the London clock across summer time and the repeated autumn hour', () => {
  expect(londonSky(new Date('2026-07-01T11:00:00Z')).time).toBe('12:00');
  expect(londonSky(new Date('2026-01-01T12:00:00Z')).time).toBe('12:00');
  expect(londonSky(new Date('2026-10-25T00:30:00Z')).time).toBe('01:30');
  expect(londonSky(new Date('2026-10-25T01:30:00Z')).time).toBe('01:30');
  expect(londonSky(new Date('2026-01-01T00:00:00Z')).y).toBeGreaterThan(65);
  expect(londonSky(new Date('2026-01-01T12:00:00Z')).y).toBeLessThan(65);
});
