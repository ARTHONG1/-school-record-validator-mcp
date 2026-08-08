import { parseToolset, type Toolset } from "./toolset.ts";

export interface RemoteConfig {
  host: string;
  port: number;
  authToken?: string;
  allowedHosts?: string[];
  enableLegacySse: boolean;
  toolset: Toolset;
}

type Environment = Readonly<Record<string, string | undefined>>;

function parsePort(value: string | undefined): number {
  const port = value === undefined ? 8080 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Invalid remote configuration: PORT");
  }
  return port;
}

function parseBoolean(value: string | undefined): boolean {
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new Error("Invalid remote configuration: MCP_ENABLE_LEGACY_SSE");
}

function parseAllowedHosts(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const hosts = value.split(",").map((host) => host.trim());
  if (hosts.length === 0 || hosts.some((host) => host.length === 0 || /[/:\\\s]/u.test(host))) {
    throw new Error("Invalid remote configuration: MCP_ALLOWED_HOSTS");
  }
  return [...new Set(hosts)];
}

export function parseRemoteConfig(env: Environment): RemoteConfig {
  const authToken = env.MCP_AUTH_TOKEN;
  if (authToken !== undefined && authToken.length < 32) {
    throw new Error("Invalid remote configuration: MCP_AUTH_TOKEN");
  }

  return {
    host: "0.0.0.0",
    port: parsePort(env.PORT),
    authToken,
    allowedHosts: parseAllowedHosts(env.MCP_ALLOWED_HOSTS),
    enableLegacySse: parseBoolean(env.MCP_ENABLE_LEGACY_SSE),
    toolset: parseToolset(env.MCP_TOOLSET),
  };
}
