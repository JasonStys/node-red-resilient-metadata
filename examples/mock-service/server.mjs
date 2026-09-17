/**
 * @file Dependency-free local metadata service simulator.
 * @description Serves valid, auth, retry, timeout, malformed, and not-found scenarios for example flows.
 * @exports No module API; run with `node examples/mock-service/server.mjs`.
 * @data retryAttempt alternates one transient failure and one success; server owns all response timers.
 */
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';

const host = '127.0.0.1';
const port = 4010;
const expectedToken = process.env.METADATA_DEMO_TOKEN ?? 'demo-token';
let retryAttempt = 0;

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${host}:${port}`);
  const match = /^\/v1\/products\/([^/]+)$/.exec(url.pathname);
  if (request.method !== 'GET' || match === null) {
    sendJson(response, 404, { error: 'route_not_found' });
    return;
  }
  if (request.headers.authorization !== `Bearer ${expectedToken}`) {
    sendJson(response, 401, { error: 'invalid_token' });
    return;
  }

  const productId = decodeURIComponent(match[1]);
  if (productId === 'missing-demo') {
    sendJson(response, 404, { error: 'product_not_found' });
    return;
  }
  if (productId === 'malformed-demo') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{ malformed');
    return;
  }
  if (productId === 'retry-demo' && retryAttempt++ % 2 === 0) {
    sendJson(response, 503, { error: 'temporary_unavailable' });
    return;
  }
  if (productId === 'timeout-demo') {
    const timer = setTimeout(() => sendRecord(response, productId, url), 2_500);
    request.once('close', () => clearTimeout(timer));
    return;
  }

  sendRecord(response, productId, url);
});

server.listen(port, host, () => {
  process.stdout.write(`Mock metadata service listening on http://${host}:${port}\n`);
});

process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());

/** Sends one schema-valid metadata record derived from the request URL. */
function sendRecord(response, productId, url) {
  sendJson(response, 200, {
    displayName: `Demonstration ${productId}`,
    documentation: [
      { title: 'Example installation guide', url: `https://docs.example.test/${productId}` },
    ],
    lifecycle: 'active',
    metadata: { family: 'demonstration', locale: url.searchParams.get('locale') ?? 'en-US' },
    productId,
    schemaVersion: '1.0',
    sourceTimestamp: '2026-01-15T12:00:00.000Z',
    version: url.searchParams.get('version') ?? 'latest',
  });
}

/** Serializes a bounded demonstration response with explicit JSON headers. */
function sendJson(response, statusCode, body) {
  const serialized = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-length': Buffer.byteLength(serialized),
    'content-type': 'application/json',
  });
  response.end(serialized);
}
