/**
 * @file Closed workbench bridge from the sole sandboxed immutable app frame.
 * @description Renderer receives no raw IPC, filesystem path, credential or executable interface.
 * @exports Frozen metadataWorkbench API.
 * @data Only explicit local work, edit state and bounded owner progress cross the bridge.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'metadataWorkbench',
  Object.freeze({
    request: (operation, value) => ipcRenderer.invoke('metadata:request', operation, value),
    changed: (value) => ipcRenderer.invoke('metadata:dirty', value),
    ready: () => ipcRenderer.invoke('metadata:ready'),
    quit: () => ipcRenderer.invoke('metadata:quit'),
    onProgress: (handler) => {
      const listener = (_event, value) => handler(value);
      ipcRenderer.on('metadata:progress', listener);
    },
    onClosing: (handler) => {
      const listener = () => handler();
      ipcRenderer.on('metadata:closing', listener);
    },
  }),
);
