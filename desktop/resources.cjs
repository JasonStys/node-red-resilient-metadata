/**
 * @file Verify fixed runtime/UI bytes before loading bundled library and dependency modules.
 * @description Closed inventory and bounded single-link files; owner comparisons detect consistency, not external code-signing attestation.
 * @exports OWNER, verifiedResources and responseFor.
 * @data Only the three fixed UI byte buffers can be served through the private scheme.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { join, posix } = require('node:path');
const { readRegular, readUtf8, createAncestorAdmission } = require('./files.cjs');
const OWNER = [
  'files.cjs',
  'profile.cjs',
  'state.cjs',
  'operation.cjs',
  'runtime-channel.cjs',
  'runtime-owner.mjs',
  'runtime-worker.cjs',
  'flow-engine.cjs',
  'resources.cjs',
  'preload.cjs',
  'main.mjs',
];
const UI = ['index.html', 'app.js', 'style.css'];
function verifiedResources(root, ownerRoot) {
  const metadata = JSON.parse(readUtf8(join(root, 'SOURCE.json'), 8 * 1024 * 1024));
  if (
    !metadata ||
    Object.keys(metadata).sort().join('|') !==
      'files|owner|product|schema|source|sourceDirty|version' ||
    metadata.schema !== 1 ||
    metadata.product !== 'node-red-resilient-metadata' ||
    metadata.version !== '1.1.0' ||
    !/^[a-f0-9]{40}$/.test(metadata.source) ||
    typeof metadata.sourceDirty !== 'boolean' ||
    !metadata.files ||
    !metadata.owner ||
    Object.keys(metadata.owner).sort().join('|') !== [...OWNER].sort().join('|')
  )
    throw new Error('Native metadata-workbench identity differs.');
  const names = Object.keys(metadata.files);
  const admit = createAncestorAdmission();
  if (
    names.length < 10 ||
    names.length > 30000 ||
    ![
      ...UI,
      'runtime-package.json',
      'BUNDLED-NOTICES.txt',
      'library/workbench/project.js',
      'node_modules/node-red/package.json',
      'node_modules/npm/package.json',
    ].every((name) => names.includes(name))
  )
    throw new Error('Native runtime inventory is incomplete.');
  const directories = new Set(['']);
  for (const name of names) {
    if (
      name.startsWith('/') ||
      /[<>:"\\|?*]/u.test(name) ||
      [...name].some((character) => character.charCodeAt(0) < 32) ||
      name.split('/').some((part) => !part || part === '.' || part === '..' || /[. ]$/u.test(part))
    )
      throw new Error('Unsafe packaged member.');
    let parent = posix.dirname(name);
    while (parent !== '.') {
      directories.add(parent);
      parent = posix.dirname(parent);
    }
  }
  // Refuse unexpected trees before descending, rather than enumerate arbitrary content recursively.
  let count = 0;
  const pending = [''];
  while (pending.length) {
    const relative = pending.pop();
    admit(join(root, relative));
    const handle = fs.opendirSync(join(root, relative));
    try {
      let member;
      while ((member = handle.readSync()) !== null) {
        if (++count > 60000) throw new Error('Packaged entry budget exceeded.');
        const name = relative ? relative + '/' + member.name : member.name;
        if (name === 'SOURCE.json' && !relative) continue;
        const actual = fs.lstatSync(join(root, name));
        if (actual.isSymbolicLink()) throw new Error('Runtime aliases are not supported.');
        if (actual.isDirectory()) {
          if (!directories.has(name)) throw new Error('Unknown runtime directory.');
          pending.push(name);
        } else if (!Object.hasOwn(metadata.files, name)) throw new Error('Unknown runtime file.');
      }
    } finally {
      handle.closeSync();
    }
  }
  const data = new Map();
  let total = 0;
  for (const [inventory, base] of [
    [metadata.files, root],
    [metadata.owner, ownerRoot],
  ])
    for (const [name, expected] of Object.entries(inventory)) {
      if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
        throw new Error('Invalid packaged digest.');
      const bytes = readRegular(join(base, name), 32 * 1024 * 1024, admit);
      total += bytes.length;
      if (
        total > 512 * 1024 * 1024 ||
        createHash('sha256').update(bytes).digest('hex') !== expected
      )
        throw new Error('Packaged bytes differ.');
      if (base === root && UI.includes(name)) data.set('/' + name, bytes);
    }
  return { metadata, data };
}
function responseFor(request, data) {
  const url = new URL(request.url),
    name = url.pathname === '/' ? '/index.html' : url.pathname,
    bytes = data.get(name);
  if (
    url.protocol !== 'metadata:' ||
    url.hostname !== 'workbench' ||
    url.port ||
    url.username ||
    url.password ||
    !['GET', 'HEAD'].includes(request.method) ||
    !bytes
  )
    return new Response('Not found', { status: 404 });
  return new Response(request.method === 'HEAD' ? null : bytes, {
    headers: {
      'content-type': name.endsWith('.html')
        ? 'text/html; charset=utf-8'
        : name.endsWith('.css')
          ? 'text/css'
          : 'text/javascript',
      'content-security-policy':
        "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'",
      'x-content-type-options': 'nosniff',
      'cache-control': 'no-store',
    },
  });
}
module.exports = { OWNER, verifiedResources, responseFor };
