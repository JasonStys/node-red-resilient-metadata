/**
 * @file Node-RED product metadata lookup node.
 * @description Validates flow input, invokes shared bounded work, and routes success/error messages.
 * @exports Node-RED registration function for the `resilient-metadata` type.
 * @data activeControllers enables per-node redeploy cancellation; closed prevents post-close sends.
 */
import { randomUUID } from 'node:crypto';
import type { Node, NodeAPI, NodeDef, NodeMessageInFlow } from 'node-red';
import { parseLookupRequest } from '../contracts';
import { IntegrationError, toIntegrationError } from '../runtime/integration-error';
import type { MetadataServiceRuntimeNode } from './node-types';

interface LookupNodeDefinition extends NodeDef {
  readonly requestProperty: string;
  readonly service: string;
}

type NodeSend = (msg: NodeMessageInFlow | Array<NodeMessageInFlow | null>) => void;
type NodeDone = (error?: Error) => void;

/** Registers the two-output lookup node and manages its per-instance active controllers. */
function registerResilientMetadataNode(RED: NodeAPI): void {
  function ResilientMetadataNode(this: Node, definition: LookupNodeDefinition): void {
    RED.nodes.createNode(this, definition);
    const service = RED.nodes.getNode(definition.service) as MetadataServiceRuntimeNode | null;
    const requestProperty = definition.requestProperty || 'payload';
    const activeControllers = new Set<AbortController>();
    let closed = false;

    if (service === null) {
      this.status({ fill: 'red', shape: 'ring', text: 'no service' });
    } else if (service.configurationError !== undefined) {
      this.status({ fill: 'red', shape: 'ring', text: 'invalid service' });
    } else {
      this.status({ fill: 'green', shape: 'dot', text: 'ready' });
    }

    this.on('input', (msg: NodeMessageInFlow, send?: NodeSend, done?: NodeDone): void => {
      const output = send ?? ((message) => this.send(message));
      const finish = once(done ?? (() => undefined));
      const correlationId = typeof msg._msgid === 'string' ? msg._msgid : randomUUID();
      const rawRequest = RED.util.getMessageProperty(msg, requestProperty) as unknown;
      const parsedRequest = parseLookupRequest(rawRequest);

      if (!parsedRequest.ok) {
        const error = new IntegrationError(
          'INVALID_INPUT',
          'Lookup request failed its message contract',
          false,
          { property: requestProperty },
        );
        routeError(this, output, msg, error, correlationId);
        finish();
        return;
      }
      if (service?.client === undefined) {
        const error =
          service?.configurationError ??
          new IntegrationError('CONFIGURATION_ERROR', 'Metadata service is not configured', false);
        routeError(this, output, msg, error, correlationId);
        finish();
        return;
      }

      const controller = new AbortController();
      activeControllers.add(controller);
      this.status({ fill: 'blue', shape: 'dot', text: 'requesting' });

      void service.client
        .lookup(parsedRequest.value, correlationId, controller.signal)
        .then((outcome) => {
          if (closed) {
            return;
          }
          msg.payload = outcome.record;
          msg.metadataLookup = {
            attempts: outcome.attempts,
            correlationId,
            durationMs: outcome.durationMs,
            productId: parsedRequest.value.productId,
          };
          this.status({ fill: 'green', shape: 'dot', text: 'success' });
          output([msg, null]);
        })
        .catch((error: unknown) => {
          if (!closed) {
            routeError(this, output, msg, toIntegrationError(error), correlationId);
          }
        })
        .finally(() => {
          activeControllers.delete(controller);
          finish();
        });
    });

    this.on('close', (_removed: boolean, done: () => void) => {
      closed = true;
      for (const controller of activeControllers) {
        controller.abort();
      }
      activeControllers.clear();
      this.status({});
      done();
    });
  }

  RED.nodes.registerType('resilient-metadata', ResilientMetadataNode);
}

/** Applies safe error evidence, visible status, and output-two routing. */
function routeError(
  node: Node,
  send: NodeSend,
  msg: NodeMessageInFlow,
  error: IntegrationError,
  correlationId: string,
): void {
  msg.metadataError = error.serialize(correlationId);
  node.status({
    fill: error.retriable ? 'yellow' : 'red',
    shape: 'ring',
    text: error.code.toLowerCase().replaceAll('_', ' ').slice(0, 20),
  });
  send([null, msg]);
}

/** Wraps Node-RED's completion callback so asynchronous branches can finish exactly once. */
function once(callback: NodeDone): NodeDone {
  let called = false;
  return (error?: Error): void => {
    if (!called) {
      called = true;
      callback(error);
    }
  };
}

export = registerResilientMetadataNode;
