import * as THREE from 'three/webgpu';
import {
  attribute,
  cos,
  sin,
  normalLocal,
  positionLocal,
  transformNormalToView,
  vec2,
  vec3,
  texture,
  uv,
  varying,
} from 'three/tsl';
import { COLUMNS, ROWS, COUNT, TURN } from '@/features/signal-shutters/model';

export const PITCH_X = 0.115;
export const PITCH_Y = 0.14;
export const WIDTH = COLUMNS * PITCH_X;
export const HEIGHT = ROWS * PITCH_Y;

export function makeAtlas(messages: readonly string[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 2040;
  const ctx = canvas.getContext('2d')!;
  const backgrounds = ['#dfff00', '#f1eee4', '#2054f4'];
  const inks = ['#151711', '#151711', '#ffffff'];
  for (let face = 0; face < 3; face++) {
    ctx.save();
    ctx.translate(0, face * 680);
    ctx.fillStyle = backgrounds[face];
    ctx.fillRect(0, 0, 1920, 680);
    ctx.fillStyle = inks[face];
    ctx.font = '500 25px "Geist Mono", monospace';
    ctx.fillText(`SIGNAL OFFICE / TRANSMISSION 0${face + 1}`, 68, 65);
    ctx.textAlign = 'right';
    ctx.fillText('OPEN TO INTERFERENCE', 1852, 65);
    const words = messages[face].trim().split(/\s+/);
    let lines = [words.join(' ')];
    if (words.length > 1) {
      let split = 1;
      let best = Infinity;
      for (let i = 1; i < words.length; i++) {
        const difference = Math.abs(
          words.slice(0, i).join(' ').length - words.slice(i).join(' ').length
        );
        if (difference < best) {
          best = difference;
          split = i;
        }
      }
      lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];
    }
    ctx.textAlign = 'left';
    let size = 255;
    ctx.font = `900 ${size}px Archivo, sans-serif`;
    const longest = Math.max(
      ...lines.map((line) => ctx.measureText(line).width)
    );
    size *= Math.min(1, 1770 / longest);
    ctx.font = `900 ${size}px Archivo, sans-serif`;
    const lineHeight = size * 0.84;
    const start = lines.length === 1 ? 420 : 355 - lineHeight * 0.35;
    lines.forEach((line, i) => ctx.fillText(line, 57, start + i * lineHeight));
    ctx.fillRect(68, 585, 1784, 3);
    ctx.font = '500 26px "Geist Mono", monospace';
    ctx.fillText('PULL THE IMAGE APART.', 68, 636);
    ctx.textAlign = 'right';
    ctx.fillText('IT WILL FIND ITS WAY BACK.  ↗', 1852, 636);
    ctx.restore();
  }
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 4;
  return atlas;
}

export function makeShutters(angles: Float32Array, atlas: THREE.Texture) {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    faces: number[] = [];
  const half = PITCH_X * 0.465;
  const depth = half / Math.sqrt(3);
  const height = PITCH_Y * 0.455;
  // Each of the three side faces has its own print coordinates. The back faces
  // are real geometry: inspection exposes the other transmissions edge-on.
  for (let face = 0; face < 3; face++) {
    const angle = face * TURN;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    for (const [x, y, u, v] of [
      [-half, -height, 0, 0],
      [half, -height, 1, 0],
      [half, height, 1, 1],
      [-half, -height, 0, 0],
      [half, height, 1, 1],
      [-half, height, 0, 1],
    ]) {
      positions.push(c * x + s * depth, y, -s * x + c * depth);
      normals.push(s, 0, c);
      uvs.push(u, v);
      faces.push(face);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute(
    'printFace',
    new THREE.Float32BufferAttribute(faces, 1)
  );
  const turns = new THREE.InstancedBufferAttribute(angles, 1).setUsage(
    THREE.DynamicDrawUsage
  );
  const cells = new Float32Array(COUNT * 2);
  const roots = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    roots[i * 3] = ((i % COLUMNS) + 0.5) * PITCH_X - WIDTH / 2;
    roots[i * 3 + 1] = HEIGHT / 2 - (Math.floor(i / COLUMNS) + 0.5) * PITCH_Y;
    roots[i * 3 + 2] = 0.15;
    cells[i * 2] = i % COLUMNS;
    cells[i * 2 + 1] = ROWS - 1 - Math.floor(i / COLUMNS);
  }
  geometry.setAttribute('turn', turns);
  geometry.setAttribute('root', new THREE.InstancedBufferAttribute(roots, 3));
  geometry.setAttribute('cell', new THREE.InstancedBufferAttribute(cells, 2));
  const material = new THREE.MeshStandardNodeMaterial({
    roughness: 0.64,
    metalness: 0.12,
  });
  const angle = attribute<'float'>('turn', 'float');
  const c = cos(angle),
    s = sin(angle);
  material.positionNode = vec3(
    positionLocal.x.mul(c).add(positionLocal.z.mul(s)),
    positionLocal.y,
    positionLocal.z.mul(c).sub(positionLocal.x.mul(s))
  ).add(attribute<'vec3'>('root', 'vec3'));
  // A prism face has one normal: rotate it at vertices, not at every pixel.
  material.normalNode = varying(
    transformNormalToView(
      vec3(
        normalLocal.x.mul(c).add(normalLocal.z.mul(s)),
        normalLocal.y,
        normalLocal.z.mul(c).sub(normalLocal.x.mul(s))
      )
    ),
    'shutterNormal'
  ).normalize();
  const cellUV = attribute<'vec2'>('cell', 'vec2')
    .add(uv())
    .div(vec2(COLUMNS, ROWS));
  const atlasUV = vec2(
    cellUV.x,
    cellUV.y
      .add(attribute<'float'>('printFace', 'float').oneMinus().add(1))
      .div(3)
  );
  material.colorNode = texture(atlas, varying(atlasUV, 'shutterPrintUV')).rgb;
  const mesh = new THREE.InstancedMesh(geometry, material, COUNT);
  // The position node follows Three's instance transform. Identity matrices keep
  // rotation around each prism's own axis; the root attribute places it afterwards.
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < COUNT; i++) mesh.setMatrixAt(i, matrix);
  // Shader rotation exceeds the unrotated face depth; keep culling conservative.
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), WIDTH);
  return { mesh, turns };
}
