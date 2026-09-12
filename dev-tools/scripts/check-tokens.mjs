#!/usr/bin/env node
/**
 * Guards the token system.
 *
 * The old codebase mixed hardcoded Tailwind palette colours (green-500,
 * yellow-500, blue-500/20, …) into components that otherwise used semantic
 * tokens, which is why the status pills and shader cards looked like they
 * came from a different product. This fails the build if that creeps back.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const PALETTE =
  'slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

// bg-red-500, text-green-400/20, border-blue-500, from-purple-500 …
const RAW_UTILITY = new RegExp(
  `\\b(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|decoration|accent|caret|divide|placeholder)-(?:${PALETTE})-\\d{2,3}\\b`,
  'g'
);
// Hex literals in class strings / inline styles (shaders and GLSL are exempt)
const HEX = /#[0-9a-fA-F]{3,8}\b/g;

const EXEMPT_DIRS = ['three', 'vanilla-three']; // colour is data in shader code
const EXEMPT_FILES = ['styles/tokens.css'];

/**
 * Pre-existing violations, all in files scheduled for deletion or replacement.
 * This list may only ever SHRINK — never add to it. Delete each entry as the
 * corresponding file is migrated onto tokens.
 *
 * Emptied by the paper/ink/signal re-lock: App.css was dead and is deleted, and
 * the other three carried hardcoded palette colours (a six-stop rainbow conic,
 * five per-category gradients, green/yellow/grey status pills) that were merely
 * ugly against mint and are unusable against one orange. Their LAYOUTS are
 * still Phase 5 — only the colour moved onto tokens.
 */
const LEGACY = new Set([]);

const EXT = /\.(tsx?|css)$/;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (EXT.test(entry.name)) yield path;
  }
}

const problems = [];
const legacyStillPresent = new Set();

for await (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  if (EXEMPT_DIRS.some((d) => rel.startsWith(d + '/'))) continue;
  if (EXEMPT_FILES.includes(rel)) continue;
  if (LEGACY.has(rel)) {
    legacyStillPresent.add(rel);
    continue;
  }

  const text = await readFile(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const re of [RAW_UTILITY, HEX]) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        problems.push(`src/${rel}:${i + 1}  ${m[0]}`);
      }
    }
  });
}

if (problems.length) {
  console.error(
    `\nRaw colour values found. Use a semantic token from src/styles/tokens.css instead.\n`
  );
  for (const p of problems) console.error('  ' + p);
  console.error(`\n${problems.length} violation(s).\n`);
  process.exit(1);
}

// Keep the allowlist honest: once a legacy file is gone, its entry must go too.
const stale = [...LEGACY].filter((f) => !legacyStillPresent.has(f));
if (stale.length) {
  console.error(
    `\nStale LEGACY entries in check-tokens.mjs — these files no longer exist ` +
      `or no longer violate. Remove them from the list:\n`
  );
  for (const f of stale) console.error('  ' + f);
  process.exit(1);
}

console.log(
  `Token guard: clean. ${LEGACY.size} legacy file(s) still allowlisted.`
);
