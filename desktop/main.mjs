/**
 * @file Native editable metadata reliability workbench with the genuine shipped Node-RED nodes.
 * @description One owner-local project/history, fixed child runtime and owned provider; retained Quit never kills active work.
 * @exports Native entry point; the sole immutable main frame receives a closed IPC API.
 * @data Plaintext project/history and static admission are not multiuser authorization or malicious same-owner protection.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, session } from 'electron';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRuntime } from './runtime-owner.mjs';
const require = createRequire(import.meta.url);
const { openProfile } = require('./profile.cjs');
const { openState } = require('./state.cjs');
const { createOperations, drainRuntime } = require('./operation.cjs');
const { newFile, readUtf8 } = require('./files.cjs');
const { verifiedResources, responseFor } = require('./resources.cjs');
const ownerRoot = dirname(fileURLToPath(import.meta.url));
const resourceRoot = app.isPackaged
  ? join(process.resourcesPath, 'workbench')
  : resolve(
      process.env.METADATA_NATIVE_RESOURCES ?? resolve(ownerRoot, '../.runtime/native-resources'),
    );
const flag = process.argv.indexOf('--profile');
const profilePath =
  flag < 0
    ? join(
        process.env.LOCALAPPDATA ?? app.getPath('appData'),
        'JasonStysPortfolio',
        'node-red-resilient-metadata',
        'workspace',
      )
    : process.argv[flag + 1];
const owner = createOperations();
let window,
  profile,
  api,
  store,
  runtime,
  startup,
  closing,
  failing,
  dirty = false,
  exiting = false;
app.setName('Node-RED Metadata Workbench');
app.commandLine.appendSwitch('disable-background-networking');
protocol.registerSchemesAsPrivileged([
  { scheme: 'metadata', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
function sender(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !['metadata://workbench/', 'metadata://workbench/index.html'].includes(event.senderFrame.url) ||
    owner.closing
  )
    throw new Error('The active native workbench is required.');
}
function snapshot() {
  return { ...store.load(), version: '1.1.0' };
}
async function request(operation, value) {
  if (operation === 'load' && value === null) return snapshot();
  if (operation === 'prepared' && value === null) return api.preparedProject();
  if (operation === 'previous' && value === null) return store.previous().project;
  if (operation === 'save') {
    if (!value || Object.keys(value).sort().join('|') !== 'project|sha256')
      throw new Error('Invalid project save.');
    const project = api.parseProject(value.project);
    store.save({ ...store.load().value, project }, value.sha256);
    dirty = false;
    return snapshot();
  }
  if (operation === 'run' && value === null) {
    const current = store.load();
    const result = await runtime.request('run', current.value.project);
    store.save(api.appendRun(current.value, current.value.project, result), current.sha256);
    return snapshot();
  }
  if (operation === 'cancel' && value === null) return runtime.request('cancel');
  if (operation === 'import' && value === null) {
    const choice = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Metadata project JSON', extensions: ['json'] }],
    });
    if (choice.canceled || choice.filePaths.length !== 1) return null;
    return api.parseProject(readUtf8(choice.filePaths[0], api.MAX_PROJECT_BYTES));
  }
  if (operation === 'export') {
    if (
      !value ||
      Object.keys(value).sort().join('|') !== 'id|kind' ||
      !['project', 'flow', 'run'].includes(value.kind)
    )
      throw new Error('Invalid export request.');
    const current = store.load().value;
    let data;
    if (value.kind === 'run') {
      const selected = current.history.find((item) => item.run.id === value.id);
      if (!selected) throw new Error('Select an exact retained run before exporting.');
      data = selected;
    } else {
      if (value.id !== null) throw new Error('Unexpected run selection.');
      data = value.kind === 'project' ? current.project : api.exportFlow(current.project);
    }
    const choice = await dialog.showSaveDialog(window, {
      defaultPath: 'metadata-' + value.kind + '.json',
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (choice.canceled || !choice.filePath) return { canceled: true };
    newFile(choice.filePath, JSON.stringify(data, null, 2) + '\n');
    return { canceled: false };
  }
  throw new Error('Unknown native workbench operation.');
}
function closeOwned() {
  if (!closing)
    closing = (async () => {
      await startup;
      if (dirty) {
        const answer = await dialog.showMessageBox(window, {
          type: 'warning',
          message: 'Discard unsaved project changes?',
          detail: 'Keep editing to save first. The last saved project and history remain intact.',
          buttons: ['Keep editing', 'Discard and exit'],
          defaultId: 0,
          cancelId: 0,
        });
        if (answer.response !== 1) {
          closing = undefined;
          return;
        }
      }
      owner.stopAdmission();
      window?.webContents.send('metadata:closing');
      window?.setTitle('Metadata Workbench | finishing actual flow and provider shutdown');
      // Close requests cancel/redeploy through the actual original node. Finish retains the run's saved evidence too.
      await drainRuntime(runtime, owner);
      console.info('metadata-owner-stage', 'accepted-work-and-child-complete');
      session.defaultSession.flushStorageData();
      profile.close();
      exiting = true;
      console.info('metadata-owner-stage', 'profile-released');
      app.quit();
    })().catch((error) =>
      failedOwned(
        'Owned runtime requires review',
        'Shutdown or temporary cleanup did not complete normally. Saved data and any failed ownership evidence are preserved. Failure exit waits all accepted local work and the actual child.',
        error,
      ),
    );
  return closing;
}
/** Startup and Close may reject from the same promise: share one complete cleanup and one explicit failure exit. */
function failedOwned(title, detail, error) {
  if (!failing)
    failing = Promise.resolve()
      .then(async () => {
        process.exitCode = 1;
        owner.stopAdmission();
        console.info('metadata-owner-stage', 'failure', error?.code ?? 'application');
        try {
          dialog.showErrorBox(title, detail);
        } catch {
          console.info('metadata-owner-stage', 'error-display-unavailable');
        }
        let clean = true;
        try {
          await drainRuntime(runtime, owner);
        } catch {
          clean = false;
          if (runtime) await runtime.exited;
          await owner.finish();
        }
        if (clean) {
          try {
            profile?.close();
          } catch {
            /* Preserve a foreign/replaced lock. */
          }
        }
        exiting = true;
        app.exit(1);
      })
      .catch(() => {
        console.info(
          'metadata-owner-stage',
          'failure-cleanup-unproven',
        ); /* Retain owner and evidence instead of pretending to exit successfully. */
      });
  return failing;
}
app.on('before-quit', (event) => {
  if (!exiting) {
    event.preventDefault();
    void closeOwned();
  }
});
app.on('window-all-closed', () => {
  if (!exiting) void closeOwned();
});
try {
  if (typeof profilePath !== 'string') throw new Error('An absolute private profile is required.');
  profile = openProfile(profilePath, [
    dirname(process.execPath),
    process.resourcesPath,
    app.getAppPath(),
  ]);
  app.setPath('userData', profile.browser);
  if (!app.requestSingleInstanceLock()) throw new Error('This profile already has an owner.');
  startup = app.whenReady().then(async () => {
    window = new BrowserWindow({
      width: 1480,
      height: 980,
      minWidth: 1050,
      minHeight: 700,
      show: false,
      title: 'Node-RED Metadata Workbench | verifying actual runtime',
      webPreferences: {
        preload: join(ownerRoot, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false,
        webSecurity: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.on('close', (event) => {
      if (!exiting) {
        event.preventDefault();
        void closeOwned();
      }
    });
    // A static no-script status document paints before bounded dependency verification. It has no admitted IPC frame.
    await window.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'"><title>Node-RED Metadata Workbench</title><body style="background:#122b3a;color:white;font:18px Segoe UI;padding:50px"><h1>Metadata Workbench</h1><p>Verifying the shipped runtime and opening your workspace...</p><p>Jason Stys | v1.1.0</p></body></html>',
        ),
    );
    window.show();
    const resources = verifiedResources(resourceRoot, ownerRoot);
    api = require(join(resourceRoot, 'library/workbench/project.js'));
    store = openState(profile.directory, (value) => api.parseState(JSON.stringify(value)), {
      schema: 1,
      project: api.preparedProject(),
      history: [],
      dropped: 0,
    });
    protocol.handle('metadata', (event) => responseFor(event, resources.data));
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: !details.url.startsWith('metadata://workbench/') }),
    );
    session.defaultSession.on('will-download', (event) => event.preventDefault());
    ipcMain.handle('metadata:request', (event, operation, value) => {
      sender(event);
      return owner.run(async () => {
        try {
          return { success: true, value: await request(operation, value) };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message.slice(0, 2000)
                : 'The operation was refused. Existing data was preserved.',
          };
        }
      }, operation === 'cancel');
    });
    ipcMain.handle('metadata:dirty', (event, value) => {
      sender(event);
      if (typeof value !== 'boolean') throw new Error('Invalid editor state.');
      dirty = value;
    });
    ipcMain.handle('metadata:quit', (event) => {
      sender(event);
      void closeOwned();
    });
    let readyResolve;
    const ready = new Promise((resolve) => {
      readyResolve = resolve;
    });
    ipcMain.handle('metadata:ready', (event) => {
      sender(event);
      readyResolve();
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Workbench',
          submenu: [
            {
              label: 'Help',
              click: () => {
                void dialog.showMessageBox(window, {
                  message: 'Node-RED Metadata Workbench | Jason Stys',
                  detail:
                    'Author payloads, provider records and queue/retry policy; save and run the actual shipped metadata nodes in Node-RED 5.0.8. Cancel performs real flow redeployment; Quit waits actual provider/child completion. The native provider is owned loopback only: no imported arbitrary-code nodes, external endpoint or MQTT. Export a credential-free real Node-RED flow for independent approved integration. Up to 10 runs/16 MiB are retained, with visible eviction counts. Workspace files are plaintext under your OS account, not multiuser authentication. Import only authorized data. github.com/JasonStys',
                });
              },
            },
            {
              label: 'Exit application',
              click: () => {
                void closeOwned();
              },
            },
          ],
        },
        { role: 'editMenu' },
      ]),
    );
    runtime = await startRuntime(ownerRoot, resourceRoot, (value) => {
      if (!window.isDestroyed()) window.webContents.send('metadata:progress', value);
    });
    await runtime.ready;
    await window.loadURL('metadata://workbench/');
    let timer;
    try {
      await Promise.race([
        ready,
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Actual UI did not become ready.')), 30000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    window.setTitle('Node-RED Metadata Workbench | Jason Stys | 1.1.0');
    window.show();
  });
  startup.catch((error) => {
    if (!app.isPackaged) console.error(error);
    return failedOwned(
      'Workbench startup failed',
      'The actual application source, private profile or owned runtime could not start. Existing files were preserved.',
      error,
    );
  });
} catch (error) {
  if (!app.isPackaged) console.error(error);
  void failedOwned(
    'Private workspace was refused',
    'Select an empty or identified ordinary private profile outside application resources. Unknown files and owner locks were preserved.',
    error,
  );
}
