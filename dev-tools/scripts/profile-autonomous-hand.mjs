import { createServer } from 'vite';
import { cpus } from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
const server = await createServer({ server: { watch: null, hmr: false } });
try {
  const { HandSimulation } = await server.ssrLoadModule(
    '/src/features/autonomous-hand/simulation.ts'
  );
  const simulation = new HandSimulation(15926);
  for (let i = 0; i < 600; i++) simulation.step();
  const samples = [];
  for (let batch = 0; batch < 40; batch++) {
    const begin = performance.now();
    for (let i = 0; i < 120; i++) simulation.step();
    samples.push((performance.now() - begin) / 120);
  }
  samples.sort((a, b) => a - b);
  const result = {
    cpu: cpus()[0].model,
    runtime: process.version,
    seed: 15926,
    samples: 40,
    unit: 'milliseconds per 120 Hz simulation step, batches of 120',
    median: samples[20],
    p95: samples[38],
    particleCount: simulation.ink.points.length,
  };
  await mkdir('output/autonomous-hand', { recursive: true });
  await writeFile(
    'output/autonomous-hand/perf-current.json',
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result, null, 2));
  simulation.dispose();
} finally {
  await server.close();
}
