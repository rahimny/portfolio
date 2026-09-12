import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  checkPublication,
  pathIssues,
  textIssues,
} from './check-publication.mjs';

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'publication-guard-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '--quiet');
  git('config', 'user.name', 'Publication test');
  git('config', 'user.email', 'test@example.com');
  return { cwd, git };
}

test('private paths are blocked without blocking public licence notices or env examples', () => {
  for (const path of [
    'docs/notes.md',
    '.agents/skill.md',
    'CLAUDE.md',
    '.env.production',
    'private.key',
  ]) {
    assert.ok(pathIssues(path).length, path);
  }
  for (const path of [
    '.env.example',
    '.env.test.example',
    'public/fonts/OFL.txt',
    'src/NOTICE.md',
  ]) {
    assert.deepEqual(pathIssues(path), [], path);
  }
});

test('sensitive findings expose locations and rules, never values', () => {
  const secret = 'gh' + 'p_' + 'a'.repeat(36);
  const issues = textIssues(Buffer.from(`export const token = '${secret}';`));
  assert.equal(issues[0].rule, 'credential-shaped token');
  assert.equal(JSON.stringify(issues).includes(secret), false);
  assert.ok(
    textIssues(Buffer.from(`const path = '/${'Users'}/sample/project';`)).length
  );
  assert.ok(
    textIssues(Buffer.from(`const path = '/${'home'}/sample/project';`)).length
  );
  assert.deepEqual(
    textIssues(Buffer.from("import { x } from '@/features/home/model';")),
    []
  );
});

test('staged content is scanned even when the working copy is clean', async (t) => {
  const { cwd, git } = fixture(t);
  const path = join(cwd, 'source.js');
  writeFileSync(path, 'export const key = "gh' + 'p_' + 'a'.repeat(36) + '";');
  git('add', 'source.js');
  writeFileSync(path, 'export const key = null;');
  assert.equal((await checkPublication({ cwd })).failures.length, 0);
  assert.match(
    (await checkPublication({ cwd, staged: true })).failures.join('\n'),
    /credential-shaped/
  );
});

test('history catches private documents after deletion', async (t) => {
  const { cwd, git } = fixture(t);
  mkdirSync(join(cwd, 'docs'));
  writeFileSync(join(cwd, 'docs/notes.md'), 'Private fixture.');
  git('add', 'docs');
  git('commit', '--quiet', '-m', 'add fixture');
  git('rm', '-r', 'docs');
  git('commit', '--quiet', '-m', 'remove fixture');
  assert.equal((await checkPublication({ cwd })).failures.length, 0);
  assert.match(
    (await checkPublication({ cwd, history: 'HEAD' })).failures.join('\n'),
    /docs\/notes.md: private working material/
  );
});

test('ignored public images are inspected because Vite deploys them', async (t) => {
  const { cwd } = fixture(t);
  mkdirSync(join(cwd, 'public'));
  writeFileSync(join(cwd, '.gitignore'), 'public/source.jpg\n');
  const image = sharp({
    create: { width: 2, height: 2, channels: 3, background: '#fff' },
  });
  await image
    .withExif({ IFD0: { Artist: 'Private fixture' } })
    .jpeg()
    .toFile(join(cwd, 'public/source.jpg'));
  assert.match(
    (await checkPublication({ cwd })).failures.join('\n'),
    /public\/source.jpg: embedded image metadata/
  );
});

test('history scans commit messages without exposing matching content', async (t) => {
  const { cwd, git } = fixture(t);
  const secret = 'gh' + 'p_' + 'a'.repeat(36);
  git('commit', '--allow-empty', '--quiet', '-m', `fixture ${secret}`);
  const result = await checkPublication({ cwd, history: 'HEAD' });
  assert.match(result.failures.join('\n'), /commit message: credential-shaped/);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('staged image paths retain tabs so their metadata is still inspected', async (t) => {
  const { cwd, git } = fixture(t);
  const path = 'source\timage.jpg';
  await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#fff' },
  })
    .withExif({ IFD0: { Artist: 'Private fixture' } })
    .jpeg()
    .toFile(join(cwd, path));
  git('add', path);
  const { failures } = await checkPublication({ cwd, staged: true });
  assert.ok(
    failures.some(
      (failure) =>
        failure.startsWith(path) && failure.includes('embedded image metadata')
    )
  );
});
