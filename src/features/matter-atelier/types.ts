import type { MotionProfile } from './motion';
export type Point = { x: number; y: number; z: number };
export type Contour = Point[];
export type Form = 'bloom' | 'ribbon' | 'orbit' | 'terrain';
export const LAYERS = 100;
export const BED_Y = 0.86;
export const PRINT_HEIGHT = 2.5;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export interface Move {
  from: Point;
  to: Point;
  start: number;
  end: number;
  extrude: boolean;
  layer: number;
  length: number;
  offset: number;
  motion: MotionProfile;
}
export interface PrintJob {
  moves: Move[];
  duration: number;
  layers: number;
  contours: Contour[];
  height: number;
}
