/**
 * @file Node-RED runtime integration-test configuration.
 * @description Isolates tests that start the real Node-RED test runtime.
 * @exports Vitest configuration.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    sequence: { concurrent: false },
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
