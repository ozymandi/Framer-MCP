import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

export function registerListDeployments(server: McpServer): void {
  server.registerTool(
    "framer_list_deployments",
    {
      description: "Return the project's deployment history (id, createdAt, updatedAt).",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
      },
    },
    async ({ project }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { framer } = proj.ctx;
      const deployments = await framer.getDeployments();
      return jsonResult(deployments);
    },
  );
}
