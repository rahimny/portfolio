import { describe, it, expect } from 'vitest';
import {
  factoryIds,
  factoryProcess,
  factoryCarrier,
  brushProgress,
  editionTime,
} from './factory';
import { generateContours, planPrint } from './toolpath';
const job = planPrint(generateContours('bloom'));
describe('continuous creative production', () => {
  it('keeps distinct editions in concurrent stages with a bounded working set', () => {
    for (let time = 60; time < 600; time += 0.25) {
      const ids = factoryIds(time);
      expect(ids.length).toBeGreaterThanOrEqual(2);
      expect(ids.length).toBeLessThanOrEqual(3);
      const ages = ids.map((id) => time - id * 30);
      expect(
        ages.filter((age) => age >= 30 && age < 46).length
      ).toBeLessThanOrEqual(1);
      expect(
        ages.filter((age) => (age >= 24 && age < 30) || (age >= 46 && age < 51))
          .length
      ).toBeLessThanOrEqual(1);
    }
    expect(
      factoryIds(70).map((id) => factoryProcess(job, 70 - id * 30).stage)
    ).toEqual(['complete', 'spectral', 'printing']);
    expect(brushProgress(10)).toBeGreaterThan(0);
  });
  it('keeps the carrier continuous through bath, release, empty return and pickup', () => {
    let previous = factoryCarrier(job, 60).position;
    for (let t = 60.005; t <= 150; t += 0.005) {
      const current = factoryCarrier(job, t).position;
      expect(
        Math.hypot(
          current.x - previous.x,
          current.y - previous.y,
          current.z - previous.z
        )
      ).toBeLessThan(0.14);
      previous = current;
    }
  });
  it('finishes brush preparation before the corresponding bath treatment', () => {
    expect(brushProgress(24)).toBe(1);
    expect(factoryProcess(job, 24).stage).toBe('transfer');
    expect(factoryProcess(job, 30).stage).toBe('spectral');
    expect(editionTime(job, 24)).toBeCloseTo(job.duration);
  });
  it('clears the display before the next delivery without discontinuous object motion', () => {
    let previous = factoryProcess(job, 0).object;
    for (let age = 0.01; age < 80; age += 0.01) {
      const p = factoryProcess(job, age).object;
      expect(
        Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z)
      ).toBeLessThan(0.12);
      previous = p;
    }
    expect(factoryProcess(job, 80).object.y).toBeCloseTo(-3.2);
  });
});
