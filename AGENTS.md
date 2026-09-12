# Repository guide

This is a React, TypeScript and Vite portfolio whose main work is a collection
of independent Three.js, WebGL, WebGPU and SVG studies.

## Start here

- Use pnpm and Node 20 or newer.
- `pnpm dev` serves the site on `http://localhost:6180`.
- `pnpm check` runs the static, unit and production-build validation.
- `pnpm check:all` is the full validation before handoff, including isolated
  browser checks.
- Run `pnpm check:routes` after changing routes, study pages, rendering setup or
  browser-facing lifecycle code. It starts its own Vite server.
- Run `pnpm check:contrast` after changing colour tokens or text/background
  pairings. It starts its own Vite server.
- Do not edit `references/`; it contains ignored local inspiration projects,
  not application code.

## Current architecture

- `src/features/lab/registry.ts` is the only source of study metadata.
- A registered slug such as `some-study` resolves by convention to
  `src/pages/experiments/SomeStudyExperiment.tsx`. Do not add hand-written
  study routes or parallel metadata lists.
- `pnpm create:experiment:webgl "Name"` and
  `pnpm create:experiment:tsl "Name"` scaffold that convention and update the
  registry.
- React owns pages, semantics and lifecycle hosting. Rendering and simulation
  code under `src/vanilla-three/` must remain React-independent.
- DOM-integrated graphics use `features/dom-effects/DomEffectOverlay`; live DOM
  remains the semantic source and the canvas is a visual treatment.
- Imperative experiences are mounted through `ThreeCanvas` and the
  `IExperience` contract. Initialisation may be cancelled; cleanup must be
  idempotent and release RAF loops, animation loops, listeners, controls,
  geometries, materials, render targets and renderers.
- Pure study models belong under `src/features/<study>/` and should be tested
  independently of their React or GPU adapters.

## Product direction

When available locally, read `CLAUDE.md` before product, copy or aesthetic work.
It and `docs/` contain private working notes and are deliberately excluded from
the public repository. A public checkout uses the existing site as its product
baseline. Never reconstruct personal background or employer project details
from assumptions. Follow these local links only when available and relevant:

- `docs/creative-direction.md` for visual and technique choices.
- `docs/implementation-plan.md` for locked decisions and current redesign work.
- `docs/references.md` when making or naming an aesthetic decision.

Do not copy those documents into code comments. Keep comments for local
constraints and non-obvious mechanisms; keep historical alternatives in docs.

## Review rules

- Flag any study metadata, route, breadcrumb or poster target duplicated outside
  the registry and route convention.
- Flag asynchronous initialisation that can outlive its host without cancellation
  and one-time cleanup.
- Flag GPU resources, listeners, observers or media streams without an explicit
  disposal path.
- Treat accessibility, reduced motion, capability fallbacks and frame-time cost
  as part of the implementation.
- Preserve unrelated working-tree changes. This repository is often developed
  through long-lived visual iterations with uncommitted assets.

## Performance review and implementation

- Measure a production build from an isolated output directory when other work
  may rebuild `dist`. Record viewport, device pixel ratio, backend and whether
  a measurement covers startup, interaction or settled rendering.
- Distinguish animation callbacks, CPU submission time, GPU time and presented
  frame intervals. A running RAF or a quick `renderer.render()` call alone
  does not establish rendering performance; dependencies can own idle RAFs.
- For loop changes, verify actual drawing/simulation while running, settled,
  paused, fully offscreen and hidden. Check reduced motion both at initial load
  and when the preference changes. Reuse `ExperienceLoop` where applicable.
- Bound expensive canvases and postprocessing targets by total backing pixels
  as well as DPR. Page-spanning overlays must not grow their render targets
  indefinitely with document or interaction bounds.
- Keep substantial geometry generation and simulation warm-up out of a single
  blocking main-thread task. Prefer reusable baked data, workers or cancellable
  time slices; check reset and regeneration paths as well as initial loading.
- In particle/instance loops, reuse scratch objects and typed buffers. Profile
  allocation and upload costs before increasing counts or adding more passes.
- Size image and geometry assets for their actual display roles. Inspect route
  network requests before claiming lazy imports or lazy images avoid a cost.
