import * as T from 'three/webgpu';
import { randomStream } from '@/features/medusa/model';

/** Broken bristles adapted from Chimera, mpkoz, CC BY-NC 4.0.
 * Padded tiles and continuous coverage preserve the stroke at mip boundaries.
 */
export function createBrushAtlas(seed: number, style: number) {
  const random = randomStream(seed);
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let tile = 0; tile < 4; tile++) {
    ctx.save();
    ctx.translate(tile * 256, 0);
    ctx.beginPath();
    ctx.rect(8, 8, 240, 240);
    ctx.clip();
    if (style === 0) {
      // An overlapping loaded body, with visible tapered bristles at the ends.
      for (let y = 20; y < 236; y += 2) {
        const taper = Math.pow(Math.abs(y - 128) / 108, 2) * 30;
        ctx.lineWidth = 2.5 + random() * 3;
        ctx.strokeStyle = random() < 0.12 ? '#929292' : '#fff';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(12 + taper + random() * 22, y);
        ctx.lineTo(244 - taper - random() * 40, y + random() * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#555';
      for (let i = 0; i < 34; i++)
        ctx.fillRect(
          28 + random() * 186,
          24 + random() * 204,
          10 + random() * 30,
          1 + random() * 2
        );
    } else if (style === 1) {
      // One loaded rounded daub, with an irregular perimeter rather than rings.
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      for (let i = 0; i <= 96; i++) {
        const angle = (i / 96) * Math.PI * 2;
        const radius =
          101 + Math.sin(angle * 7 + tile) * 5 + Math.sin(angle * 13) * 2;
        const x = 128 + Math.cos(angle) * radius,
          y = 128 + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.fill();
      ctx.fillStyle = '#bbb';
      for (let i = 0; i < 45; i++)
        ctx.fillRect(
          40 + random() * 170,
          35 + random() * 175,
          12 + random() * 22,
          1.5
        );
    } else if (style === 2) {
      // A single stipple per anatomical anchor, with a soft antialiased boundary.
      const gradient = ctx.createRadialGradient(118, 115, 12, 128, 128, 105);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(0.8, '#eee');
      gradient.addColorStop(1, '#000');
      ctx.fillStyle = gradient;
      ctx.fillRect(20, 20, 216, 216);
    } else {
      // Continuous graphite-like body with fine parallel striations. The old
      // disconnected comb disappeared when its individual teeth were subpixel.
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(12, 52);
      ctx.quadraticCurveTo(120, 14, 244, 43);
      ctx.lineTo(233, 217);
      ctx.quadraticCurveTo(124, 237, 19, 206);
      ctx.closePath();
      ctx.fill();
      ctx.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        ctx.strokeStyle = i % 3 === 0 ? '#aaa' : '#777';
        ctx.lineWidth = 2 + random() * 2;
        ctx.beginPath();
        ctx.moveTo(10 + random() * 14, 46 + i * 11);
        ctx.quadraticCurveTo(
          128,
          32 + i * 11,
          246 - random() * 12,
          44 + i * 11
        );
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // Pack pigment texture separately from coverage. Mipmaps filter the fine
  // tooth instead of an unfiltered fragment hash sparkling during rotation.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const ridge = Math.sin(y * 0.67) * 0.2;
    for (let x = 0; x < canvas.width; x++) {
      const index = (y * canvas.width + x) * 4;
      pixels.data[index + 1] = Math.round(
        128 + (random() - 0.5) * 100 + ridge * 70
      );
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.NoColorSpace;
  map.minFilter = T.LinearMipmapLinearFilter;
  map.magFilter = T.LinearFilter;
  return map;
}
