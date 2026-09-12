import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

const server = await createServer({ server: { watch: null, hmr: false } });
try {
  const { SwimScore } = await server.ssrLoadModule(
    '/src/features/nereid/SwimScore.ts'
  );
  const score = new SwimScore();
  await score.prepare();
  const frames = score.exportFrames();
  await mkdir('public/nereid', { recursive: true });
  await writeFile('public/nereid/home-swim.bin', Buffer.from(frames.buffer));
  console.log(`Nereid swimming recording: ${frames.byteLength} bytes`);
} finally {
  await server.close();
}
