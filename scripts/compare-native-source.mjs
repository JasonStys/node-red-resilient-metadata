/**
 * @file Bind copied native source metadata with the existing eight-MiB inventory budget.
 * @description A complete dependency inventory may exceed 512 KiB; both sides use the runtime's same bound.
 * @exports compareNativeSource and copyNativeResources.
 * @remarks Functions, parameters and variables: generated docs/code-map.md.
 */
import { createRequire } from 'node:module';
import { join } from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { readRegular, newFile, ancestors } = require('../desktop/files.cjs');
const { verifiedResources } = require('../desktop/resources.cjs');
export function compareNativeSource(original, copied) {
  const maximum = 8 * 1024 * 1024;
  if (!readRegular(original, maximum).equals(readRegular(copied, maximum)))
    throw new Error('Packaged source identity was not copied.');
}
/** Preserve the complete verified inventory without a vendor copier's root-module or dot-file filters. */
export function copyNativeResources(site, destination, ownerRoot) {
  const { metadata } = verifiedResources(site, ownerRoot);
  const raw = readRegular(join(site, 'SOURCE.json'), 8 * 1024 * 1024);
  if (JSON.stringify(JSON.parse(raw)) !== JSON.stringify(metadata))
    throw new Error('Source inventory changed before copying.');
  ancestors(join(destination, '..'));
  fs.mkdirSync(destination); // A pre-existing destination is never adopted or overwritten.
  for (const [name, expected] of Object.entries(metadata.files)) {
    // verifiedResources admits all relative names, counts, aliases and total bytes.
    // Bind each copied body again in case a source file changed after that pass.
    const bytes = readRegular(join(site, name), 32 * 1024 * 1024);
    if (createHash('sha256').update(bytes).digest('hex') !== expected)
      throw new Error('Source resource changed before copying.');
    const target = join(destination, name);
    fs.mkdirSync(join(target, '..'), { recursive: true });
    newFile(target, bytes);
  }
  newFile(join(destination, 'SOURCE.json'), raw);
}
