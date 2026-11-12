/**
 * @file Durable native project/history with explicit previous-version recovery and compare-before-save.
 * @description Plaintext owner-local state, never an authenticated or encrypted multiuser database.
 * @remarks Fixed single-link members and ordinary ancestors are admitted before writes; concurrent hostile same-owner changes are outside this contract.
 * @remarks Functions, parameters, state variables and exact declaration locations: generated docs/code-map.md (pnpm code-map).
 */
'use strict';
const fs = require('node:fs');
const { join } = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { readUtf8, newFile } = require('./files.cjs');
const MAXIMUM = 32 * 1024 * 1024;
const hash = (text) => createHash('sha256').update(text).digest('hex');

/** Preserve current and previous data on invalid input or a conflicting save; never silently adopt damaged state. */
function openState(directory, validate, initial) {
  const current = join(directory, 'project.json');
  const previous = join(directory, 'previous.json');
  const read = (name) => {
    const text = readUtf8(name, MAXIMUM);
    return { text, value: validate(JSON.parse(text)), sha256: hash(text) };
  };
  const encode = (value) => {
    const text = JSON.stringify(validate(value)) + '\n';
    if (Buffer.byteLength(text) > MAXIMUM)
      throw new Error('Workspace state exceeds its byte budget.');
    return text;
  };
  if (!fs.existsSync(current)) newFile(current, encode(initial));
  let state = read(current);
  // Validate retained evidence too, instead of overwriting an unexplained previous member.
  if (fs.existsSync(previous)) read(previous);
  return {
    load() {
      return {
        value: state.value,
        sha256: state.sha256,
        hasPrevious: fs.existsSync(previous),
      };
    },
    save(value, expected) {
      const text = encode(value);
      if (
        typeof expected !== 'string' ||
        read(current).sha256 !== expected ||
        state.sha256 !== expected
      )
        throw new Error('Workspace changed; reload and review before saving.');
      if (fs.existsSync(previous)) read(previous);
      const nonce = randomBytes(16).toString('hex');
      const nextPath = join(directory, '.project-' + nonce);
      const priorPath = join(directory, '.previous-' + nonce);
      // Both complete new files are flushed before replacing an identified fixed member.
      newFile(nextPath, text);
      newFile(priorPath, state.text);
      fs.renameSync(priorPath, previous);
      fs.renameSync(nextPath, current);
      state = read(current);
      return this.load();
    },
    previous() {
      if (!fs.existsSync(previous)) throw new Error('No previous saved project is available.');
      return read(previous).value;
    },
  };
}
module.exports = { openState };
