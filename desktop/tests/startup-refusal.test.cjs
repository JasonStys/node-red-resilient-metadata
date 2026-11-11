/**
 * @file Execute the real main module against real owned profile files while injecting only Electron startup refusal.
 * @description Verify exact own-lock release, changed-token preservation and pre-acquisition refusal without launching Chromium.
 * @remarks This fault-controlled API boundary is not a claim that the operating system returned false during a live GUI run.
 * @remarks Functions, parameters and variables: generated docs/code-map.md (pnpm code-map).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { openProfile } = require('../profile.cjs');

/** Replace only the Electron host API; main, ownership admission, real descriptors and token checks execute unchanged. */
const hostModule = `
import fs from 'node:fs';
import path from 'node:path';
const fixture = globalThis.startupFixture;
export const app = {
  isPackaged: true,
  commandLine: { appendSwitch() {} },
  setName() {},
  on() {},
  getAppPath() { return fixture.resources; },
  setPath(name, value) {
    fixture.calls.push(name);
    if (fixture.mode === 'set-path-error') throw new Error('injected setPath refusal');
    fixture.browser = value;
  },
  requestSingleInstanceLock() {
    if (fixture.mode === 'close-before-runtime') { fixture.calls.push('instance-acquired'); return true; }
    fixture.calls.push('instance-refused');
    fixture.acquiredToken = fs.readFileSync(path.join(fixture.profile, 'owner.lock'), 'utf8');
    if (fixture.mode === 'changed-token') fs.writeFileSync(path.join(fixture.profile, 'owner.lock'), 'foreign retained token');
    return false;
  },
  whenReady() { if (fixture.mode === 'close-before-runtime') return Promise.resolve(); throw new Error('Chromium readiness must never be reached'); },
  quit() { throw new Error('app.quit cannot prove a nonzero Electron failure status'); },
  exit(code) { if (code !== 1) throw new Error('Explicit failure exit1 required'); if(fixture.mode==='close-before-runtime'){fixture.lockAtExit??=[];fixture.lockAtExit.push(fs.existsSync(path.join(fixture.profile,'owner.lock')));} fixture.calls.push('exit:1'); }
};
export const dialog = { showErrorBox(title, message) { fixture.errors.push({title, message}); }, async showMessageBox() { fixture.errors.push({title:'asynchronous shutdown error'}); return {response:0}; } };
export const protocol = { registerSchemesAsPrivileged() {} };
export const BrowserWindow = class {
  constructor() { this.handlers={}; this.webContents={setWindowOpenHandler(){},on(){}}; }
  on(name,handler) { this.handlers[name]=handler; }
  async loadURL() { this.handlers.close({preventDefault(){fixture.closePrevented=true;}}); }
  show() { fixture.visible=true; }
};
export const Menu = {};
export const ipcMain = {};
export const session = {};
export const utilityProcess = {};
`;

/** Run a fresh child so a failed startup cannot leak hooks, environment changes or nonzero exit status into other tests. */
function refusedStartup(t, mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-startup-refusal-'));
  t.after(() => fs.rmSync(root, { recursive: true }));
  const profile = path.join(root, 'workspace');
  const owner = openProfile(profile);
  owner.close();
  const marker = fs.readFileSync(path.join(profile, 'owner.json'));
  const project = Buffer.from('{"synthetic":"existing saved project preserved byte for byte"}\n');
  fs.writeFileSync(path.join(profile, 'project.json'), project);
  if (mode === 'preexisting-lock')
    fs.writeFileSync(path.join(profile, 'owner.lock'), 'preexisting retained token');
  const resources = path.join(root, 'application-resources');
  fs.mkdirSync(resources);
  const proof = path.join(root, 'child-proof.json');
  const main = pathToFileURL(require.resolve('../main.mjs')).href;
  const childCode = `
import fs from 'node:fs';
import { registerHooks } from 'node:module';
globalThis.startupFixture = ${JSON.stringify({ mode, profile, resources, calls: [], errors: [] })};
process.resourcesPath = ${JSON.stringify(resources)};
process.argv.push('--profile', ${JSON.stringify(profile)});
const host = ${JSON.stringify(hostModule)};
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'electron' ? {url:'fault-controlled:electron', shortCircuit:true} : nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    return url === 'fault-controlled:electron' ? {format:'module', source:host, shortCircuit:true} : nextLoad(url, context);
  }
});
await import(${JSON.stringify(main)});
await new Promise(resolve=>setImmediate(resolve));
fs.writeFileSync(${JSON.stringify(proof)}, JSON.stringify(globalThis.startupFixture));
`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', childCode], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(
    result.stderr,
    '',
    'Startup refusal must not become an unhandled ownership exception.',
  );
  const observed = JSON.parse(fs.readFileSync(proof, 'utf8'));
  assert.ok(
    mode === 'close-before-runtime' ? observed.errors.length >= 1 : observed.errors.length === 1,
  );
  assert.equal(observed.calls.at(-1), 'exit:1');
  assert.deepEqual(fs.readFileSync(path.join(profile, 'owner.json')), marker);
  assert.deepEqual(fs.readFileSync(path.join(profile, 'project.json')), project);
  return { profile, observed };
}

test('real main releases its acquired profile lock after the instance API refuses startup', (t) => {
  const { profile, observed } = refusedStartup(t, 'instance-refused');
  assert.match(observed.acquiredToken, /^[a-f0-9]{64}$/u);
  assert.equal(fs.existsSync(path.join(profile, 'owner.lock')), false);
  const reopened = openProfile(profile);
  reopened.close();
});

test('real main releases its acquired profile after setPath throws, without reaching instance or readiness', (t) => {
  const { profile, observed } = refusedStartup(t, 'set-path-error');
  assert.deepEqual(observed.calls, ['userData', 'exit:1']);
  assert.equal(fs.existsSync(path.join(profile, 'owner.lock')), false);
});

test('a token replaced after acquisition is retained while refusal still exits normally with status one', (t) => {
  const { profile } = refusedStartup(t, 'changed-token');
  assert.equal(fs.readFileSync(path.join(profile, 'owner.lock'), 'utf8'), 'foreign retained token');
});

test('a preexisting owner lock is preserved because the refused main never acquires it', (t) => {
  const { profile, observed } = refusedStartup(t, 'preexisting-lock');
  assert.deepEqual(observed.calls, ['exit:1']);
  assert.equal(
    fs.readFileSync(path.join(profile, 'owner.lock'), 'utf8'),
    'preexisting retained token',
  );
});
test('closing the visible verification window before runtime assignment survives real startup rejection without an undefined-child exception', (t) => {
  const { profile, observed } = refusedStartup(t, 'close-before-runtime');
  assert.equal(observed.closePrevented, true);
  assert.equal(observed.visible, true);
  assert.ok(
    observed.lockAtExit.length > 0 && observed.lockAtExit.every((value) => value === false),
    'The actual acquired lock must already be released at every exit call, not merely at a later observation.',
  );
  assert.equal(observed.calls.filter((value) => value === 'exit:1').length, 1);
  console.info(
    JSON.stringify({
      case: 'close-before-runtime',
      lockAtExit: observed.lockAtExit,
      explicitFailureExitCalls: 1,
      hostBoundary: 'fault-controlled Electron API; real main/profile files',
    }),
  );
  assert.equal(fs.existsSync(path.join(profile, 'owner.lock')), false);
});
