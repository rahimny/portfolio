#!/usr/bin/env node
import { createServer } from 'vite';
import { writeFile } from 'node:fs/promises';
const server = await createServer({ server: { watch: null, hmr: false } });
try {
  const { buildFilament } = await server.ssrLoadModule(
    '/src/features/filament/model.ts'
  );
  const { buildSignalGraph, encodeSignalGraph } = await server.ssrLoadModule(
    '/src/features/filament/signals.ts'
  );
  const { makePulseField, encodePulseField } = await server.ssrLoadModule(
    '/src/features/filament/pulses.ts'
  );
  const model = buildFilament(),
    graph = buildSignalGraph(model.network);
  await writeFile(
    'public/filament/routes.bin',
    Buffer.from(encodeSignalGraph(graph))
  );
  const pulses = makePulseField(graph);
  await writeFile(
    'public/filament/pulses.bin',
    Buffer.from(encodePulseField(pulses))
  );
  console.log(
    `${graph.positions.length / 2} fibre junctions, ${graph.neighbours.length / 2} undirected links; ${model.segments} original drawing segments.`
  );
} finally {
  await server.close();
}
