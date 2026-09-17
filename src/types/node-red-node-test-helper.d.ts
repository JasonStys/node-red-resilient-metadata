/**
 * @file Minimal declarations for node-red-node-test-helper.
 * @description Types only the stable test-runtime surface exercised by this package.
 * @exports CommonJS helper singleton declarations.
 */
declare module 'node-red-node-test-helper' {
  import type { EventEmitter } from 'node:events';
  import type { NodeAPI, NodeMessageInFlow } from 'node-red';

  interface TestNode extends EventEmitter {
    receive(message: NodeMessageInFlow): void;
  }

  interface NodeTestHelper {
    getNode(identifier: string): TestNode;
    init(runtimePath?: string): void;
    load(
      nodeModules: ReadonlyArray<(runtime: NodeAPI) => void>,
      flow: ReadonlyArray<Record<string, unknown>>,
      credentials?: Record<string, Record<string, string>>,
    ): Promise<void>;
    startServer(callback: (error?: Error) => void): void;
    stopServer(callback: (error?: Error) => void): void;
    unload(): Promise<void>;
  }

  const helper: NodeTestHelper;
  export = helper;
}
