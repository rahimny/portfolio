import { describe, expect, it } from 'vitest';
import { PowderWorld, M, SCENES } from './model';
const advance = (w: PowderWorld, n = 80) => {
  for (let i = 0; i < n; i++) w.step();
};
const count = (w: PowderWorld, m: number) =>
  w.cells.filter((c) => c === m).length;
describe('Aftermatter material rules', () => {
  it('conserves sand and liquid while settling and displaces oil upwards', () => {
    const w = new PowderWorld(32, 32);
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 32; x++) w.put(x, y, M.Water);
    w.paint(16, 23, 4, M.Sand);
    w.paint(7, 19, 3, M.Oil);
    const sand = count(w, M.Sand),
      water = count(w, M.Water),
      oil = count(w, M.Oil);
    advance(w, 160);
    expect(count(w, M.Sand)).toBe(sand);
    expect(count(w, M.Water)).toBe(water);
    expect(count(w, M.Oil)).toBe(oil);
    expect(w.at(16, 0)).toBe(M.Sand);
    const oilY = Array.from(w.cells).flatMap((m, i) =>
      m === M.Oil ? [Math.floor(i / 32)] : []
    );
    expect(Math.min(...oilY)).toBeGreaterThan(9);
  });
  it('turns lava and water into stone and steam at their contact', () => {
    const w = new PowderWorld(16, 16);
    w.put(8, 0, M.Lava);
    w.put(8, 1, M.Water);
    w.step();
    expect(w.at(8, 0)).toBe(M.Stone);
    expect(count(w, M.Steam)).toBe(1);
    expect(w.discoveries.has('New land')).toBe(true);
  });
  it('propagates an explosive chain through a powder bed', () => {
    const w = new PowderWorld(64, 32);
    w.line(5, 1, 55, 1, 1, M.Powder);
    w.put(4, 2, M.Fire);
    advance(w, 25);
    expect(w.discoveries.has('Chain reaction')).toBe(true);
    expect(count(w, M.Powder)).toBe(0);
    expect(w.blasts.length).toBeLessThanOrEqual(24);
  });
  it('displaces sand with a blast without consuming the grains', () => {
    const w = new PowderWorld(48, 32);
    w.line(10, 4, 35, 4, 1, M.Sand);
    w.put(23, 7, M.Powder);
    w.put(23, 8, M.Fire);
    const grains = count(w, M.Sand);
    advance(w, 40);
    expect(w.discoveries.has('Chain reaction')).toBe(true);
    expect(count(w, M.Sand)).toBe(grains);
  });
  it('grows only hydrated seeds into a branching plant', () => {
    const wet = new PowderWorld(32, 64),
      dry = new PowderWorld(32, 64);
    wet.put(16, 0, M.Seed);
    wet.put(17, 0, M.Water);
    dry.put(16, 0, M.Seed);
    advance(wet, 160);
    advance(dry, 160);
    expect(count(wet, M.Plant)).toBeGreaterThan(15);
    expect(count(dry, M.Plant)).toBe(0);
    expect(wet.discoveries.has('Germination')).toBe(true);
  });
  it('melts ice, burns wood and consumes acid during corrosion', () => {
    const w = new PowderWorld(32, 32);
    w.line(0, 0, 31, 0, 2, M.Stone);
    w.paint(8, 7, 3, M.Wood);
    w.paint(9, 11, 3, M.Fire);
    w.put(10, 11, M.Ice);
    w.paint(23, 3, 4, M.Acid);
    advance(w, 120);
    expect(w.discoveries.has('Melting')).toBe(true);
    expect(w.discoveries.has('Combustion')).toBe(true);
    expect(w.discoveries.has('Corrosion')).toBe(true);
  });
  it('exactly continues a saved deterministic state', () => {
    const a = new PowderWorld();
    a.loadScene('Terrarium');
    advance(a, 12);
    const b = new PowderWorld();
    b.restore(JSON.parse(JSON.stringify(a.snapshot())));
    advance(a, 40);
    advance(b, 40);
    expect(b.snapshot()).toEqual(a.snapshot());
  });
  it('rejects corrupt state atomically', () => {
    const w = new PowderWorld(16, 16);
    w.put(1, 1, M.Sand);
    const before = w.snapshot();
    const bad = { ...before, cells: [99] };
    expect(() => w.restore(bad)).toThrow();
    expect(w.snapshot()).toEqual(before);
  });
  it('keeps every preset and sustained vortex in finite bounds', () => {
    const w = new PowderWorld();
    for (const scene of SCENES) {
      w.loadScene(scene);
      advance(w, 8);
      w.paint(100, 20, 10, 'vortex');
      expect(w.cells.length).toBe(320 * 96);
      expect([...w.cells].every((m) => m <= 14)).toBe(true);
    }
  });
});
