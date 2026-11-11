/**
 * @file Independent real-process engine acceptance across actual original Node-RED nodes and HTTP.
 * @description Each case has a fresh complete runtime singleton and owned temporary provider; a failed child cannot become passing evidence.
 * @exports Node builtin tests only.
 * @data No normal profiles, credentials, system services, Docker, MQTT or external provider.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const cases = [
  'success',
  'rate-limit-once',
  'unavailable-once',
  'cooldown-excess',
  'timeout',
  'malformed',
  'auth',
  'not-found',
  'invalid-input',
  'queue-full',
  'cancel-held',
  'cancel-before-input',
  'close-held',
  'redeploy',
  'observer-fault',
];
for (const name of cases)
  test('actual original runtime and owned provider: ' + name, () => {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'engine-case.cjs'), name], {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    assert.equal(result.status, 0, result.stderr + '\n' + result.stdout);
    const receipt = JSON.parse(result.stdout.trim());
    assert.equal(receipt.passed, true);
    assert.equal(receipt.case, name);
    assert.equal(receipt.providerListening, false);
    assert.equal(receipt.noFetchDouble, true);
  });
