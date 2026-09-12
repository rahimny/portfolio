import { createHash } from 'node:crypto';
import * as T from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NereidAssembly } from './NereidAssembly';
import { SwimDeformation } from './SwimDeformation';
import { SwimmingModel } from '../../../features/nereid/swimming';

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: () => ({
      getContext: () => ({ fillRect() {}, fillText() {} }),
    }),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function signature(assembly: NereidAssembly) {
  const hash = createHash('sha256');
  for (const part of assembly.parts) {
    hash.update(JSON.stringify([part.kind, part.offset.toArray()]));
    part.group.traverse((object) => {
      if (!(object instanceof T.Mesh || object instanceof T.LineSegments))
        return;
      const geometry: T.BufferGeometry = object.geometry;
      for (const attribute of Object.values(geometry.attributes))
        hash.update(
          Buffer.from(
            attribute.array.buffer,
            attribute.array.byteOffset,
            attribute.array.byteLength
          )
        );
      if (geometry.index) hash.update(Buffer.from(geometry.index.array.buffer));
      if (object instanceof T.InstancedMesh) {
        hash.update(Buffer.from(object.instanceMatrix.array.buffer));
        if (object.instanceColor)
          hash.update(Buffer.from(object.instanceColor.array.buffer));
      }
    });
  }
  return {
    geometry: hash.digest('hex'),
    materials: assembly.materials.length,
    textures: assembly.textures.length,
  };
}

it('builds identical geometry and assembly ordering across synchronous and sliced paths', async () => {
  const original = new NereidAssembly();
  const sliced = await NereidAssembly.create();
  try {
    expect(signature(sliced)).toEqual(signature(original));
    original.apply(0.8, false, 0, 0.3, 0.2, 0.4, 0.7);
    sliced.apply(0.8, false, 0, 0.3, 0.2, 0.4, 0.7);
    expect(signature(sliced)).toEqual(signature(original));
  } finally {
    original.dispose();
    sliced.dispose();
  }
});

it('keeps limb deformation live independently of the opening bell, with the study default unchanged', () => {
  const assembly = new NereidAssembly();
  const model = new SwimmingModel();
  const deformation = new SwimDeformation(assembly, model);
  try {
    const weightUniform = (kind: 'limb' | 'shell') => {
      const part = assembly.parts.find((part) => part.kind === kind)!;
      let material: T.Material | undefined;
      part.group.traverse((object) => {
        if (material || !(object instanceof T.Mesh)) return;
        material = Array.isArray(object.material)
          ? object.material[0]
          : object.material;
      });
      const shader = {
        uniforms: {},
        vertexShader: '',
      } as T.WebGLProgramParametersWithUniforms;
      material!.onBeforeCompile(shader, {} as T.WebGLRenderer);
      return shader.uniforms.uSwimWeight;
    };
    const limb = weightUniform('limb');
    const bell = weightUniform('shell');
    deformation.update(model, 0, 1);
    expect(limb.value).toBe(1);
    expect(bell.value).toBe(0);
    deformation.update(model, 0.4);
    expect(limb.value).toBe(0.4);
    expect(bell.value).toBe(0.4);
  } finally {
    deformation.dispose();
    assembly.dispose();
  }
});

it('releases partially built resources when initialisation is cancelled between slices', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const geometryDispose = vi.spyOn(T.BufferGeometry.prototype, 'dispose');
  const materialDispose = vi.spyOn(T.Material.prototype, 'dispose');
  const textureDispose = vi.spyOn(T.Texture.prototype, 'dispose');
  const building = NereidAssembly.create(controller.signal);
  const rejected = expect(building).rejects.toMatchObject({
    name: 'AbortError',
  });
  await vi.advanceTimersToNextTimerAsync();
  geometryDispose.mockClear();
  controller.abort();
  await vi.runAllTimersAsync();
  await rejected;
  expect(geometryDispose).toHaveBeenCalled();
  expect(materialDispose.mock.calls.length).toBeGreaterThanOrEqual(9);
  expect(new Set(materialDispose.mock.contexts).size).toBe(
    materialDispose.mock.calls.length
  );
  expect(textureDispose).toHaveBeenCalled();
  expect(new Set(textureDispose.mock.contexts).size).toBe(
    textureDispose.mock.calls.length
  );
});
