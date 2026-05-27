import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { jsonResult } from "./helpers.js";

export function registerListProjects(server: McpServer): void {
  server.registerTool(
    "framer_list_projects",
    {
      description:
        "List the Framer projects this server is configured to access. Returns an array of " +
        "{ alias }. In single-project mode, `project` is optional on other tools. In " +
        "multi-project mode it is required. Also reports the active toolMode (simple | expert).",
      inputSchema: {},
    },
    async () => {
      return jsonResult({
        projectMode: config.multiProject ? "multi" : "single",
        toolMode: config.expertMode ? "expert" : "simple",
        projects: config.projects.map((p) => ({ alias: p.alias })),
      });
    },
  );
}
