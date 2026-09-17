/**
 * @file Shared Node-RED runtime node interfaces.
 * @description Describes the public surface between the config node and lookup node.
 * @exports MetadataServiceRuntimeNode.
 * @data client is absent after invalid configuration; configurationError is safe for flow output.
 */
import type { Node } from 'node-red';
import type { ServiceConfiguration } from '../runtime/configuration';
import type { IntegrationError } from '../runtime/integration-error';
import type { MetadataClient } from '../runtime/metadata-client';

export interface MetadataServiceCredentials {
  readonly apiToken?: string;
}

export interface MetadataServiceRuntimeNode extends Node<MetadataServiceCredentials> {
  readonly client: MetadataClient | undefined;
  readonly configuration: ServiceConfiguration | undefined;
  readonly configurationError: IntegrationError | undefined;
}
