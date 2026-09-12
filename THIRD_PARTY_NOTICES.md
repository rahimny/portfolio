# Third-party material

These notices cover material incorporated directly into the repository.
Installed dependencies retain the licences distributed in their packages.
The notices do not license the portfolio as a whole.

## Particle simulation

The standalone `src/vanilla-three/experiences/particles/` study incorporates
the MLS-MPM simulation, structured buffer layout and point-rendering approach
from [Flow](https://github.com/holtsetio/flow), copyright 2025 Holtsetio.
Flow identifies [WebGPU-Ocean](https://github.com/matsuoka-601/WebGPU-Ocean),
copyright 2025 matsuoka-601, as the basis of its MLS-MPM implementation.

The portfolio adds TypeScript integration, lifecycle management, controls and
compatibility changes. The upstream MIT notices are distributed in
`public/third-party/flow-LICENSE.txt` and
`public/third-party/webgpu-ocean-LICENSE.txt`.

The particle force field uses the MaterialX noise implementation distributed
with Three.js.

## Medusa

The brush atlas retains its recorded adaptation credit to Chimera by Michael
Kozlowski (mpkoz), under CC BY-NC 4.0. The scope and changes are documented in
[Medusa's source notice](src/vanilla-three/experiences/medusa/NOTICE.md).

## Fonts

Archivo, Inter and Geist Mono are distributed under the SIL Open Font License
1.1. The complete notices accompany the font files:

- `public/fonts/archivo-OFL.txt`
- `public/fonts/inter-OFL.txt`
- `public/fonts/geist-mono-OFL.txt`

## Geographic data

Ghost Cambridge uses Environment Agency survey data under the Open Government
Licence v3.0 and OpenStreetMap context data. The study displays both providers'
attributions and source links. The data files preserve source and licence
metadata in `public/ghost-cambridge/survey.json` and `context.json`.
