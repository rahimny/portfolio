import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  abs,
  atan,
  cos,
  dFdx,
  dFdy,
  float,
  mix,
  normalViewGeometry,
  positionGeometry,
  positionView,
  sin,
  smoothstep,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { BATH_DROPS } from '@/features/matter-atelier/bath';
import { BED_Y } from '@/features/matter-atelier/types';

export type AtelierWorld = 'atelier' | 'bioelectric' | 'signal';
export const worldIndex = (world: AtelierWorld) =>
  ({ atelier: 0, bioelectric: 1, signal: 2 })[world];

export const spectrum = Fn(([phase]: [THREE.Node<'float'>]) =>
  cos(
    vec3(0, 0.34, 0.67)
      .add(phase)
      .mul(Math.PI * 2)
  )
    .mul(0.5)
    .add(0.5)
);

export const matterPalette = Fn(
  ([phase, world]: [THREE.Node<'float'>, THREE.Node<'float'>]) => {
    const pigment = spectrum(phase).toVar();
    const vein = sin(phase.mul(Math.PI * 2))
      .mul(0.5)
      .add(0.5);
    If(world.greaterThan(0.5).and(world.lessThan(1.5)), () => {
      pigment.assign(
        mix(vec3(0.008, 0.075, 0.045), vec3(0.48, 1.0, 0.055), vein.pow(3))
      );
      pigment.addAssign(vec3(0.05, 0.22, 0.25).mul(vein.oneMinus().pow(6)));
    });
    If(world.greaterThan(1.5), () => {
      pigment.assign(
        mix(
          vec3(0.05, 0.015, 0.22),
          vec3(0.58, 0.25, 0.95),
          vein.mul(5).floor().div(5)
        )
      );
      pigment.assign(
        mix(pigment, vec3(0.2, 0.85, 1), smoothstep(0.94, 1, vein))
      );
    });
    return pigment;
  }
);

/** Four bounded folds: the same field identifies a specimen and its reservoir. */
export const foldedField = Fn(([source]: [THREE.Node<'vec3'>]) => {
  const point = source.toVar();
  const field = float(0).toVar();
  let amplitude = 0.55;
  for (let octave = 0; octave < 4; octave++) {
    const folded = abs(point)
      .sub(vec3(0.38, 0.47, 0.32))
      .toVar();
    point.assign(
      vec3(
        folded.x.mul(-0.6).add(folded.y.mul(0.8)),
        folded.z,
        folded.x.mul(0.8).add(folded.y.mul(0.6))
      ).mul(1.83)
    );
    field.addAssign(sin(point.x.add(sin(point.y).mul(0.65))).mul(amplitude));
    amplitude *= 0.48;
  }
  return field;
});

/** Elastic softening preserves the actual contour, mouth and contact foot.
 * Exposure owns the deformation, so pause, reverse inspection and shadows agree. */
export const softenMatter = Fn(
  ([source, exposure, recipe, seed, height, softness]: [
    THREE.Node<'vec3'>,
    THREE.Node<'float'>,
    THREE.Node<'float'>,
    THREE.Node<'float'>,
    THREE.Node<'float'>,
    THREE.Node<'float'>,
  ]) => {
    const point = source.toVar();
    const normalisedHeight = point.y.sub(BED_Y).div(height.sub(BED_Y).max(0.1));
    const anchored = smoothstep(0.08, 0.3, normalisedHeight).mul(
      smoothstep(0.73, 0.97, normalisedHeight).oneMinus()
    );
    const active = sin(exposure.mul(Math.PI)).pow(2).mul(softness);
    const angle = atan(point.z, point.x);
    const phase = exposure.mul(Math.PI * 2).add(seed.mul(0.37));
    const lobe = sin(angle.mul(3).add(point.y.mul(2.1)).sub(phase))
      .mul(0.085)
      .add(cos(angle.mul(2).sub(point.y).add(phase.mul(0.6))).mul(0.045));
    const swell = active.mul(anchored);
    point.xz.mulAssign(lobe.mul(swell).add(1));
    point.y.subAssign(swell.mul(0.075).mul(sin(normalisedHeight.mul(Math.PI))));
    If(recipe.greaterThan(1.5), () => {
      const layer = source.y.mul(18).floor();
      const gate = smoothstep(
        0.55,
        0.9,
        sin(layer.mul(2.7).add(exposure.mul(20).floor()))
      );
      const envelope = sin(exposure.mul(Math.PI)).mul(gate);
      point.x.addAssign(
        sin(layer.mul(3.1).add(exposure.mul(12)))
          .mul(envelope)
          .mul(0.16)
      );
      point.z.addAssign(
        cos(layer.mul(1.7).add(exposure.mul(9)))
          .mul(envelope)
          .mul(0.09)
      );
    });
    return point;
  }
);

export function createBathInputs() {
  const impactValues = Array.from(
    { length: BATH_DROPS },
    () => new THREE.Vector4(0, 0, -10, 0)
  );
  return {
    phase: uniform(0),
    immersion: uniform(0),
    activation: uniform(0),
    treatment: uniform(0),
    softness: uniform(1),
    world: uniform(0),
    impactValues,
    impacts: uniformArray<'vec4'>(impactValues, 'vec4'),
  };
}

export function createBathMaterial(
  inputs: ReturnType<typeof createBathInputs>
) {
  const { immersion, phase, impacts, activation, treatment, softness, world } =
    inputs;
  const heightAt = Fn(([point]: [THREE.Node<'vec2'>]) => {
    const radius = point.length();
    const entry = immersion.sub(0.22).mul(7).pow(2).negate().exp();
    const height = sin(radius.mul(25).sub(immersion.mul(28)))
      .mul(entry)
      .mul(0.026)
      .toVar();
    for (let i = 0; i < BATH_DROPS; i++) {
      const impact = impacts.element(i);
      If(impact.z.greaterThan(0).and(impact.z.lessThan(2)), () => {
        const front = point.sub(impact.xy).length().sub(impact.z.mul(0.65));
        height.addAssign(
          sin(front.mul(40))
            .mul(front.pow(2).mul(-65).exp())
            .mul(impact.z.mul(-2.2).exp())
            .mul(impact.w)
            .mul(0.45)
        );
      });
    }
    const swell = point
      .dot(point)
      .mul(-3.2)
      .exp()
      .mul(sin(immersion.mul(Math.PI)).pow(2))
      .mul(softness)
      .mul(0.045);
    const coalescence = sin(immersion.mul(Math.PI)).pow(2).mul(softness);
    for (let lobe = 0; lobe < 5; lobe++) {
      const angle = phase.mul(0.06).add((lobe * Math.PI * 2) / 5);
      const orbit = float(0.46).sub(smoothstep(0.18, 0.72, immersion).mul(0.3));
      const centre = vec2(cos(angle), sin(angle)).mul(orbit);
      const delta = point.sub(centre);
      height.addAssign(
        delta.dot(delta).mul(-26).exp().mul(coalescence).mul(0.045)
      );
    }
    return height.add(swell).mul(smoothstep(0.86, 1, radius).oneMinus());
  });
  const point = uv().sub(0.5).mul(2);
  const surfaceHeight = heightAt(point).toVar();
  const height = surfaceHeight.toVarying();
  const material = new THREE.MeshPhysicalNodeMaterial({
    metalness: 0.27,
    roughness: 0.24,
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
    iridescence: 0.45,
    iridescenceThicknessRange: [180, 420],
  });
  material.positionNode = positionGeometry.add(vec3(0, 0, surfaceHeight));
  material.maskNode = point.length().lessThanEqual(1);
  material.normalNode = mix(
    normalViewGeometry,
    dFdx(positionView).cross(dFdy(positionView)).normalize(),
    0.85
  ).normalize();
  const field = foldedField(
    vec3(point.mul(2.4).add(height.mul(3)), phase.mul(0.14))
  );
  const radius = point.length();
  const flow = sin(
    radius
      .mul(22)
      .sub(atan(point.y, point.x).mul(2))
      .add(field.mul(3))
      .sub(phase.mul(0.9))
      .add(height.mul(40))
  );
  const pattern = Fn(() => {
    const value = radius
      .mul(0.9)
      .add(field.mul(0.28))
      .sub(phase.mul(0.035))
      .add(height.mul(4))
      .toVar();
    If(treatment.greaterThan(0.5).and(treatment.lessThan(1.5)), () => {
      value.assign(field.mul(0.75).add(radius.mul(0.25)).add(height.mul(4)));
    });
    If(treatment.greaterThan(1.5), () => {
      value.assign(
        value.mul(9).floor().div(9).add(point.y.mul(14).floor().mul(0.023))
      );
    });
    return value.add(world.mul(0.09));
  })();
  const filament = flow.mul(0.5).add(0.5).pow(8);
  const pigment = matterPalette(pattern, world);
  material.colorNode = mix(
    vec3(0.018, 0.045, 0.085),
    pigment.mul(filament.mul(0.55).add(0.2)),
    activation.mul(0.65).add(0.35)
  );
  material.emissiveNode = pigment
    .mul(filament.pow(2))
    .mul(activation)
    .mul(0.12);
  material.roughnessNode = mix(float(0.32), float(0.17), activation);
  material.iridescenceThicknessNode = sin(radius.mul(12).add(field.mul(3)))
    .mul(90)
    .add(290);
  return material;
}
