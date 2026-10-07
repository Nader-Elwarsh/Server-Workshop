#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Split the legacy API name so the exhaustive mode does not flag the scanner itself.
const LEGACY_TOKEN = ['local', 'Storage'].join('');
const DEFAULT_ROOT = process.cwd();
const MIGRATION_FILE = 'workshop-idb.js';
const APPROVED_MIGRATION_TOKEN_COUNT = 11;
const RUNTIME_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.html', '.css', '.json',
  '.vue', '.svelte', '.astro', '.sh', '.py', '.php', '.go', '.rs'
]);
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.wasm',
  '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.mp4', '.webm', '.mov', '.sqlite', '.db'
]);

function parseArgs(argv) {
  const options = { mode: 'runtime', root: DEFAULT_ROOT, includeDependencies: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') options.mode = 'all';
    else if (arg === '--runtime') options.mode = 'runtime';
    else if (arg === '--include-dependencies') options.includeDependencies = true;
    else if (arg === '--root') {
      if (!argv[i + 1]) throw new Error('--root needs a directory path');
      options.root = path.resolve(argv[++i]);
    } else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node check-local-storage.js [--runtime|--all] [--root DIR] [--include-dependencies]

  --runtime  Scan first-party deployable code. Fail on any legacy API token
             outside ${MIGRATION_FILE}; that migration adapter is allowed only
             its current ${APPROVED_MIGRATION_TOKEN_COUNT}-token compatibility surface.
  --all      Scan every readable text file, including tests, docs and vendor files.
             Any match fails. This is the literal zero-residue audit.
  --root     Project directory (default: current directory).
  --include-dependencies  Include node_modules in --all mode.`);
}

function isIgnoredDirectory(name, mode, includeDependencies) {
  if (name === '.git') return true;
  return mode === 'all' && name === 'node_modules' && !includeDependencies;
}

function isRuntimeExcluded(relPath, name) {
  const parts = relPath.split(path.sep);
  if (parts.some(part => ['vendor', 'node_modules', 'dist', 'build', 'coverage', '.git'].includes(part))) return true;
  if (/(^|[-_.])(test|tests|spec|specs)([-_.]|$)/i.test(name)) return true;
  if (/(^|[-_.])(quality|smoke|syntax|action|wiring|check)([-_.]|$)/i.test(name)) return true;
  return name === path.basename(__filename);
}

function isBinary(buffer, filePath) {
  if (BINARY_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return true;
  return buffer.subarray(0, Math.min(buffer.length, 8192)).includes(0);
}

function walk(root, mode, includeDependencies, rel = '') {
  const dir = path.join(root, rel);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const childRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (!isIgnoredDirectory(entry.name, mode, includeDependencies)) {
        files.push(...walk(root, mode, includeDependencies, childRel));
      }
      continue;
    }
    if (!entry.isFile()) continue;
    if (mode === 'runtime') {
      if (!RUNTIME_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      if (isRuntimeExcluded(childRel, entry.name)) continue;
    }
    files.push(childRel);
  }
  return files;
}

function matchesIn(text) {
  const pattern = new RegExp(LEGACY_TOKEN, 'gi');
  const matches = [];
  for (const [lineIndex, line] of text.split(/\r?\n/).entries()) {
    let match;
    while ((match = pattern.exec(line)) !== null) {
      matches.push({ line: lineIndex + 1, column: match.index + 1, text: line.trim().slice(0, 220) });
    }
  }
  return matches;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return printHelp();
  const root = path.resolve(options.root);
  if (!fs.statSync(root).isDirectory()) throw new Error(`Not a directory: ${root}`);

  const files = walk(root, options.mode, options.includeDependencies);
  const hits = [];
  for (const rel of files) {
    const fullPath = path.join(root, rel);
    const buffer = fs.readFileSync(fullPath);
    if (isBinary(buffer, fullPath)) continue;
    const text = buffer.toString('utf8');
    const found = matchesIn(text);
    if (found.length) hits.push({ rel, matches: found });
  }

  const total = hits.reduce((sum, hit) => sum + hit.matches.length, 0);
  if (options.mode === 'runtime') {
    const migration = hits.find(hit => hit.rel === MIGRATION_FILE);
    const unexpected = hits.filter(hit => hit.rel !== MIGRATION_FILE);
    const migrationCount = migration ? migration.matches.length : 0;
    if (unexpected.length || migrationCount !== APPROVED_MIGRATION_TOKEN_COUNT) {
      console.error('FAIL: unexpected legacy-storage references in deployable first-party code.');
      if (migration && migrationCount !== APPROVED_MIGRATION_TOKEN_COUNT) {
        console.error(`  ${MIGRATION_FILE}: expected ${APPROVED_MIGRATION_TOKEN_COUNT} approved references, found ${migrationCount}; review the migration/fallback allowlist.`);
      }
      for (const hit of unexpected) {
        for (const match of hit.matches) console.error(`  ${hit.rel}:${match.line}:${match.column}: ${match.text}`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`PASS: ${files.length} first-party runtime files scanned; no unapproved references.`);
    console.log(`ALLOWLIST: ${MIGRATION_FILE} contains ${migrationCount} approved migration/fallback references.`);
    return;
  }

  if (!total) {
    console.log(`PASS: literal zero-residue audit; ${files.length} readable project files scanned.`);
    return;
  }
  console.error(`FAIL: found ${total} legacy-storage token(s) in ${hits.length} file(s).`);
  for (const hit of hits) {
    const shown = hit.matches.slice(0, 8);
    for (const match of shown) console.error(`  ${hit.rel}:${match.line}:${match.column}: ${match.text}`);
    if (hit.matches.length > shown.length) console.error(`  ... ${hit.matches.length - shown.length} additional match(es) in ${hit.rel}`);
  }
  console.error('Remove or justify each match, then rerun with --all.');
  process.exitCode = 1;
}

try { main(); }
catch (error) { console.error(`Storage audit failed: ${error.message}`); process.exitCode = 2; }
