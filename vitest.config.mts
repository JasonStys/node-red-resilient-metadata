/**
 * @file Unit-test and coverage configuration.
 * @description Enforces deterministic core tests and portfolio-level coverage thresholds.
 * @exports Vitest configuration.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/benchmark.ts', 'src/nodes/**'],
      include: ['src/contracts.ts', 'src/runtime/**'],
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 90,
        statements: 90,
      },
    },
    include: ['tests/unit/**/*.test.ts'],
    sequence: { concurrent: false },
  },
});
