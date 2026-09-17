/**
 * @file Cross-platform generated-output cleanup.
 * @description Removes only the repository-owned compiled output directory.
 * @exports No public exports; invoked by `pnpm clean`.
 */
import { rm } from 'node:fs/promises';

await Promise.all(['dist'].map((directory) => rm(directory, { force: true, recursive: true })));
