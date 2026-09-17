/**
 * @file Installable-package verification.
 * @description Confirms runtime/editor pairs and message schema are present after a production build.
 * @exports No public exports; invoked by `pnpm verify`.
 */
import { access, readFile } from 'node:fs/promises';
import console from 'node:console';

const packageDefinition = JSON.parse(await readFile('package.json', 'utf8'));
const nodeEntries = Object.values(packageDefinition['node-red'].nodes);
const requiredFiles = [
  ...nodeEntries,
  ...nodeEntries.map((entry) => entry.replace(/\.js$/, '.html')),
  'schemas/lookup-request.schema.json',
  'schemas/metadata-record.schema.json',
];

await Promise.all(requiredFiles.map((file) => access(file)));
console.log(`Package verification passed: ${requiredFiles.length} required files present.`);
