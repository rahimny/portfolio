/**
 * The study registry — single source of truth for the lab.
 *
 * The index, generated routes, breadcrumbs and poster script all read from
 * here. A study page follows one naming convention:
 * `some-study` -> `pages/experiments/SomeStudyExperiment.tsx`.
 *
 * Framework-agnostic so routes, scripts and renderers share the same metadata.
 *
 * ## Editions
 *
 * An edition number is a stable identifier: it is assigned
 * once, never reused, and never renumbered when a study is added or retired.
 * Display order is newest-first; the number is not the sort key on its own.
 */

export type Renderer = 'webgl' | 'webgpu' | 'svg' | 'canvas';
export type StudyStatus = 'live' | 'wip';

export interface StudyConstruction {
  kind: 'pointer-field' | 'bulb-section';
  image: string;
  title: string;
  caption: string;
  alt: string;
}

export interface StudyVariant {
  slug: string;
  title: string;
  summary?: string;
  notes?: Study['notes'];
  /** Technique family used to group related variants. */
  family: string;
  poster?: string;
}

export interface Study {
  /** Stable, assigned once, never reused. Rendered as 001, 002, … */
  edition: number;
  slug: string;
  title: string;
  /** One sentence. What it is, not why it is impressive. */
  summary: string;
  /** Homepage editorial order; the first two receive large artwork previews. */
  homeOrder?: number;
  year: number;
  status: StudyStatus;
  renderer: Renderer;
  /** Techniques used by the study. */
  technique: readonly string[];
  /**
   * Undefined means no usable poster. The card renders an empty frame with the
   * metadata rather than a misleading image — see particle-sanctuary.
   */
  poster?: string;
  construction?: StudyConstruction;
  /** Clean specimen image for an inline homepage encounter. */
  encounterPoster?: string;
  /** At most one. Drives the featured slot on the index. */
  featured?: boolean;
  variants?: readonly StudyVariant[];
  /**
   * The compact explanation shown on the study page itself. `cost` is
   * deliberately optional and left unset until it's a real number measured
   * on real hardware — an absent cost is honest, a guessed one isn't.
   */
  notes?: {
    mechanism: string;
    interaction: string;
    decision: string;
    cost?: string;
    sourceHref?: string;
  };
}

const STUDIES = [
  {
    edition: 1,
    slug: 'shader-gallery',
    title: 'Shader Gallery',
    summary:
      'Interactive fragment shaders exploring deposited oil marks, pleated membranes, standing-wave terrain, quasiperiodic lattices and recursive geometry.',
    year: 2025,
    status: 'live',
    renderer: 'webgl',
    technique: ['Fields', 'Fractals', 'GLSL'],
    poster: '/posters/aurora.jpg',
    notes: {
      mechanism:
        'Each panel is one GLSL fragment shader sampling a field or a distance function per pixel — no geometry, just a full-screen quad.',
      interaction:
        'Drag or move the pointer; each shader reads it into its own uniforms.',
      decision:
        'Every shader shares one full-screen-quad harness, so a new panel is a new fragment shader, not a new render pipeline.',
    },
    variants: [
      {
        slug: 'impasto',
        title: 'Impasto',
        summary:
          'Oil marks are laid down in four slabs of depth. Every bristle carries its own charge of paint, and wet strokes lift the colour they land on.',
        family: 'Deposited marks',
        poster: '/posters/impasto.jpg',
        notes: {
          mechanism:
            'A flow field orients a jittered lattice of brush marks. Each mark is a tapered capsule whose bristles run dry at their own point along the stroke; the accumulated paint thickness is differentiated in screen space to light the surface, so the impasto is a consequence of how much pigment was deposited.',
          interaction:
            'Move or drag to bend the armature into a circulation — the marks re-aim around the pointer, and the near slabs travel further than the far ones. Load changes how far the paint carries, Splay separates the bristles, Wetness sets how much colour each stroke lifts from the one beneath. Force X and Force Y give the same input by keyboard.',
          decision:
            'The palette is a consequence of the order marks were laid down in rather than a colour chosen per stroke. No brush texture is sampled: the bristles are analytic, so this study shares nothing with the adapted atlas in Medusa. Four depth slabs, nine candidate marks per slab per pixel, one analytic pass.',
        },
      },
      {
        slug: 'suture',
        title: 'Suture',
        summary:
          'A pleated membrane loops around a dark aperture. Open its seam and a fine helical stitch keeps the two edges connected.',
        family: 'Warped fields',
        poster: '/posters/suture.jpg',
        notes: {
          mechanism:
            'A twisted annular field forms a pleated membrane and a separate helical joining thread. A bounded march accumulates light near both surfaces.',
          interaction:
            'Move or drag across the stage to tension the membrane and open its seam. Explore the compositions, pause to hold a phase, or save a PNG. Force X and Force Y offer the same interaction by keyboard.',
          decision:
            'The stitch survives the cut, so opening the object reveals how it is held together. Analytic deformation and emission, rather than cloth or fluid simulation; at most 112 samples per pixel.',
        },
      },
      {
        slug: 'isofield',
        title: 'Isofield',
        summary:
          'Two travelling wave sources build a terraced landscape. Move one source, change the contour interval, or lower a plane through the peaks.',
        family: 'Sampled fields',
        poster: '/posters/isofield.jpg',
        notes: {
          mechanism:
            'Two radial wave sources interfere beneath a smooth envelope. Forty-eight isometric height slices reveal the resulting field as quantised terraces.',
          interaction:
            'Move or drag to relocate a wave source. Wave height and Terraces reshape the land; Slice ceiling exposes a horizontal section. Force X and Force Y provide keyboard control. Pause and save a PNG.',
          decision:
            'The topography is generated directly from waves; it is not a terrain mesh or erosion simulation. Colour records elevation. A fixed slice budget keeps the construction legible.',
        },
      },
      {
        slug: 'quasicity',
        title: 'Quasicity',
        summary:
          'An isometric city whose plan is a five-fold quasicrystal. Cores, districts and streets fall out of five interfering plane waves, so no arrangement of blocks ever repeats: a grid no periodic city could have. The same field decides what each block builds: flat ground near a core terraces, a steep flank builds in bars along the contour, the flats take towers, so the typology comes out in rings nobody drew. Parallel rays, a grid walk over the lattice, and shadows long enough to read the storey count off.',
        family: 'Lattices',
        poster: '/posters/quasicity.jpg',
      },
      {
        slug: 'gasket',
        title: 'Gasket',
        summary:
          "Apollonian packing grown from Descartes' theorem. Circles nucleate by size, strokes stack as layers. Pointer applies a Möbius map, so every circle stays a circle.",
        family: 'Packing',
        poster: '/posters/gasket.jpg',
      },
      {
        slug: 'aurora',
        title: 'Aurora',
        summary:
          'Dynamic aurora effect with flowing lights and ethereal color transitions',
        family: 'Fields',
        poster: '/posters/aurora.jpg',
      },
      {
        slug: 'perlin-waves',
        title: 'Perlin Waves',
        summary:
          'Animated Perlin noise creating smooth flowing waves with color gradients',
        family: 'Fields',
        poster: '/posters/perlin-waves.jpg',
      },
      {
        slug: 'mandelbrot',
        title: 'Mandelbrot',
        summary:
          'Classic Mandelbrot fractal with smooth coloring and zoom capability',
        family: 'Fractals',
        poster: '/posters/mandelbrot.jpg',
      },
      {
        slug: 'julia-set',
        title: 'Julia Set',
        summary:
          'Dynamic Julia set fractal with animated parameters creating morphing patterns',
        family: 'Fractals',
        poster: '/posters/julia-set.jpg',
      },
      {
        slug: 'kaleidoscope',
        title: 'Kaleidoscope',
        summary:
          'Symmetrical kaleidoscope effect with dynamic patterns and colors',
        family: 'Effects',
        poster: '/posters/kaleidoscope.jpg',
      },
      {
        slug: 'lava-lamp',
        title: 'Lava Lamp',
        summary:
          'Animated lava lamp effect with bubbling organic shapes and heat distortion',
        family: 'Effects',
        poster: '/posters/lava-lamp.jpg',
      },
    ],
  },
  {
    edition: 2,
    slug: 'cursor-trails',
    title: 'Cursor Trails',
    summary:
      'An image sampled into particles, displaced by a decaying trail written from pointer movement.',
    year: 2025,
    status: 'live',
    renderer: 'webgl',
    technique: ['Fields', 'Displacement'],
    poster: '/posters/cursor-trails.jpg',
    notes: {
      mechanism:
        'An image is sampled into a particle field; a decaying trail buffer written from pointer movement displaces each particle from its resting position.',
      interaction:
        'Move the pointer to drag a trail through the image — it relaxes back to rest once you stop.',
      decision:
        'The trail lives in its own buffer rather than perturbing particle state directly, so it decays independently of the particle simulation.',
    },
  },
  {
    edition: 3,
    slug: 'meta-shapes',
    title: 'Meta Shapes',
    summary:
      'Instanced geometry driven into formations, with hand tracking and a post-processing chain.',
    year: 2025,
    status: 'live',
    renderer: 'webgl',
    technique: ['Agents', 'Instancing', 'Post-processing'],
    poster: '/posters/meta-shapes.jpg',
    notes: {
      mechanism:
        "Thousands of shapes share one draw call via InstancedMesh; formation maths (cube, sphere, helix and more) sets each instance's target transform.",
      interaction:
        'Pick a formation preset for the obvious move, or open Advanced controls for density, material, rotation and hand tracking.',
      decision:
        'Instancing is what makes this many shapes affordable in one frame — the cost is that per-instance variation has to be written into instance attributes rather than left to the material.',
    },
  },
  {
    edition: 4,
    slug: 'particles',
    title: 'Particles',
    summary:
      'An MLS-MPM fluid solver running in compute, written in TSL against WebGPU.',
    year: 2025,
    status: 'wip',
    renderer: 'webgpu',
    technique: ['Fluids', 'MLS-MPM', 'Compute'],
    // WebGPU compute does not draw under headless swiftshader, so there is no
    // poster to capture. Not a missing file — an un-capturable one.
    notes: {
      mechanism:
        'An MLS-MPM fluid solver runs as WebGPU compute kernels (TSL), moving particles through a background grid each step rather than integrating them independently.',
      interaction:
        'Orbit the camera; the fluid runs continuously once the simulation initialises.',
      decision:
        'The particle and grid data live in structured GPU buffers, which is what makes running the whole solver as compute kernels — instead of a CPU loop — possible in the first place.',
    },
  },
  {
    edition: 5,
    slug: 'pixel-flow',
    construction: {
      kind: 'pointer-field',
      image: '/construction/pixel-flow.svg',
      title: 'Under the image',
      caption:
        'A prepared pointer trail through the displacement grid. Each arrow shows the stored direction and strength; the image moves through this field.',
      alt: 'A measured grid of arrows reveals the fading displacement left by a curved pointer trail.',
    },
    homeOrder: 1,
    title: 'Pixel Flow',
    summary:
      'A pixel-grid flow field with ecosystem-inspired behavioural states driving the motion.',
    year: 2025,
    status: 'wip',
    renderer: 'webgpu',
    technique: ['Fields', 'Agents', 'Compute'],
    poster: '/posters/pixel-flow.jpg',
    notes: {
      mechanism:
        'A pixel grid stores flow-field state in a data texture; named "ecosystem" behavioural states blend automatic movement with pointer input over it.',
      interaction:
        'Move the pointer to disturb the flow; leave it idle and an ecosystem state takes over the motion.',
      decision:
        "Idle behaviour is driven by the same ecosystem states rather than a single auto-pilot loop, so the piece keeps moving with intent instead of freezing when no one's touching it.",
    },
  },
  {
    edition: 6,
    slug: 'particle-sanctuary',
    title: 'Particle Sanctuary',
    summary:
      'A seeded grass field with shared wind, fading pointer wakes and pooled fragment bursts.',
    year: 2025,
    status: 'wip',
    renderer: 'webgpu',
    technique: ['Fields', 'TSL', 'Vertex animation', 'Pooling'],
    poster: '/posters/particle-sanctuary.jpg',
    notes: {
      mechanism:
        'One triangle per blade; a small vector texture carries the drag wake. Four pooled bursts share the same field.',
      interaction:
        'Drag to bend, click or press Enter to scatter. Arrow keys position an impulse; Space pauses. Grow a word in Field controls.',
      decision:
        'Motion runs in vertex shaders with WebGL fallback. Seeds reproduce the planting; Save still exports the current frame.',
    },
  },
  {
    edition: 7,
    slug: 'swiss-grid',
    title: 'Swiss Grid Composer',
    summary:
      'A configurable modular-grid composer with disciplined fields, baseline guides and axonometric depth.',
    year: 2026,
    status: 'live',
    renderer: 'svg',
    technique: ['Grid systems', 'Generative design', 'Axonometry'],
    poster: '/posters/swiss-grid.jpg',
    notes: {
      mechanism:
        'A seeded random-number generator drives every proportion — column widths, ring radii, form placement — from one number, so a composition is fully reproducible from its seed.',
      interaction:
        'Change the seed, geometry mode or grid parameters; export the result as SVG.',
      decision:
        "Construction guides — the grid, baseline and focal rings — render as real SVG elements toggled by one flag, rather than being drawn separately, so the construction view can't drift from what actually generated the piece.",
    },
  },
  {
    edition: 8,
    slug: 'can-control',
    title: 'Can Control',
    summary:
      'A voxel drone writes handstyles and looping patterns on a freight wagon in a stylised rail yard.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Scored flight', 'Wet transport', 'WebGL'],
    notes: {
      mechanism:
        'Scored curves control speed, standoff and valve timing. A constrained drone performs every stroke; its actual nozzle feeds permanent pigment and a conservative wet reservoir on the wagon. Seeded grass responds to wind and nearby rotor downwash.',
      interaction:
        'Tap a scored path to restart immediately, or preview its result. Tune travel speed, can distance and flare envelopes; playback runs independently at 1–8×. Orbit, pan and zoom, draw and replay a custom path, overpaint or restore the previous piece. Pause freezes flight, drying and wind.',
      decision:
        'The yard, cameras and scored artwork are the first scene slice. The full approach, passing train, departure, sound and export remain later work. Drying is compressed into seconds. Physical-device performance has not yet been established.',
    },
  },
  {
    edition: 9,
    slug: 'autonomous-hand',
    homeOrder: 3,
    title: 'Autonomous Hand',
    summary:
      'A possessive hand guards an ink stamp. Move its puck, test its patience and collect the marks left by your encounter.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Skinning', 'Agents', 'Swept collision'],
    notes: {
      mechanism:
        'A seeded actor remembers interference and strikes a displaced puck back home. Swept fingertip contact triggers a brief impact hold, recoil and damped return; settled placements accumulate as ink marks.',
      interaction:
        'Drag the puck or use the keyboard to disturb its arrangement. Inspect poses and gestures, save a vector composition or still, and replay the recorded encounter.',
      decision:
        'One hand with one persistent aim: return the puck to its place. Memory changes its response; the resulting stamp placements form the artefact. Homepage integration and a second hand remain deferred.',
    },
  },
  {
    edition: 10,
    slug: 'helion',
    title: 'Helion',
    summary:
      'An arcade energy shell turns your gestures and homing missile strikes into rising tiles, bursts and travelling shockwaves.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    poster: '/posters/helion.jpg',
    technique: ['Geodesic dual', 'GPU deformation', 'Bloom'],
    notes: {
      mechanism:
        'A geodesic dual makes 480 hexagons and twelve pentagons. Fixed-step steering missiles record their actual trails; swept shell contacts address individual tiles. A delayed GPU spring response carries compression, rebound and heat between neighbours. Four missiles share breathing, braided orbit, frenzy and recovery phases.',
      interaction:
        'Circle your pointer to stir the swarm. Hover to aim, sweep the shell to rake a wake, or hold and release for a frenzy and salvo. Chain quick taps to pop spinning gold coins. Drag empty space, or Shift-drag, to orbit. Scroll approaches; Space charges and P pauses. Frozen and reduced-motion modes support static Discharge inspection.',
      decision:
        'The site’s paper, ink and orange frame a layered shell with gold coin rewards. Cel, Ink and Arcade rendering presets control light bands, contours, hatching, glow and local raster accents. Hexagonal pressure arcs and camera recoil share each impact. Nine missile slots, bounded VFX pools and adaptive resolution limit cost. The shell response is analytic, not simulated fracture.',
    },
  },
  {
    edition: 11,
    slug: 'matter-atelier',
    title: 'Matter Atelier',
    poster: '/posters/matter-atelier.jpg',
    summary:
      'An autonomous atelier prints inherited forms, paints their signatures and returns their energy to a living nursery.',
    year: 2026,
    status: 'wip',
    renderer: 'webgpu',
    technique: [
      'Toolpath simulation',
      'Inherited geometry',
      'Wet pigment',
      'TSL materials',
    ],
    notes: {
      mechanism:
        'Committed recipes connect filament deposition, contour painting, spectral finishing and nutrient recovery. Arrival-gated nursery growth feeds inherited geometry into later editions. Instanced branches, folded TSL fields and finite pigment share that same material history.',
      interaction:
        'Watch the live factory or inspect a single edition. Tune inheritance, fusion, growth and expression for the next generation; switch Atelier, Bioelectric and Signal dream worlds. Isolate the nursery and signals, explore six camera views, upload an STL and save a scene still or painting.',
      decision:
        'Pearl enamel, exposed metal and warm couplings frame saturated material events. WebGPU and its WebGL fallback share TSL materials. Paint uses a bounded surface grid; elastic fusion and nutrient flow are analytic. Fixed instance pools, bounded lineage history and sleeping renders keep the ecology contained.',
    },
  },
  {
    edition: 13,
    slug: 'umbra',
    poster: '/posters/umbra.jpg',
    title: 'Umbra',
    summary:
      'A pale formation grows in its own shadows. Move the light, cultivate the void and keep its shadow impression.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Occlusion', 'Cellular growth', 'Isosurfaces'],
    notes: {
      mechanism:
        'A fixed-tick CPU field tests surface cells against the current occupancy towards one directional light. Persistent shelter grows finite material; sustained exposure erodes the added layer. Amber fades with cell age.',
      interaction:
        'Drag the light or use its sliders and arrow keys. Switch to Explore for the camera, enter the checked central void, pause or step time, and save a monochrome shadow impression or a restorable state.',
      decision:
        'Seeded ribs provide a permanent substrate. Accretion modifies that scaffold; it does not generate the entire room from nothing. A 36³ CPU reference tests the visibility feedback before WebGPU scaling. The impression is the grown isosurface projected along the recorded light. Printable relief remains a later study.',
    },
  },
  {
    edition: 14,
    slug: 'aftermatter',
    poster: '/posters/aftermatter.jpg',
    title: 'Aftermatter',
    summary:
      'A tactile material sandbox. Pour sand, grow a small world and set off beautiful chain reactions inside a three-dimensional chamber.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Cellular simulation', 'Instancing', 'Material reactions'],
    notes: {
      mechanism:
        'A deterministic 320 × 96 cellular simulation exchanges grains by density and applies local rules for fire, growth, cooling and corrosion. Three.js gives every occupied cell a lit, extruded body. Reactions change the same material you draw.',
      interaction:
        'Paint eleven materials, stir them with a vortex and discover six reactions. Explore four starter worlds, hold or step time, undo, save a chamber in this browser and export a still.',
      decision:
        'A cross-section keeps cause and effect visible while a three-dimensional enclosure makes the material tangible. This is an original falling-sand study inspired by Powder Game, not a volumetric fluid solver or a complete reproduction of its element catalogue. Instances, reaction effects and rendering resolution are bounded.',
      sourceHref: 'https://dan-ball.jp/en/javagame/dust2/',
    },
  },
  {
    edition: 15,
    slug: 'mandelbulb',
    construction: {
      kind: 'bulb-section',
      image: '/construction/mandelbulb.svg',
      title: 'Through the core',
      caption:
        'A still section of the unwarped power-eight rule at Z = 0.15. Nested edges come from repeating the same operation, before light and motion are added.',
      alt: 'A central section through the Mandelbulb distance field, with dense nested lobes surrounded by an orange distance contour.',
    },
    homeOrder: 2,
    title: 'Mandelbulb',
    poster: '/posters/mandelbulb.jpg',
    summary:
      'A seed multiplies into a living fractal. Slice through its branches, send a ripple and tune the rhythm of its growth.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Fractals', 'Procedural growth', 'Cel shading'],
    notes: {
      mechanism:
        'A seed expands into a spherical-power Mandelbulb while its power, surface rounding and recursive depth reveal multiplying lobes and finer branches. Breathing, travelling waves and a changing twist deform the same field. Cursor movement positions perpendicular cut planes; a press sends an outward ripple.',
      interaction:
        'Replay or scrub growth; configure power, depth, duration, speed, movement, shape oscillation and cursor response. Hover to slice X and Y, press C to clear, click or press E to excite, drag or use arrow keys to orbit, and Space to pause. Select either cut axis or both; adjust cut depth and warmth. Cel, Ink and Arcade finishes share contour and hatch controls. Save a 2400 px still or a link to the complete held moment.',
      decision:
        'Helion’s paper and ink contours frame a pale recursive body. Restrained warmth belongs only to exposed cut faces. Paired planes remove a corner so the body remains legible, and cuts persist for inspection. Motion is analytic choreography, not a biological or fluid simulation; warped distance estimates are under-stepped and bounded. Adaptive resolution limits cost. Paused and reduced-motion views support discrete growth and interaction inspection; hidden work sleeps.',
      sourceHref: 'https://arxiv.org/abs/2102.01747',
    },
  },
  {
    edition: 18,
    slug: 'ordinal',
    homeOrder: 4,
    title: 'Ordinal',
    summary:
      'A field of characters where the codepoint is the state. Waves dissolve the index into noise and it condenses back, and you can crossfade between diffusing the ASCII table and diffusing tone.',
    year: 2026,
    status: 'wip',
    renderer: 'canvas',
    technique: ['Excitable media', 'Type as substrate', 'Coverage sampling'],
    notes: {
      mechanism:
        "Every cell holds a continuous codepoint. A calm cell is drawn back to its corpus character while an agitated cell diffuses and moves with the field. Agitation is Barkley's excitable medium, which gives travelling fronts with a refractory tail, and characters are sheared along those fronts — so the warp displays the simulation instead of being applied over it. The corpus is this site's own index.",
      interaction:
        'Drag to raise a wave and watch the text it crosses come apart. Type into the field and your characters are metabolised rather than pinned. Move the metric between diffusing the table and diffusing tone, hold a mood, seed an edition, and keep the frame as plain text.',
      decision:
        "The ink ramp is measured from Geist Mono at load with the masthead's own coverage sampler, not copied from a ramp string, and the page prints the rank correlation between the two orderings so the claim is checkable. The grid is sized from the stage and the corpus tiles to fill it; the readout states both numbers rather than implying the text set the height. Simulation and render are both fixed at 24 fps with no interpolation, because the output is discrete. Pointer input is not captured in the seed, so a stirred field is not reproducible from its header.",
      sourceHref: 'https://www.scholarpedia.org/article/Barkley_model',
    },
  },
  {
    edition: 19,
    slug: 'pressure-type',
    title: 'Pressure Type',
    poster: '/posters/pressure-type.jpg',
    summary:
      'Pump, knock and float glossy ink letters. Keep pumping to push their membranes past the limit.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['XPBD membranes', 'Volume constraints', 'Typography'],
    notes: {
      mechanism:
        'Archivo glyph masks become closed triangle membranes. Each pump stroke raises their target volume; fixed-step compliant edge and volume constraints produce the swelling. Surface contacts couple the moving letters, while local impacts dent their skins.',
      interaction:
        'Pump, press and drag the letters, or enable Helium to lift them on tethers. Overfill to burst; reset for fresh letters. Try Ink, Porcelain or Mercury, then tune the material and lighting in Studio controls. Save the settings or a still. Keyboard actions and reduced-motion outcomes are available.',
      decision:
        'A small CPU solver couples local membranes with bounded body motion and world-space surface contacts. Glossy ink reflects a baked studio environment. Helium uses normalised lift and elastic tethers; overfill triggers six preallocated skin sectors per letter. This is an art-directed balloon model with controlled tearing, not calibrated gas physics or general cloth fracture. The homepage ink remains independent.',
      sourceHref:
        'https://matthias-research.github.io/pages/publications/smallsteps.pdf',
    },
  },
  {
    edition: 20,
    slug: 'signal-shutters',
    title: 'Signal Shutters',
    poster: '/posters/signal-shutters.jpg',
    summary:
      'A mechanical billboard of rotating prisms. Send a message across its surface, interrupt the signal and watch the image find its way back.',
    year: 2026,
    status: 'wip',
    renderer: 'webgpu',
    technique: ['Instancing', 'TSL', 'Neighbour propagation'],
    notes: {
      mechanism:
        'A four-connected wave addresses 2,688 triangular prisms. Each motor follows its own damped angular spring; dragging adds a local impulse. TSL rotates positions and normals and maps three printed faces from one atlas.',
      interaction:
        'Choose one of three transmissions, drag across the sign or press Interfere. Inspect depth reveals its construction. Pause holds the arrangement; Save still exports the current view. Arrow keys change messages and Space disturbs the centre.',
      decision:
        'A small fixed-step CPU model drives instanced TSL geometry on WebGPU or WebGL. This is a mechanical display model, not GPU compute or rigid-body contact. Settled and hidden work sleeps. Reduced motion shows discrete arrangements. Rendering is capped at 1.8 million pixels; physical-device frame-time measurements remain to be established.',
    },
  },
  {
    edition: 21,
    slug: 'surveillance',
    title: 'Surveillance',
    summary:
      'A CCTV camera on eight mechanical legs stalks your cursor, plants its feet, and fixes its gaze on you.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Procedural modelling', 'Inverse kinematics', 'WebGL'],
    poster: '/posters/surveillance.jpg',
    notes: {
      sourceHref:
        'https://www.esa.int/gsp/ACT/doc/BIO/ACT-RPR-BIO-2008-IROSconference-SpiderLocomotion.pdf',
      mechanism:
        'Eight legs alternate in two interleaved groups of four. Planted feet stay fixed while the body travels; the next footholds anticipate its velocity and turn. A raised CCTV housing pans and tilts independently; the chassis lowers as it comes to a watchful stop.',
      interaction:
        'Move or touch to lead the droid, then stop to be watched. It patrols when the pointer leaves. Click or Enter startles; arrow keys guide its walk and gaze; Space pauses. Reduced motion holds travel and allows discrete gaze poses.',
      decision:
        'Classic hooded security hardware on a procedural spider chassis, with Nereid-inspired ceramic armour, lattice struts and telescoping actuators. This is flat-ground kinematic animation, not a biological or force simulation. Input stays local; there is no webcam or recording.',
    },
  },
  {
    edition: 22,
    slug: 'core-panic',
    title: 'Core Panic',
    summary:
      'Gather a curling salvo, time an opening in a living reactor and turn each implosion into the next opportunity.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Liquid fields', 'Timed salvos', 'Chain reactions'],
    poster: '/posters/core-panic.jpg',
    notes: {
      mechanism:
        'A deformed spherical membrane encloses eight samples of a warped luminous field. Growing pressure knots drive local bulges; missile contact dents the skin and sends a damped travelling wave through it. A separate fixed-step model owns pursuit, rupture, scoring and linked implosions.',
      interaction:
        'Hold to gather two to six orbiting missiles, aim at a liquid aperture and release while it is open. Four missiles break a swollen knot in one hit. Implosions pull nearby knots inward and expose them for a follow-up; heavy ripe hits chain to linked neighbours. Arrows aim and holding Space charges. A two-click gathering control provides an alternative.',
      decision:
        'The fixed view and generous targets support direct mouse and touch play. Helion contributes damped pursuit and decaying curl; impact is expressed as liquid compression and rebound. The surface and apparent interior depth are analytic, not a fluid simulation. Physical-phone performance and repeated-session balance still need playtesting.',
    },
  },
  {
    edition: 23,
    slug: 'nereid',
    title: 'Nereid',
    summary:
      'A jellyfish-inspired abyssal research robot. Separate its ceramic bell, inspect the pressure core and explore its hexagonal lattice tendrils.',
    year: 2026,
    status: 'live',
    renderer: 'webgl',
    technique: ['Procedural geometry', 'XPBD tendrils', 'GPU deformation'],
    poster: '/posters/nereid.jpg',
    encounterPoster: '/posters/nereid-home.png',
    notes: {
      mechanism:
        'An asymmetric bell pulse drives elastic margin recovery and sustained forward travel. Moving rim anchors carry the stroke into eight free, constrained tendrils with delayed follow-through; GPU deformation carries the hexagonal lattice, service tendons and collars with them. The bell has 36 rigid overlapping armour plates, twelve telescoping actuators, twin counter-rotating cam rings and 24 recovery shutters. Its membrane, mechanisms, sonar crown, reservoirs, propulsion ring and sampling spine separate for inspection.',
      interaction:
        'Tune pulse rate, contraction, glide, flexibility, cross-current and eddies, or choose Hover, Row or Current. Hold and step the motion, orbit and zoom, separate the assembly, reveal the shell in X-ray or isolate a live tendril. Save a PNG of any inspection view.',
      sourceHref: 'https://doi.org/10.1146/annurev-marine-031120-091442',
      decision:
        'Costello et al.’s review of jellyfish swimming informs the contraction, recovery and glide cycle. This is a qualitative motion model with one-way flow forces, with a conservative core clearance envelope, without CFD or collisions between tendrils. The 11,000 m depth is a speculative ambition; the nanoscale lattice is enlarged for inspection. Detailed meshes stay merged or instanced. Hidden work sleeps; reduced motion permits explicit time steps.',
    },
  },
  {
    edition: 26,
    slug: 'filament',
    title: 'Filament',
    poster: '/posters/filament.webp',
    summary:
      'Dissipating pulses branch across a suspended silver web, folding through vortices, liquid lenses and recursive echoes.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Procedural fibres', 'Domain warping', 'GLSL'],
    notes: {
      mechanism:
        'A seeded model constructs the colonies, membrane and connecting fibres. Its 2400 px render is cached as a lossless field; three illuminated depth layers separate the outer lattice from recessed fibres with directional light and overlap shadows. Four precomputed geodesic distance fields send wavefronts across a connected fibre graph. Signals and structure are composited before radial shear, travelling lenses or two nested echoes.',
      interaction:
        'Toggle Network independently of Still, Vortex, Liquid or Echo. Adjust pulse force, deformation, speed or prismatic dispersion. Hover to illuminate nearby fibres. Drag to pull the material elastically or fracture it into directional pixel streaks; release to send a pulse. Combine controllable glitch bursts, pixelation and horizontal or vertical pixel stretching. Advance time manually, restore the still or save a 2400 px PNG.',
      decision:
        'Caching removes 1.57 million transparent thread segments from each live frame. This is deformation of a rendered field, not a simulation of individual fibres or a recovered 3D volume. The original reference image is not used as a texture. Reduced motion holds time; hidden work sleeps.',
    },
  },
  {
    edition: 27,
    slug: 'octopus',
    poster: '/posters/octopus.jpg',
    title: 'Octopus',
    summary:
      'A deep-sea research robot with swept ceramic armour, an exposed pressure core and eight hexagonal lattice tentacles.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['Hexagonal lattice', 'Arm kinematics', 'GPU deformation'],
    notes: {
      mechanism:
        'Eight fixed-length chains integrate independent three-dimensional direction fields. A pose texture deforms hexagonal struts, three helical tendons, an axial line, ceramic collars and plumbed suction cups together. Individually separated mantle panels, seven reservoirs, a titanium cage, axial core, lateral optical gimbals, hydraulic drives and sampling beak expose the mechanical anatomy.',
      interaction:
        'Orbit and zoom, explode the anatomy, isolate one arm or reveal the shell in X-ray. Change curl, spread and current response; hold motion and advance time explicitly. Save the current specimen as a PNG.',
      decision:
        'A natural cephalopod silhouette meets intricate mechanical anatomy: recessed lateral optics, a low armoured prow, swept mantle and asymmetric lattice tentacles. The nanostructure is enlarged for inspection. The 11,000 m depth is a speculative design ambition, not a tested pressure rating. Motion is analytic choreography without self-collision or fluid simulation. Detailed tentacles deform on the GPU; hidden work sleeps and reduced motion holds time.',
    },
  },
  {
    edition: 28,
    slug: 'ghost-cambridge',
    title: 'Ghost Cambridge',
    summary:
      'Explore Cambridge through a real laser survey. Find the colleges, approach their rooftops and replay the recorded scan.',
    year: 2026,
    status: 'wip',
    renderer: 'webgl',
    technique: ['LiDAR', 'Point clouds', 'GLSL'],
    poster: '/posters/ghost-cambridge.jpg',
    notes: {
      mechanism:
        'A crop of the Environment Agency’s 13 February 2023 National LiDAR Programme survey retains 6.56 million measured returns. Full-density patches replace the sampled overview as the camera approaches. OpenStreetMap supplies geographic context; no buildings or returns are invented.',
      interaction:
        'Visit mapped landmarks, move between map and cloud, inspect a vertical section, isolate buildings or bare earth, replay acquisition timestamps and export a 2400 px still.',
      decision:
        'Atlas colours expose buildings and vegetation; height, reflectance and ghost treatments reveal other readings. Landmark close-ups use original point density. Recorded replay skips gaps between flight passes; the survey is historical, not live.',
      sourceHref: 'https://environment.data.gov.uk/survey',
    },
  },
  {
    edition: 29,
    slug: 'medusa',
    title: 'Medusa',
    poster: '/posters/medusa.jpg',
    summary:
      'A swimming jellyfish built from thousands of organic oil strokes. Turn the painting to discover the space between the marks.',
    year: 2026,
    status: 'wip',
    renderer: 'webgpu',
    technique: ['Generative painting', 'Inertial anatomy', 'TSL'],
    notes: {
      mechanism:
        'Seeded oil-bristle stamps occupy a procedural bell and flexible arms. A fixed-step CPU chain model drives a compact pose texture; TSL deforms and shades 35,840 camera-facing marks on WebGPU, with a WebGL 2 fallback.',
      interaction:
        'Turn and approach the painting, pause or step the swimming, send a current, vary the brush size and palette, generate a new specimen and save a print.',
      decision:
        'The brush atlas retains its adaptation credit to Chimera by mpkoz under CC BY-NC 4.0. Procedural jellyfish anatomy uses moving bell anchors, constrained trailing chains and a TSL painter. This is an expressive motion model, not a fluid simulation.',
      sourceHref: 'https://www.artblocks.io/collection/chimera-by-mpkoz',
    },
  },
] as const satisfies readonly Study[];

export type StudySlug = (typeof STUDIES)[number]['slug'];

/** Newest first — the index leads with the most recent work, always. */
export const studies: readonly Study[] = [...STUDIES].sort(
  (a, b) => b.edition - a.edition
);

export const featuredStudy: Study | undefined = (
  STUDIES as readonly Study[]
).find((study) => study.featured);

const bySlug = new Map<string, Study>(STUDIES.map((s) => [s.slug, s]));

export function getStudy(slug: string): Study | undefined {
  return bySlug.get(slug);
}

export function getVariant(
  studySlug: string,
  variantSlug: string
): StudyVariant | undefined {
  return getStudy(studySlug)?.variants?.find((v) => v.slug === variantSlug);
}

/** Zero-padded edition label, e.g. 003. */
export function editionLabel(edition: number): string {
  return String(edition).padStart(3, '0');
}
