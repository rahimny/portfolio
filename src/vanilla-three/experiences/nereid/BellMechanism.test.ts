import { expect, it } from 'vitest';
import * as T from 'three';
import { BellMechanism } from './BellMechanism';

it('keeps rigid armour and fixed housings intact while piston rods meet their pivots', () => {
  const root = new T.Group();
  const material = new T.MeshBasicMaterial();
  const bell = new BellMechanism(
    {
      white: material,
      grey: material,
      dark: material,
      orange: material,
      steel: material,
    },
    (kind) => {
      const group = new T.Group();
      group.name = kind;
      root.add(group);
      return group;
    }
  );
  const barrels = root.getObjectByName(
    'bell-actuator-barrels'
  ) as T.InstancedMesh;
  const rods = root.getObjectByName('bell-actuator-rods') as T.InstancedMesh;
  const pivots = root.getObjectByName(
    'bell-actuator-pivots'
  ) as T.InstancedMesh;
  const matrix = new T.Matrix4(),
    other = new T.Matrix4();
  const scale = new T.Vector3(),
    position = new T.Vector3(),
    rotation = new T.Quaternion();
  const extension: number[] = [];
  try {
    for (const [contraction, margin] of [
      [0, 0],
      [1, 0.7],
      [0.15, 0.65],
    ]) {
      bell.update(contraction, margin, 0.32, 0, 4);
      root.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        expect(object.geometry.getAttribute('position').count).toBeGreaterThan(
          0
        );
        if (object instanceof T.InstancedMesh)
          for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, matrix);
            expect(matrix.elements.every(Number.isFinite)).toBe(true);
            if (object.parent?.name === 'shell')
              expect(matrix.determinant()).toBeCloseTo(1, 5);
          }
      });
      for (let i = 0; i < barrels.count; i++) {
        barrels.getMatrixAt(i, matrix);
        matrix.decompose(position, rotation, scale);
        expect(scale.y).toBeCloseTo(0.78, 6);
        rods.getMatrixAt(i, matrix);
        pivots.getMatrixAt(i * 2 + 1, other);
        const rodEnd = new T.Vector3(0, 0.5, 0).applyMatrix4(matrix);
        const pivot = new T.Vector3().setFromMatrixPosition(other);
        expect(rodEnd.distanceTo(pivot)).toBeLessThan(1e-5);
        if (i === 0) {
          matrix.decompose(position, rotation, scale);
          extension.push(scale.y);
        }
      }
    }
    expect(Math.max(...extension) - Math.min(...extension)).toBeGreaterThan(
      0.2
    );
  } finally {
    root.traverse((object) => {
      if (object instanceof T.Mesh) object.geometry.dispose();
      if (object instanceof T.InstancedMesh) object.dispose();
    });
    material.dispose();
  }
});
