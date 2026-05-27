import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

export function registerGetChangedPaths(server: McpServer): void {
  server.registerTool(
    "framer_get_changed_paths",
    {
      description:
        "Return paths added / removed / modified in the project since the last production " +
        "deploy. Use to decide whether framer_publish_and_deploy is worth running.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
      },
    },
    async ({ project }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { framer } = proj.ctx;
      const changes = await framer.getChangedPaths();
      return jsonResult(changes);
    },
  );
}
