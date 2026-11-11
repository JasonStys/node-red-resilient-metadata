/**
 * @file Actual Electron/Node-RED/provider user journeys against source or the relocated compiled application.
 * @description Authored payloads/records, real fault/cancel/redeploy, exports, persistence and normal Quit are mandatory.
 * @exports No public API; literal test paths identify disposable synthetic workspaces only.
 * @data Screenshot/receipt outputs contain prepared data, never a normal user profile or credential.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { once } from 'node:events';
const require = createRequire(import.meta.url);
const { _electron, expect } = require('../node_modules/@playwright/test');
const root = path.resolve(import.meta.dirname, '../..');
const source = process.argv[2] === '--source',
  executable = source ? require('../node_modules/electron') : path.resolve(process.argv[2] ?? '');
const output = path.resolve(process.argv[3] ?? '');
if (!process.argv[2] || !process.argv[3] || process.argv.length !== 4 || fs.existsSync(output))
  throw new Error('Choose the exact application and a fresh disposable output directory.');
fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, 'profile'),
  errors = [],
  exits = [],
  identities = [],
  steps = [],
  diagnostics = [];
let application;
const entry = async () => {
  application = await _electron.launch({
    executablePath: executable,
    args: [...(source ? [path.join(root, 'desktop')] : []), '--profile', profile],
    cwd: output,
    env: {
      ...process.env,
      ...(source
        ? { METADATA_NATIVE_RESOURCES: path.join(root, '.runtime/native-resources-002') }
        : {}),
    },
    timeout: 120000,
  });
  const record = (chunk) => {
    if (diagnostics.reduce((sum, text) => sum + text.length, 0) < 65536)
      diagnostics.push(chunk.toString().slice(0, 8192));
  };
  application.process().stderr.on('data', record);
  application.process().stdout.on('data', record);
  const page = await application.firstWindow({ timeout: 120000 });
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('#status')).toContainText('Ready.', { timeout: 120000 });
  expect(
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
  ).toBe(true);
  await expect(page.locator('footer')).toContainText('v1.1.0');
  const identity = await application.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    node: process.versions.node,
    electron: process.versions.electron,
  }));
  expect(identity.packaged).toBe(!source);
  expect(identity.node).toBe('24.22.2');
  expect(identity.electron).toBe('44.11.1');
  identities.push(identity);
  return page;
};
async function save(page) {
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('Project validated and saved.', {
    timeout: 15000,
  });
}
async function run(page) {
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('Actual batch completed', { timeout: 30000 });
}
async function chooseExport(name) {
  await application.evaluate(
    ({ dialog }, file) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    },
    path.join(output, name),
  );
}
async function waitExit(ended) {
  let timer;
  try {
    return await Promise.race([
      ended,
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Normal app/child shutdown did not complete.')),
          45000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function quit() {
  const proc = application.process();
  const ended = once(proc, 'exit');
  await application.evaluate(({ app }) => app.quit());
  const [code, signal] = await waitExit(ended);
  expect(code).toBe(0);
  expect(signal).toBeNull();
  exits.push(code);
  expect(fs.existsSync(path.join(profile, 'owner.lock'))).toBe(false);
}
try {
  let page = await entry();
  await page
    .locator('#payloads')
    .fill(
      '[{"productId":"drive-200","version":"2.4.1"},{"productId":"pump-40","version":"3.2.0"}]',
    );
  const records = JSON.parse(await page.locator('#records').inputValue());
  records[0].metadata.ratedVoltageV = 460;
  await page.locator('#records').fill(JSON.stringify(records, null, 2));
  await page.locator('#title').fill('Plant 7 / authorized motor maintenance');
  await save(page);
  await run(page);
  await expect(page.locator('#results tr')).toHaveCount(2);
  await expect(page.locator('#results tr').first()).toContainText('success');
  await page.getByRole('button', { name: 'Inspect input 1', exact: true }).click();
  await expect(page.locator('#detail')).toContainText('460');
  await expect(page.locator('#detail')).toContainText('drive-200');
  await page.screenshot({
    path: path.join(output, 'native-authored-metadata.png'),
    fullPage: true,
  });
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(output, 'native-authored-metadata-viewport.png'),
    fullPage: false,
    scale: 'css',
  });
  steps.push('authored records/messages executed through original nodes; exact voltage460');
  const savedBeforeReplacement = fs.readFileSync(path.join(profile, 'project.json'));
  const draftPayloads = await page.locator('#payloads').inputValue(),
    draftRecords = await page.locator('#records').inputValue();
  await application.evaluate(({ dialog }) => {
    globalThis.metadataOpenCalls = 0;
    dialog.showOpenDialog = async () => {
      globalThis.metadataOpenCalls++;
      return { canceled: true, filePaths: [] };
    };
  });
  for (const id of ['prepared', 'previous', 'import', 'restore-run']) {
    await page.locator('#title').fill('Unsaved review before ' + id);
    await page.locator('#' + id).click();
    await expect(page.locator('#replace-confirm')).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
    await expect(page.locator('#status')).toContainText('Kept the unsaved editor draft');
    await expect(page.locator('#title')).toHaveValue('Unsaved review before ' + id);
    await expect(page.locator('#payloads')).toHaveValue(draftPayloads);
    await expect(page.locator('#records')).toHaveValue(draftRecords);
    expect(fs.readFileSync(path.join(profile, 'project.json')).equals(savedBeforeReplacement)).toBe(
      true,
    );
  }
  expect(await application.evaluate(() => globalThis.metadataOpenCalls)).toBe(0);
  await page.locator('#prepared').click();
  await page.getByRole('button', { name: 'Replace draft', exact: true }).click();
  await expect(page.locator('#title')).toHaveValue('Maintenance metadata integration');
  await page.locator('#restore-run').click();
  await page.getByRole('button', { name: 'Replace draft', exact: true }).click();
  await expect(page.locator('#title')).toHaveValue('Plant 7 / authorized motor maintenance');
  await save(page);
  steps.push(
    'all four replacement paths keep unsaved exact drafts; explicit prepared/history replacement and save work',
  );
  const before = fs.readFileSync(path.join(profile, 'project.json'));
  await page.locator('#payloads').fill('[1e9999]');
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('must be finite');
  expect(fs.readFileSync(path.join(profile, 'project.json')).equals(before)).toBe(true);
  await page.locator('#payloads').fill('[{"productId":"drive-200","productId":"pump-40"}]');
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('duplicate JSON keys');
  expect(fs.readFileSync(path.join(profile, 'project.json')).equals(before)).toBe(true);
  await page
    .locator('#payloads')
    .fill(
      '[{"productId":"drive-200","version":"2.4.1"}, {"productId":"pump-40","version":"3.2.0"}]',
    );
  await save(page);
  steps.push('duplicate authored fragment refused; saved state unchanged');
  await page.locator('#scenario').selectOption('rate-limit-once');
  await save(page);
  await run(page);
  await expect(page.locator('#detail')).toContainText('429');
  expect(
    JSON.parse(fs.readFileSync(path.join(profile, 'project.json'), 'utf8')).history.at(-1).run
      .provider.requests,
  ).toBe(3);
  steps.push('actual429+retry three requests for two inputs');
  await page.locator('#scenario').selectOption('success');
  await page
    .locator('#payloads')
    .fill('[{"productId":"drive-200","version":"2.4.1"}, {"productId":42}]');
  await save(page);
  await run(page);
  await expect(page.locator('#results tr').nth(1)).toContainText('failure');
  await page.getByRole('button', { name: 'Inspect input 2', exact: true }).click();
  await expect(page.locator('#detail')).toContainText('INVALID_INPUT');
  steps.push('actual original malformed-message failure and done evidence');
  await chooseExport('authored-project.json');
  await page.locator('#export-project').click();
  await expect(page.locator('#status')).toContainText('New JSON file exported');
  await chooseExport('approved-integration-flow.json');
  await page.locator('#export-flow').click();
  await expect(page.locator('#status')).toContainText(
    'Credential-free real Node-RED flow exported',
  );
  const flow = JSON.parse(
    fs.readFileSync(path.join(output, 'approved-integration-flow.json'), 'utf8'),
  );
  expect(flow.some((item) => item.type === 'resilient-metadata')).toBe(true);
  expect(flow.some((item) => item.type === 'native-capture')).toBe(false);
  expect(JSON.stringify(flow)).not.toContain('apiToken');
  await chooseExport('actual-run.json');
  await page.locator('#export-run').click();
  await expect(page.locator('#status')).toContainText('New JSON file exported');
  await page.locator('#export-run').click();
  await expect(page.locator('#status')).toHaveAttribute('data-error', 'true');
  await application.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    },
    path.join(output, 'authored-project.json'),
  );
  await page.locator('#import').click();
  await expect(page.locator('#status')).toContainText('Project loaded into the editor');
  await save(page);
  const beforeInvalidImport = fs.readFileSync(path.join(profile, 'project.json'));
  fs.writeFileSync(
    path.join(output, 'invalid-project.json'),
    '{"schema":1,"title":"Wrong project","endpoint":"https://outside.invalid"}',
    { flag: 'wx' },
  );
  await application.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    },
    path.join(output, 'invalid-project.json'),
  );
  await page.locator('#import').click();
  await expect(page.locator('#status')).toHaveAttribute('data-error', 'true');
  expect(fs.readFileSync(path.join(profile, 'project.json')).equals(beforeInvalidImport)).toBe(
    true,
  );
  await application.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await page.locator('#import').click();
  await expect(page.locator('#status')).toContainText('Import canceled');
  steps.push(
    'real project/flow/run exports, valid project import, existing-file/invalid-import refusal and canceled import',
  );
  await page.locator('#scenario').selectOption('held');
  await page.locator('#payloads').fill('[{"productId":"drive-200","version":"2.4.1"}]');
  await page.locator('#timeoutMs').fill('10000');
  await save(page);
  await page.locator('#run').click();
  await expect(page.locator('#flow-provider')).toContainText('1 actual provider requests', {
    timeout: 15000,
  });
  await page.locator('#cancel').click();
  await expect(page.locator('#run')).toBeEnabled({ timeout: 15000 });
  let current = JSON.parse(fs.readFileSync(path.join(profile, 'project.json'), 'utf8'));
  expect(current.history.at(-1).run.cancelled).toBe(true);
  expect(current.history.at(-1).run.results[0].outcome).not.toBe('success');
  steps.push('actual held response cancelled/redeployed and saved honestly');
  await page.screenshot({ path: path.join(output, 'native-cancelled-flow.png'), fullPage: true });
  await quit();
  page = await entry();
  await expect(page.locator('#title')).toHaveValue('Plant 7 / authorized motor maintenance');
  await expect(page.locator('#history-budget')).toContainText('retained runs');
  expect(await page.locator('#history option').count()).toBe(current.history.length);
  steps.push('same durable project and exact history restored after actual normal exit');
  await page.locator('#scenario').selectOption('success');
  await save(page);
  await run(page);
  await expect(page.locator('#results tr').first()).toContainText('success');
  steps.push('real held-to-success graph redeploy after restart');
  // A real native save dialog is held by the harness; accepted I/O must remain owned through repeated Quit/Close.
  await application.evaluate(
    ({ dialog }, file) => {
      globalThis.metadataHeldExport = { release: null, entered: false };
      dialog.showSaveDialog = () =>
        new Promise((resolve) => {
          globalThis.metadataHeldExport.entered = true;
          globalThis.metadataHeldExport.release = () =>
            resolve({ canceled: false, filePath: file });
        });
    },
    path.join(output, 'held-export.json'),
  );
  await page.locator('#export-run').click();
  await expect
    .poll(() => application.evaluate(() => globalThis.metadataHeldExport.entered))
    .toBe(true);
  await application.evaluate(({ app, BrowserWindow }) => {
    app.quit();
    app.quit();
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect(page.locator('#status')).toContainText('Finishing accepted operations');
  expect(fs.existsSync(path.join(profile, 'owner.lock'))).toBe(true);
  expect(
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
  ).toBe(true);
  const ended = once(application.process(), 'exit');
  await application.evaluate(() => globalThis.metadataHeldExport.release());
  const [code, signal] = await waitExit(ended);
  expect(code).toBe(0);
  expect(signal).toBeNull();
  exits.push(code);
  expect(fs.existsSync(path.join(output, 'held-export.json'))).toBe(true);
  expect(fs.existsSync(path.join(profile, 'owner.lock'))).toBe(false);
  steps.push(
    'repeated Quit/Close retained visible owner/real export until completion; actual child/provider exit',
  );
  expect(errors).toEqual([]);
  current = JSON.parse(fs.readFileSync(path.join(profile, 'project.json'), 'utf8'));
  fs.writeFileSync(
    path.join(output, 'proof.json'),
    JSON.stringify(
      {
        schema: 1,
        success: true,
        version: '1.1.0',
        sourceMode: source,
        identities,
        heldQuit: true,
        exits,
        rendererErrors: errors,
        retainedRuns: current.history.length,
        evicted: current.dropped,
        steps,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  fs.writeFileSync(path.join(output, 'native-diagnostics.log'), diagnostics.join(''), {
    flag: 'wx',
  });
  console.log(
    JSON.stringify({ success: true, exits, journeys: steps.length, rendererErrors: errors.length }),
  );
} catch (error) {
  fs.writeFileSync(
    path.join(output, 'failure.json'),
    JSON.stringify(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Native journey failed',
        steps,
        exits,
        rendererErrors: errors,
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  );
  fs.writeFileSync(path.join(output, 'failure-native-diagnostics.log'), diagnostics.join(''), {
    flag: 'wx',
  });
  try {
    if (application && application.process().exitCode === null)
      await application.evaluate(({ app, dialog }) => {
        dialog.showMessageBox = async () => ({ response: 1 });
        app.quit();
      });
  } catch {
    /* Preserve the failed owned app/profile if normal error acknowledgement is unavailable. */
  }
  throw error;
}
