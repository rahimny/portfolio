import { membraneFromMask } from '@/features/pressure-type/mesh';
import { PressureBody, PressureWorld } from '@/features/pressure-type/model';
import {
  readSettings,
  type PressureSettings,
} from '@/features/pressure-type/settings';

export const WORD = 'INK';
const ROWS = 24;
const CAP_HEIGHT = 1.6;

/** Rasterise Archivo once; physics resolution is independent of the viewport. */
export function createWord(
  settings: PressureSettings = readSettings(null)
): PressureWorld {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas text sampling is unavailable');
  context.font = '900 180px Archivo';
  context.textBaseline = 'alphabetic';
  const glyphs = [...WORD].map((char) => {
    context.clearRect(0, 0, 256, 256);
    context.fillStyle = 'black';
    const metrics = context.measureText(char);
    const left = metrics.actualBoundingBoxLeft;
    const width = metrics.actualBoundingBoxRight + left;
    const height = metrics.actualBoundingBoxAscent;
    context.fillText(char, 8 + left, 8 + height);
    const data = context.getImageData(0, 0, 256, 256).data;
    const columns = Math.max(3, Math.round((ROWS * width) / height));
    const mask = new Uint8Array(columns * ROWS);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < columns; x++) {
        const px = Math.floor(8 + ((x + 0.5) / columns) * width);
        const py = Math.floor(8 + ((y + 0.5) / ROWS) * height);
        mask[y * columns + x] = data[(py * 256 + px) * 4 + 3] > 100 ? 1 : 0;
      }
    }
    return {
      mesh: membraneFromMask(mask, columns, ROWS, CAP_HEIGHT / ROWS),
      width: (columns * CAP_HEIGHT) / ROWS,
    };
  });
  const gap = 0.085;
  const total =
    glyphs.reduce((sum, glyph) => sum + glyph.width, 0) +
    gap * (glyphs.length - 1);
  let cursor = -total / 2;
  return new PressureWorld(
    glyphs.map((glyph) => {
      const body = new PressureBody(
        glyph.mesh,
        cursor + glyph.width / 2,
        settings
      );
      cursor += glyph.width + gap;
      return body;
    })
  );
}
