/**
 * @file Bind copied native source metadata with the existing eight-MiB inventory budget.
 * @description A complete dependency inventory may exceed 512 KiB; both sides use the runtime's same bound.
 * @exports compareNativeSource and nativeResourceEntries.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
const { readRegular } = createRequire(import.meta.url)('../desktop/files.cjs');
export function compareNativeSource(original, copied) {
  const maximum = 8 * 1024 * 1024;
  if (!readRegular(original, maximum).equals(readRegular(copied, maximum)))
    throw new Error('Packaged source identity was not copied.');
}
/** ElectronBuilder excludes a tree's root node_modules; an explicit dependency-root entry preserves the verified closure. */
export function nativeResourceEntries(site) {
  return [
    { from: site, to: 'workbench' },
    { from: join(site, 'node_modules'), to: 'workbench/node_modules' },
  ];
}
