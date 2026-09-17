/**
 * @file Node-RED shared metadata-service configuration node.
 * @description Validates connection policy, retrieves protected credentials, and owns one shared client.
 * @exports Node-RED registration function for the `metadata-service` type.
 * @data client owns the bounded queue; apiToken is read from Node-RED credentials and never logged.
 */
import type { NodeAPI, NodeDef } from 'node-red';
import { parseServiceConfiguration, type ServiceConfiguration } from '../runtime/configuration';
import { IntegrationError, toIntegrationError } from '../runtime/integration-error';
import { MetadataClient } from '../runtime/metadata-client';
import type { MetadataServiceCredentials, MetadataServiceRuntimeNode } from './node-types';

interface MetadataServiceDefinition extends NodeDef {
  readonly baseUrl: string;
  readonly maxConcurrent: number | string;
  readonly maxQueueDepth: number | string;
  readonly maxResponseBytes: number | string;
  readonly retryCount: number | string;
  readonly retryDelayMs: number | string;
  readonly timeoutMs: number | string;
}

/** Registers the credential-bearing configuration node and its close lifecycle. */
function registerMetadataServiceNode(RED: NodeAPI): void {
  function MetadataServiceNode(
    this: MetadataServiceRuntimeNode,
    definition: MetadataServiceDefinition,
  ): void {
    RED.nodes.createNode(this, definition);
    let configuration: ServiceConfiguration | undefined;
    let client: MetadataClient | undefined;
    let configurationError: IntegrationError | undefined;

    try {
      configuration = parseServiceConfiguration({
        baseUrl: definition.baseUrl,
        maxConcurrent: definition.maxConcurrent,
        maxQueueDepth: definition.maxQueueDepth,
        maxResponseBytes: definition.maxResponseBytes,
        retryCount: definition.retryCount,
        retryDelayMs: definition.retryDelayMs,
        timeoutMs: definition.timeoutMs,
      });
      const credentials = this.credentials as MetadataServiceCredentials | undefined;
      client = new MetadataClient(
        credentials?.apiToken === undefined
          ? { configuration }
          : { apiToken: credentials.apiToken, configuration },
      );
      this.status({ fill: 'green', shape: 'dot', text: 'ready' });
    } catch (error: unknown) {
      configurationError = toIntegrationError(error);
      this.status({ fill: 'red', shape: 'ring', text: 'invalid config' });
      this.error(configurationError.message);
    }

    Object.defineProperties(this, {
      client: { configurable: false, enumerable: false, value: client },
      configuration: { configurable: false, enumerable: false, value: configuration },
      configurationError: {
        configurable: false,
        enumerable: false,
        value:
          configurationError ??
          (client === undefined
            ? new IntegrationError('CONFIGURATION_ERROR', 'Metadata service is unavailable', false)
            : undefined),
      },
    });

    this.on('close', (_removed: boolean, done: () => void) => {
      client?.close();
      this.status({});
      done();
    });
  }

  RED.nodes.registerType<
    MetadataServiceRuntimeNode,
    MetadataServiceDefinition,
    Record<string, never>,
    MetadataServiceCredentials
  >('metadata-service', MetadataServiceNode, {
    credentials: { apiToken: { type: 'password' } },
  });
}

export = registerMetadataServiceNode;
