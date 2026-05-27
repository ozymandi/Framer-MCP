import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { jsonResult } from "./helpers.js";

export function registerListProjects(server: McpServer): void {
  server.registerTool(
    "framer_list_projects",
    {
      description:
        "List the Framer projects this server is configured to access. " +
        "Returns an array of { alias, mode } where `alias` is the value you pass " +
        "as the `project` argument on other tools. In single-project mode you'll " +
        "see one entry with alias 'default' and the `project` argument is optional. " +
        "In multi-project mode the `project` argument is required on every other tool.",
      inputSchema: {},
    },
    async () => {
      return jsonResult({
        mode: config.multiProject ? "multi" : "single",
        projects: config.projects.map((p) => ({ alias: p.alias })),
      });
    },
  );
}
