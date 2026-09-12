import * as THREE from 'three';
import baseVertexShader from '@/vanilla-three/shaders/gallery/base-vertex.glsl';
import quasicityFragmentShader from '@/vanilla-three/shaders/gallery/geometric/quasicity-fragment.glsl';
import type { ShaderDefinition } from '../../ShaderGalleryExperience';
import { OPENING, QuasicityDirector, WAVES } from './quasicityDirector';

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

const REDUCED = reducedMotion();

/** Everything the programme does not touch. */
const DRAWING = {
  typology: true,
  stroke: 1.0,
  floorLines: true,
  gridLines: true,
  shadow: true,
  supersample: true,
};

const TRAVEL = REDUCED ? 0 : 0.7;
// Pointer parallax is user-initiated, but a three-unit camera shove on every
// mouse move is still motion someone asked not to have. The site marker below
// does not depend on it.
const INFLUENCE = REDUCED ? 0 : 3.0;

export const quasicityShader: ShaderDefinition = {
  id: 'quasicity',
  vertexShader: baseVertexShader,
  fragmentShader: quasicityFragmentShader,
  geometry: 'plane',
  uniforms: {
    uZoom: { value: OPENING.zoom },
    uPlanScale: { value: OPENING.planScale },
    uWaves: {
      value: Array.from(
        { length: WAVES },
        (_, k) =>
          new THREE.Vector2(
            Math.cos((k * Math.PI * 2) / WAVES),
            Math.sin((k * Math.PI * 2) / WAVES)
          )
      ),
    },
    uPlaza: { value: OPENING.plaza },
    uStoreys: { value: OPENING.storeys },
    uStoreyHeight: { value: OPENING.storeyHeight },
    uStreet: { value: OPENING.street },
    uMast: { value: OPENING.mast },
    uHaze: { value: OPENING.haze },
    uInvert: { value: OPENING.invert },
    uSun: { value: 0.375 },
    uPan: { value: new THREE.Vector2() },
    uPointer: { value: 0 },
    uInfluence: { value: INFLUENCE },
    uTypology: { value: DRAWING.typology ? 1 : 0 },
    uStroke: { value: DRAWING.stroke },
    uFloorLines: { value: DRAWING.floorLines ? 1 : 0 },
    uGridLines: { value: DRAWING.gridLines ? 1 : 0 },
    uShadow: { value: DRAWING.shadow ? 1 : 0 },
    uSuper: { value: DRAWING.supersample ? 1 : 0 },
    uPaper: { value: new THREE.Vector3(0.969, 0.961, 0.945) },
    uInk: { value: new THREE.Vector3(0.145, 0.137, 0.125) },
    uBrand: { value: new THREE.Vector3(1.0, 0.2118, 0.0) },
  },

  createDriver: () => {
    const director = new QuasicityDirector();
    // Reduced motion gets the opening composition and nothing else: CSS cannot
    // stop a rAF loop, so it has to be honoured here.
    director.auto = !REDUCED;
    director.travel = TRAVEL;
    return director;
  },

  setupTweakpane: (pane, uniforms, driver) => {
    const director = driver as QuasicityDirector | undefined;

    const settings = {
      auto: director ? director.auto : false,
      travel: TRAVEL,
      influence: INFLUENCE,
      ...OPENING,
      ...DRAWING,
    };

    /** Any manual edit takes the programme off the wheel, from wherever it
     *  had got to, so the sliders and the drawing never disagree. */
    const takeOver = () => {
      if (!director || !director.auto) return;
      director.auto = false;
      settings.auto = false;
      syncFromUniforms();
      pane.refresh();
    };

    const syncFromUniforms = () => {
      settings.zoom = uniforms.uZoom.value;
      settings.planScale = uniforms.uPlanScale.value;
      settings.plaza = uniforms.uPlaza.value;
      settings.storeys = Math.round(uniforms.uStoreys.value);
      settings.storeyHeight = uniforms.uStoreyHeight.value;
      settings.street = uniforms.uStreet.value;
      settings.haze = uniforms.uHaze.value;
      settings.mast = uniforms.uMast.value;
      settings.invert = uniforms.uInvert.value;
    };

    const bind = (
      folder: { addBinding: typeof pane.addBinding },
      key: keyof typeof settings,
      opts: Record<string, unknown>,
      apply: (value: never) => void
    ) => {
      folder.addBinding(settings, key, opts).on('change', (ev) => {
        apply(ev.value as never);
      });
    };

    const programme = pane.addFolder({ title: 'Programme', expanded: true });

    programme
      .addBinding(settings, 'auto', { label: 'Run' })
      .on('change', (ev) => {
        if (!director) return;
        if (ev.value) director.capture(uniforms);
        director.auto = ev.value;
        if (!ev.value) {
          syncFromUniforms();
          pane.refresh();
        }
      });

    bind(
      programme,
      'travel',
      { label: 'Travel', min: 0, max: 3, step: 0.05 },
      (v: number) => {
        if (director) director.travel = v;
      }
    );

    bind(
      programme,
      'influence',
      { label: 'Pointer', min: 0, max: 10, step: 0.1 },
      (v: number) => {
        if (director) director.influence = v;
        uniforms.uInfluence.value = v;
      }
    );

    const plan = pane.addFolder({ title: 'Plan', expanded: false });

    bind(
      plan,
      'planScale',
      { label: 'District size', min: 0.25, max: 1.4, step: 0.01 },
      (v: number) => {
        takeOver();
        uniforms.uPlanScale.value = v;
      }
    );
    bind(
      plan,
      'plaza',
      { label: 'Open ground', min: -0.4, max: 0.6, step: 0.01 },
      (v: number) => {
        takeOver();
        uniforms.uPlaza.value = v;
      }
    );

    const massing = pane.addFolder({ title: 'Massing', expanded: false });

    bind(
      massing,
      'storeys',
      { label: 'Max storeys', min: 2, max: 30, step: 1 },
      (v: number) => {
        takeOver();
        uniforms.uStoreys.value = v;
      }
    );
    bind(
      massing,
      'storeyHeight',
      { label: 'Storey height', min: 0.1, max: 0.6, step: 0.01 },
      (v: number) => {
        takeOver();
        uniforms.uStoreyHeight.value = v;
      }
    );
    bind(
      massing,
      'street',
      { label: 'Street width', min: 0.05, max: 0.6, step: 0.01 },
      (v: number) => {
        takeOver();
        uniforms.uStreet.value = v;
      }
    );
    bind(
      massing,
      'mast',
      { label: 'Mast threshold', min: 0.4, max: 1, step: 0.01 },
      (v: number) => {
        takeOver();
        uniforms.uMast.value = v;
      }
    );
    bind(massing, 'typology', { label: 'Archetypes' }, (v: boolean) => {
      uniforms.uTypology.value = v ? 1 : 0;
    });

    const view = pane.addFolder({ title: 'View', expanded: false });

    bind(
      view,
      'zoom',
      { label: 'Zoom', min: 3, max: 20, step: 0.1 },
      (v: number) => {
        takeOver();
        uniforms.uZoom.value = v;
      }
    );
    bind(
      view,
      'haze',
      { label: 'Depth fade', min: 0, max: 0.6, step: 0.01 },
      (v: number) => {
        takeOver();
        uniforms.uHaze.value = v;
      }
    );
    bind(
      view,
      'invert',
      { label: 'Invert', min: 0, max: 1, step: 0.01 },
      (v: number) => {
        takeOver();
        uniforms.uInvert.value = v;
      }
    );

    const drawing = pane.addFolder({ title: 'Drawing', expanded: false });

    bind(
      drawing,
      'stroke',
      { label: 'Stroke', min: 0.4, max: 3, step: 0.05 },
      (v: number) => {
        uniforms.uStroke.value = v;
      }
    );
    bind(drawing, 'floorLines', { label: 'Floor lines' }, (v: boolean) => {
      uniforms.uFloorLines.value = v ? 1 : 0;
    });
    bind(drawing, 'gridLines', { label: 'Block lattice' }, (v: boolean) => {
      uniforms.uGridLines.value = v ? 1 : 0;
    });
    bind(drawing, 'shadow', { label: 'Cast shadows' }, (v: boolean) => {
      uniforms.uShadow.value = v ? 1 : 0;
    });
    bind(drawing, 'supersample', { label: 'Supersample' }, (v: boolean) => {
      uniforms.uSuper.value = v ? 1 : 0;
    });

    pane.addButton({ title: 'Reset to Defaults' }).on('click', () => {
      Object.assign(settings, OPENING, DRAWING, {
        auto: !REDUCED,
        travel: TRAVEL,
        influence: INFLUENCE,
      });
      uniforms.uZoom.value = OPENING.zoom;
      uniforms.uPlanScale.value = OPENING.planScale;
      uniforms.uPlaza.value = OPENING.plaza;
      uniforms.uStoreys.value = OPENING.storeys;
      uniforms.uStoreyHeight.value = OPENING.storeyHeight;
      uniforms.uStreet.value = OPENING.street;
      uniforms.uMast.value = OPENING.mast;
      uniforms.uHaze.value = OPENING.haze;
      uniforms.uInvert.value = OPENING.invert;
      uniforms.uTypology.value = DRAWING.typology ? 1 : 0;
      uniforms.uStroke.value = DRAWING.stroke;
      uniforms.uFloorLines.value = DRAWING.floorLines ? 1 : 0;
      uniforms.uGridLines.value = DRAWING.gridLines ? 1 : 0;
      uniforms.uShadow.value = DRAWING.shadow ? 1 : 0;
      uniforms.uSuper.value = DRAWING.supersample ? 1 : 0;
      uniforms.uInfluence.value = INFLUENCE;
      if (director) {
        director.capture(uniforms);
        director.travel = TRAVEL;
        director.influence = INFLUENCE;
        director.auto = !REDUCED;
      }
      pane.refresh();
    });
  },
};
