import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const privateRoots = new Set([
  'docs',
  'references',
  'taste',
  '.agents',
  '.claude',
  '.codex',
  'output',
  'tmp',
  '.playwright-mcp',
]);

export function pathIssues(path) {
  const parts = path.split('/');
  const name = parts.at(-1);
  const issues = [];
  if (
    privateRoots.has(parts[0]) ||
    ['CLAUDE.md', 'skills-lock.json'].includes(name)
  ) {
    issues.push('private working material');
  }
  if (
    (/^\.env(?:\.|$)/.test(name) && !name.endsWith('.example')) ||
    ['.npmrc', '.netrc'].includes(name) ||
    /\.(?:pem|key|p12|pfx|keystore)$/.test(name)
  ) {
    issues.push('credential or machine configuration file');
  }
  if (/\.(?:log|tsbuildinfo|blend[12])$/.test(name)) {
    issues.push('local generated file');
  }
  return issues;
}

const contentRules = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  [
    'credential-shaped token',
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/,
  ],
  [
    'absolute user-directory path',
    /(?:^|[\s"'`=(])(?:\/(?:Users|home)\/[\w.-]+\/|[A-Z]:\\Users\\[\w.-]+\\)/m,
  ],
];

export function textIssues(buffer) {
  if (buffer.includes(0)) return [];
  const text = buffer.toString('utf8');
  return contentRules.flatMap(([rule, pattern]) => {
    const match = pattern.exec(text);
    return match
      ? [{ rule, line: text.slice(0, match.index).split('\n').length }]
      : [];
  });
}

async function inspect(path, data, label, failures) {
  for (const issue of textIssues(data)) {
    failures.push(`${label}:${issue.line}: ${issue.rule}`);
  }
  if (/\.(?:png|jpe?g|webp|avif|tiff?)$/i.test(path)) {
    try {
      const metadata = await sharp(data).metadata();
      if (
        metadata.exif ||
        metadata.iptc ||
        metadata.xmp ||
        metadata.comments?.length
      ) {
        failures.push(`${label}: embedded image metadata needs review`);
      }
    } catch {
      failures.push(`${label}: image metadata could not be inspected`);
    }
  }
}

export async function checkPublication({ cwd, staged = false, history } = {}) {
  cwd ??= process.cwd();
  const git = (...args) =>
    execFileSync('git', args, { cwd, maxBuffer: 256 * 1024 * 1024 });
  const failures = [];
  const entries = new Map();
  const checkedPaths = new Set();
  function add(path, oid, mode) {
    const label = oid ? `${path} [${oid.slice(0, 12)}]` : path;
    if (!checkedPaths.has(path)) {
      checkedPaths.add(path);
      for (const issue of pathIssues(path)) failures.push(`${path}: ${issue}`);
    }
    if (mode === '120000' || mode === '160000') {
      failures.push(`${label}: symlink or submodule needs publication review`);
      return;
    }
    // Scan a blob again under a different path: its suffix controls image checks.
    entries.set(`${oid ?? ''}:${path}`, { path, oid, label });
  }
  if (history) {
    const commits = git('rev-list', history)
      .toString()
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const commit of commits) {
      for (const entry of git('ls-tree', '-rz', commit)
        .toString()
        .split('\0')
        .filter(Boolean)) {
        const separator = entry.indexOf('\t');
        const header = entry.slice(0, separator);
        const path = entry.slice(separator + 1);
        const [mode, , oid] = header.split(' ');
        add(path, oid, mode);
      }
      for (const issue of textIssues(
        git('show', '-s', '--format=%B', commit)
      )) {
        failures.push(`${commit.slice(0, 12)} commit message: ${issue.rule}`);
      }
    }
  } else if (staged) {
    for (const entry of git('ls-files', '--stage', '-z')
      .toString()
      .split('\0')
      .filter(Boolean)) {
      const separator = entry.indexOf('\t');
      const header = entry.slice(0, separator);
      const path = entry.slice(separator + 1);
      const [mode, oid, stage] = header.split(' ');
      if (stage !== '0') failures.push(`${path}: unresolved merge`);
      add(path, oid, mode);
    }
  } else {
    const paths = new Set(
      git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
        .toString()
        .split('\0')
        .filter(Boolean)
    );
    // Vite copies ignored files in public/ too. Git's candidate list is not
    // sufficient to describe what the deployed site will expose.
    function publicFiles(dir) {
      if (lstatSync(resolve(cwd, dir)).isSymbolicLink()) {
        paths.add(dir);
        return;
      }
      for (const entry of readdirSync(resolve(cwd, dir), {
        withFileTypes: true,
      })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) publicFiles(path);
        else paths.add(path);
      }
    }
    try {
      publicFiles('public');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    for (const path of paths) {
      let stat;
      try {
        stat = lstatSync(resolve(cwd, path));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      add(path, undefined, stat.isSymbolicLink() ? '120000' : '100644');
    }
  }
  for (const { path, oid, label } of entries.values()) {
    await inspect(
      path,
      oid ? git('cat-file', 'blob', oid) : readFileSync(resolve(cwd, path)),
      label,
      failures
    );
  }
  return { files: entries.size, failures: [...new Set(failures)] };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const valid =
    args.length === 0 ||
    (args.length === 1 && args[0] === '--staged') ||
    (args.length === 2 && args[0] === '--history' && !args[1].startsWith('-'));
  if (!valid)
    throw new Error(
      'Usage: check-publication.mjs [--staged | --history <revision-range>]'
    );
  try {
    const { files, failures } = await checkPublication({
      staged: args[0] === '--staged',
      history: args[0] === '--history' ? args[1] : undefined,
    });
    for (const failure of failures) console.error(failure);
    console.log(
      `Publication guard: ${files} files/blob versions, ${failures.length} findings. Matched content is never printed.`
    );
    console.log(
      'This is a targeted guard, not an authorship, licence or comprehensive secret audit. Review commit identities separately.'
    );
    if (failures.length) process.exitCode = 1;
  } catch {
    // Child-process errors can contain captured blob bytes. Do not dump them.
    console.error(
      'Publication guard could not complete. Check the revision and file accessibility locally.'
    );
    process.exitCode = 1;
  }
}
