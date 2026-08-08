export type Toolset = "teacher" | "expert";

export function parseToolset(value: string | undefined): Toolset {
  if (value === undefined || value === "" || value === "teacher") return "teacher";
  if (value === "expert") return "expert";
  throw new Error("Invalid MCP toolset configuration");
}
