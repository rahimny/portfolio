import { describe, expect, it } from 'vitest';
import { GraphFormation } from './GraphFormation';
import type { ParticleState } from './ParticleState';

function state(count: number): ParticleState {
  const posX = new Float32Array(count);
  const posY = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    posX[i] = (i % 40) * 8;
    posY[i] = Math.floor(i / 40) * 8;
  }
  return {
    posX,
    posY,
    posZ: new Float32Array(count),
    velX: new Float32Array(count),
    velY: new Float32Array(count),
    velZ: new Float32Array(count),
    invMass: new Float32Array(count).fill(1),
  };
}

describe('GraphFormation', () => {
  it('keeps topology sparse and the force pass finite', () => {
    const count = 1600;
    const particles = state(count);
    const graph = new GraphFormation(count);
    graph.setActive(true, count);

    for (let frame = 0; frame < 90; frame++) {
      graph.step(
        particles,
        count,
        { left: 0, top: 0, right: 800, bottom: 280 },
        1 / 60,
        80
      );
      for (let i = 0; i < count; i++) {
        particles.posX[i] += particles.velX[i] / 60;
        particles.posY[i] += particles.velY[i] / 60;
        particles.posZ[i] += particles.velZ[i] / 60;
      }
    }

    expect(graph.blend).toBeGreaterThan(0.9);
    expect(graph.structuralNodes.length).toBeLessThanOrEqual(320);
    expect(graph.edges.length).toBeLessThan(graph.structuralNodes.length * 6);
    expect(Array.from(particles.posX).every(Number.isFinite)).toBe(true);
    expect(Array.from(particles.posY).every(Number.isFinite)).toBe(true);
    expect(Array.from(particles.posZ).every(Number.isFinite)).toBe(true);
  });

  it('changes topology without changing structural particle identity', () => {
    const graph = new GraphFormation(2000);
    graph.setActive(true, 2000);
    const nodes = graph.structuralNodes.slice();
    const first = graph.edges.slice();

    graph.cycle(2000);

    expect(graph.structuralNodes).toEqual(nodes);
    expect(graph.edges).not.toEqual(first);
  });
});
