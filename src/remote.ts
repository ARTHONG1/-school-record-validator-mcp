#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultPackageRoot, loadDataBundle } from "./data-loader.ts";
import { parseRemoteConfig } from "./remote-config.ts";
import { createRemoteApp, listenRemoteApp } from "./remote-server.ts";
import { createServices } from "./services.ts";

export async function main(): Promise<void> {
  const config = parseRemoteConfig(process.env);
  const bundle = await loadDataBundle(defaultPackageRoot());
  const remote = createRemoteApp(createServices(bundle), config);
  const listening = await listenRemoteApp(remote, config);
  process.stdout.write(`Remote MCP listening on ${config.host}:${listening.port}\n`);

  const shutdown = (): void => {
    void listening.close().finally(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const name = error instanceof Error ? error.name : "UnknownError";
    process.stderr.write(`Remote startup failed: ${name}\n`);
    process.exitCode = 1;
  });
}

