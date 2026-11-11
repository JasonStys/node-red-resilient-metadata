/**
 * @file Own a persistent Chromium UI profile outside the application, rejecting pre-existing aliases before opening the browser.
 * Functions: admitTree, admitProfile and openProfile; fixed marker and retained lock are not authentication.
 * Variables: bounded directory/file counters and one per-launch random ownership token; no browser data contents are inspected.
 * Line locations: see docs/code-map.md for the generated source index.
 */
'use strict';
const fs = require('node:fs');
const { resolve, join, relative, isAbsolute, sep } = require('node:path');
const { randomBytes } = require('node:crypto');
const { ancestors, readUtf8, newFile } = require('./files.cjs');
const PRODUCT = 'node-red-resilient-metadata';
const ALLOWED = new Set([
  'owner.json',
  'owner.lock',
  'browser-state',
  'project.json',
  'previous.json',
]);

/** Stop enumeration at the actual budget, rather than first allocating an unbounded directory list. */
function boundedNames(directory, maximum) {
  const handle = fs.opendirSync(directory),
    names = [];
  try {
    let entry;
    while ((entry = handle.readSync()) !== null) {
      if (names.length >= maximum) throw new Error('Workspace entry budget exceeded.');
      names.push(entry.name);
    }
    return names;
  } finally {
    handle.closeSync();
  }
}

/** Bound actual entry counts/depth and single-link regular members before Chromium can touch its mutable files. */
function admitTree(directory) {
  let entries = 0,
    bytes = 0;
  const pending = [[directory, 0]];
  let cursor = 0;
  while (cursor < pending.length) {
    const [current, depth] = pending[cursor++];
    if (depth > 16) throw new Error('Existing browser profile exceeds its supported depth.');
    ancestors(current);
    for (const name of boundedNames(current, 10000 - entries)) {
      if (++entries > 10000) throw new Error('Existing browser profile exceeds its entry budget.');
      const path = join(current, name),
        value = fs.lstatSync(path);
      if (value.isSymbolicLink()) throw new Error('Browser profile aliases are not supported.');
      if (value.isDirectory()) pending.push([path, depth + 1]);
      else if (!value.isFile() || value.nlink !== 1)
        throw new Error('Browser profile requires ordinary single-link files.');
      else {
        bytes += value.size;
        if (value.size > 256 * 1024 * 1024 || bytes > 512 * 1024 * 1024)
          throw new Error('Existing browser profile exceeds its byte budget.');
      }
    }
  }
}

/** Static namespace admission only; a trusted same-account writer can race these checks and is outside the contract. */
function admitProfile(path, forbidden = []) {
  if (!isAbsolute(path) || path.startsWith('\\\\') || resolve(path).slice(3).includes(':'))
    throw new Error('Choose an ordinary absolute profile path.');
  const directory = resolve(path);
  ancestors(directory);
  for (const boundary of forbidden) {
    const child = relative(resolve(boundary), directory);
    if (!child || (!isAbsolute(child) && child !== '..' && !child.startsWith('..' + sep)))
      throw new Error('Durable browser data must stay outside application resources.');
  }
  if (fs.existsSync(directory)) {
    const entries = boundedNames(directory, ALLOWED.size);
    if (
      entries.some((name) => !ALLOWED.has(name)) ||
      (entries.length && !entries.includes('owner.json'))
    )
      throw new Error(
        'Unknown workspace content is preserved; select an empty or identified profile.',
      );
    for (const name of entries) {
      const path = join(directory, name),
        value = fs.lstatSync(path);
      if (name === 'browser-state') {
        if (value.isSymbolicLink() || !value.isDirectory())
          throw new Error('Browser state must be an ordinary directory.');
        admitTree(path);
      } else
        readUtf8(
          path,
          name.endsWith('project.json') || name === 'previous.json' ? 32 * 1024 * 1024 : 4096,
        );
    }
  }
  return directory;
}

/** A stale interrupted-owner lock is retained for review, never adopted or deleted automatically. */
function openProfile(path, forbidden = []) {
  const directory = admitProfile(path, forbidden),
    marker = join(directory, 'owner.json'),
    lock = join(directory, 'owner.lock');
  if (fs.existsSync(marker)) {
    const value = JSON.parse(readUtf8(marker, 4096));
    if (
      Object.keys(value).sort().join('|') !== 'id|product|schema' ||
      value.schema !== 1 ||
      value.product !== PRODUCT ||
      !/^[a-f0-9]{32}$/.test(value.id)
    )
      throw new Error('Workspace identity mismatch; existing data is preserved.');
  } else {
    fs.mkdirSync(directory, { recursive: true });
    newFile(
      marker,
      JSON.stringify({
        schema: 1,
        product: PRODUCT,
        id: randomBytes(16).toString('hex'),
      }) + '\n',
    );
  }
  const token = randomBytes(32).toString('hex');
  newFile(lock, token);
  const browser = join(directory, 'browser-state');
  fs.mkdirSync(browser, { recursive: true });
  let closed = false;
  return {
    directory,
    browser,
    close() {
      if (closed) return;
      if (readUtf8(lock, 4096) !== token)
        throw new Error('Workspace owner changed; preserve the retained lock.');
      fs.unlinkSync(lock);
      closed = true;
    },
  };
}

module.exports = { admitTree, admitProfile, openProfile };
