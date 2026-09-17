/**
 * @file Node-RED editor asset copier.
 * @description Copies the two editor/help HTML files beside their compiled runtime JavaScript.
 * @exports No public exports; invoked by `pnpm build`.
 */
import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist/nodes', { recursive: true });
await Promise.all(
  ['metadata-service', 'resilient-metadata'].map((name) =>
    copyFile(`editor/${name}.html`, `dist/nodes/${name}.html`),
  ),
);
