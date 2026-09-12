// Adapted from Flow. See public/third-party/flow-LICENSE.txt.
import { struct, instancedArray } from 'three/tsl';
import type { Node, StorageBufferNode, Vector3 } from 'three/webgpu';
import type { Struct } from 'three/src/nodes/core/StructNode.js';

const TYPES = {
  int: { size: 1, alignment: 1, isFloat: false },
  uint: { size: 1, alignment: 1, isFloat: false },
  float: { size: 1, alignment: 1, isFloat: true },

  vec2: { size: 2, alignment: 2, isFloat: true },
  ivec2: { size: 2, alignment: 2, isFloat: false },
  uvec2: { size: 2, alignment: 2, isFloat: false },

  vec3: { size: 3, alignment: 4, isFloat: true },
  ivec3: { size: 3, alignment: 4, isFloat: false },
  uvec3: { size: 3, alignment: 4, isFloat: false },

  vec4: { size: 4, alignment: 4, isFloat: true },
  ivec4: { size: 4, alignment: 4, isFloat: false },
  uvec4: { size: 4, alignment: 4, isFloat: false },

  mat2: { size: 4, alignment: 2, isFloat: true },
  mat3: { size: 12, alignment: 4, isFloat: true },
  mat4: { size: 16, alignment: 4, isFloat: true },
};

/**
 * Utility for creating structured arrays compatible with Three.js TSL and WebGPU.
 * Handles memory alignment, type safety, and buffer management for GPU operations.
 *
 * @example
 * const particles = new StructuredArray({
 *   position: 'vec3',
 *   velocity: 'vec3',
 *   life: 'float'
 * }, 1000, 'particles');
 */
type StorageLayout = Record<
  string,
  string | { type: string; atomic?: boolean }
>;
type MemberType<T> = T extends string
  ? T
  : T extends { type: infer U }
    ? U
    : never;
type StructElement<L extends StorageLayout> = Omit<
  Node<'struct'>,
  'get' | 'toConst'
> & {
  get<K extends keyof L & string>(name: K): Node<MemberType<L[K]>>;
  toConst(name?: string): StructElement<L>;
};

export class StructuredArray<L extends StorageLayout = StorageLayout> {
  layout: Record<
    string,
    {
      type: string;
      size: number;
      offset: number;
      isFloat: boolean;
      atomic?: boolean;
    }
  >;
  length: number;

  structNode: Struct;
  buffer: StorageBufferNode<'struct'>;
  structSize = 0;
  floatArray: Float32Array;
  intArray: Int32Array;

  constructor(layout: L, length: number, label: string) {
    if (!Number.isInteger(length) || length < 1)
      throw new RangeError('Storage length must be a positive integer');
    this.layout = this.parseLayout(layout);
    this.length = length;
    this.structNode = struct(this.layout);
    this.floatArray = new Float32Array(this.structSize * this.length);
    this.intArray = new Int32Array(this.floatArray.buffer);
    // Three accepts a struct factory here; its published overloads only list
    // primitive storage types. Keep that compatibility assertion at this seam.
    const createStructArray = instancedArray as unknown as (
      data: Float32Array,
      type: Struct
    ) => StorageBufferNode<'struct'>;
    this.buffer = createStructArray(this.floatArray, this.structNode).label(
      label
    );
  }

  setAtomic(element: string, value: boolean) {
    const index = Object.keys(this.layout).findIndex((k) => k === element);
    if (index >= 0) {
      const member = this.buffer.structTypeNode?.membersLayout[index];
      if (member) member.atomic = value;
    }
  }

  set<K extends keyof L & string>(
    index: number,
    element: K,
    value: number | number[] | Vector3
  ) {
    if (!Number.isInteger(index) || index < 0 || index >= this.length)
      throw new RangeError('Storage index out of bounds');
    const member = this.layout[element];
    if (!member) {
      throw new Error(`Unknown storage member '${element}'`);
    }
    const offset = index * this.structSize + member.offset;
    const array = member.isFloat ? this.floatArray : this.intArray;

    if (member.size === 1) {
      if (typeof value !== 'number') {
        throw new TypeError(`Expected a number for '${element}'`);
      }
      array[offset] = value;
    }
    if (member.size > 1) {
      if (typeof value === 'object' && !Array.isArray(value)) {
        value = value.toArray();
      }
      if (!Array.isArray(value) || value.length < member.size) {
        throw new TypeError(
          `Expected ${member.size} packed components for '${element}'`
        );
      }
      for (let i = 0; i < member.size; i++) {
        array[offset + i] = value[i];
      }
    }
  }

  element(index: Node | number) {
    return this.buffer.element(index) as unknown as StructElement<L>;
  }

  get<K extends keyof L & string>(index: number, element: K) {
    return this.element(index).get(element);
  }

  private parseLayout(
    layout: Record<string, string | { type: string; atomic?: boolean }>
  ) {
    let offset = 0;
    let maxAlignment = 1;
    const parsedLayout: StructuredArray['layout'] = {};

    const keys = Object.keys(layout);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const input = layout[key];
      const definition = typeof input === 'string' ? { type: input } : input;
      const type = definition.type;
      if (!Object.prototype.hasOwnProperty.call(TYPES, type))
        throw new Error(`Unknown storage type '${type}'`);
      const { size, alignment, isFloat } = TYPES[type as keyof typeof TYPES];
      maxAlignment = Math.max(maxAlignment, alignment);
      const member = { ...definition, size, isFloat, offset: 0 };

      const rest = offset % alignment;
      if (rest !== 0) {
        offset += alignment - rest;
      }
      member.offset = offset;
      offset += size;

      parsedLayout[key] = member;
    }

    const rest = offset % maxAlignment;
    if (rest !== 0) {
      offset += maxAlignment - rest;
    }

    this.structSize = offset;
    return parsedLayout;
  }
}
