import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';

const script = resolve('dev-tools/scripts/create-experiment.js');
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'portfolio-scaffold-'));
  for (const path of [
    'src/pages/experiments/_template',
    'src/vanilla-three/experiences/_template',
    'src/features/lab',
  ]) {
    mkdirSync(join(root, path), { recursive: true });
  }
  for (const path of [
    'src/pages/experiments/_template/Experiment.tsx',
    'src/vanilla-three/experiences/_template/WebGLExperience.ts',
    'src/vanilla-three/experiences/_template/TSLExperience.ts',
    'src/features/lab/registry.ts',
  ])
    cpSync(path, join(root, path));
  try {
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('both scaffold types produce valid TypeScript and distinct registry editions without overwriting', () =>
  fixture((root) => {
    for (const type of ['webgl', 'tsl']) {
      const result = spawnSync(
        process.execPath,
        [script, '--type', type, `${type} smoke`],
        { cwd: root, encoding: 'utf8' }
      );
      assert.equal(result.status, 0, result.stderr);
      const name = type === 'webgl' ? 'WebglSmoke' : 'TslSmoke';
      for (const path of [
        `src/pages/experiments/${name}Experiment.tsx`,
        `src/vanilla-three/experiences/${type}-smoke/${name}Experience.ts`,
        'src/features/lab/registry.ts',
      ]) {
        const source = readFileSync(join(root, path), 'utf8');
        assert.ok(
          !source.includes('EXPERIMENT_'),
          `Unexpanded template in ${path}`
        );
        const compiled = ts.transpileModule(source, {
          fileName: path,
          reportDiagnostics: true,
          compilerOptions: {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.ESNext,
            jsx: ts.JsxEmit.ReactJSX,
          },
        });
        assert.deepEqual(compiled.diagnostics, []);
      }
    }
    const registry = readFileSync(
      join(root, 'src/features/lab/registry.ts'),
      'utf8'
    );
    const editions = [...registry.matchAll(/edition:\s*(\d+)/g)].map((match) =>
      Number(match[1])
    );
    assert.equal(new Set(editions).size, editions.length);
    const duplicate = spawnSync(process.execPath, [script, 'Webgl Smoke'], {
      cwd: root,
    });
    assert.notEqual(duplicate.status, 0);
    assert.equal(
      readFileSync(join(root, 'src/features/lab/registry.ts'), 'utf8'),
      registry
    );
  }));

test('invalid names fail before changing the registry', () =>
  fixture((root) => {
    const registry = readFileSync(
      join(root, 'src/features/lab/registry.ts'),
      'utf8'
    );
    for (const name of ['../escape', '123 bad class', 'reader’s study']) {
      const result = spawnSync(process.execPath, [script, name], { cwd: root });
      assert.notEqual(result.status, 0);
    }
    assert.equal(
      readFileSync(join(root, 'src/features/lab/registry.ts'), 'utf8'),
      registry
    );
  }));
