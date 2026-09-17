/**
 * @file Deterministic validation and queue microbenchmark.
 * @description Measures hot-path schema validation and verifies bounded queue behavior at load.
 * @exports No public API; invoked by `pnpm benchmark` and CI.
 * @data validationSamples and queuedJobs fix workload size; elapsed values are environment-specific.
 */
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { parseLookupRequest } from './contracts';
import { BoundedWorkQueue } from './runtime/bounded-work-queue';

const validationSamples = 50_000;
const queuedJobs = 2_000;

/** Runs both bounded workloads and emits one machine-readable result object. */
async function main(): Promise<void> {
  const validationStarted = performance.now();
  for (let index = 0; index < validationSamples; index += 1) {
    const result = parseLookupRequest({
      locale: 'en-US',
      productId: `device-${index % 100}`,
      version: '1.0.0',
    });
    if (!result.ok) {
      throw new Error('Benchmark fixture unexpectedly failed validation');
    }
  }
  const validationDurationMs = performance.now() - validationStarted;

  const queue = new BoundedWorkQueue(8, queuedJobs);
  const queueStarted = performance.now();
  const jobs = Array.from({ length: queuedJobs }, (_, index) => queue.submit(async () => index));
  const queuedHighWaterMark = queue.snapshot().highWaterMark;
  await Promise.all(jobs);
  const queueDurationMs = performance.now() - queueStarted;

  if (validationDurationMs > 5_000 || queueDurationMs > 5_000) {
    throw new Error('Benchmark exceeded its broad regression guard');
  }
  if (queue.snapshot().active !== 0 || queue.snapshot().pending !== 0) {
    throw new Error('Queue did not drain after the benchmark workload');
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        queue: {
          durationMs: Number(queueDurationMs.toFixed(3)),
          jobs: queuedJobs,
          queuedHighWaterMark,
        },
        validation: {
          durationMs: Number(validationDurationMs.toFixed(3)),
          operationsPerSecond: Math.round(validationSamples / (validationDurationMs / 1_000)),
          samples: validationSamples,
        },
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Benchmark failed'}\n`);
  process.exitCode = 1;
});
