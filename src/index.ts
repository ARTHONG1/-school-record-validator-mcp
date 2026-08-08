#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultPackageRoot, loadDataBundle } from "./data-loader.ts";
import { createServer } from "./server.ts";
import { createServices } from "./services.ts";
import { parseToolset } from "./toolset.ts";

export async function main(): Promise<void> {
  const bundle = await loadDataBundle(defaultPackageRoot());
  const server = createServer(createServices(bundle), {
    toolset: parseToolset(process.env.MCP_TOOLSET),
  });
  await server.connect(new StdioServerTransport());
}

function startupErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const match = /^Data integrity check failed: ([a-z-]+): ([A-Za-z0-9._/-]+)$/u.exec(error.message);
    if (match) return `Startup failed: ${match[1]} (${match[2]})`;
    return `Startup failed: ${error.name}`;
  }
  return "Startup failed: UnknownError";
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${startupErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
