import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three/webgpu';
import { StructuredArray } from './StructuredArray';

describe('StructuredArray storage layout', () => {
  it('packs vec3 + scalar together and aligns subsequent matrices without mutating the schema', () => {
    const schema = {
      position: { type: 'vec3' },
      mass: { type: 'float' },
      C: { type: 'mat3' },
      velocity: { type: 'vec3' },
      density: { type: 'float' },
    } as const;
    const array = new StructuredArray(schema, 2, 'particles');
    expect(array.structSize).toBe(20);
    expect(array.layout.C.offset).toBe(4);
    expect(array.layout.velocity.offset).toBe(16);
    expect(array.buffer.structTypeNode?.getLength()).toBe(array.structSize);
    array.set(1, 'position', new Vector3(2, 3, 4));
    array.set(1, 'mass', 0.5);
    expect([...array.floatArray.slice(20, 24)]).toEqual([2, 3, 4, 0.5]);
    expect(schema.position).toEqual({ type: 'vec3' });
  });

  it('writes integers as integer bits rather than float conversions', () => {
    const array = new StructuredArray(
      { x: { type: 'int', atomic: true }, y: 'int', z: 'int', mass: 'int' },
      2,
      'cells'
    );
    array.set(1, 'x', -100);
    expect(array.intArray[4]).toBe(-100);
    expect(array.floatArray[4]).not.toBe(-100);
    array.setAtomic('x', false);
    expect(array.buffer.structTypeNode?.membersLayout[0].atomic).toBe(false);
  });
});

it('uses the struct alignment for scalar records and rejects out-of-bounds writes', () => {
  const array = new StructuredArray({ mass: 'float' }, 2, 'masses');
  expect(array.structSize).toBe(1);
  expect(array.buffer.structTypeNode?.getLength()).toBe(array.structSize);
  array.set(1, 'mass', 3);
  expect([...array.floatArray]).toEqual([0, 3]);
  expect(() => array.set(2, 'mass', 4)).toThrow(RangeError);
  expect(() => array.set(-1, 'mass', 4)).toThrow(RangeError);
});
