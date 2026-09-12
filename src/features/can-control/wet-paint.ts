import { SurfacePaint, WALL_SURFACE } from '../material-surface/paint';
export type { PaintSnapshot } from '../material-surface/paint';

/** Keep the existing drone surface and its conservative aerosol behaviour. */
export class WetPaint extends SurfacePaint {
  constructor() {
    super(WALL_SURFACE);
  }
}
