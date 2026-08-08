import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";
import { createHandlers, type Services, type ToolHandlers } from "./handlers.ts";
import { TOOL_SPECS, type ToolName } from "./schemas.ts";
import type { Toolset } from "./toolset.ts";

type HandlerResult = Awaited<ReturnType<ToolHandlers[ToolName]>>;

const GENERIC_TOOL_ERROR = "도구 처리 중 오류가 발생했습니다.";

function toCallToolResult(result: HandlerResult): CallToolResult {
  const content = result.content.map(({ text }): TextContent => ({
    type: "text",
    text,
  }));

  return {
    ...result,
    content,
  };
}

async function invokeSafely(
  handler: () => Promise<HandlerResult>,
): Promise<CallToolResult> {
  try {
    return toCallToolResult(await handler());
  } catch {
    return {
      content: [{ type: "text", text: GENERIC_TOOL_ERROR }],
      isError: true,
    };
  }
}

export function createServer(
  services: Services,
  options: { toolset?: Toolset } = {},
): McpServer {
  const server = new McpServer({
    name: "school-record-validator",
    version: "0.3.0",
  });
  const handlers = createHandlers(services);

  server.registerTool(
    "check_school_record",
    TOOL_SPECS.check_school_record,
    (args) => invokeSafely(() => handlers.check_school_record(args)),
  );

  if ((options.toolset ?? "teacher") !== "expert") return server;

  server.registerTool(
    "validate_record_text",
    TOOL_SPECS.validate_record_text,
    (args) => invokeSafely(() => handlers.validate_record_text(args)),
  );
  server.registerTool(
    "validate_record_batch",
    TOOL_SPECS.validate_record_batch,
    (args) => invokeSafely(() => handlers.validate_record_batch(args)),
  );
  server.registerTool(
    "search_record_guidance",
    TOOL_SPECS.search_record_guidance,
    (args) => invokeSafely(() => handlers.search_record_guidance(args)),
  );
  server.registerTool(
    "get_source_excerpt",
    TOOL_SPECS.get_source_excerpt,
    (args) => invokeSafely(() => handlers.get_source_excerpt(args)),
  );
  server.registerTool(
    "explain_record_rule",
    TOOL_SPECS.explain_record_rule,
    (args) => invokeSafely(() => handlers.explain_record_rule(args)),
  );
  server.registerTool(
    "list_record_fields",
    TOOL_SPECS.list_record_fields,
    (args) => invokeSafely(() => handlers.list_record_fields(args)),
  );
  server.registerTool(
    "rule_pack_info",
    TOOL_SPECS.rule_pack_info,
    (args) => invokeSafely(() => handlers.rule_pack_info(args)),
  );

  return server;
}
