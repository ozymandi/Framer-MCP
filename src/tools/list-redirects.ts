import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

export function registerListRedirects(server: McpServer): void {
  server.registerTool(
    "framer_list_redirects",
    {
      description:
        "Return all URL redirects configured on the project. Each entry has " +
        "{ id, from, to, expandToAllLocales }.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
      },
    },
    async ({ project }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { framer } = proj.ctx;
      const redirects = await framer.getRedirects();
      return jsonResult(
        redirects.map((r: { id: string; from: string; to: string | null; expandToAllLocales: boolean }) => ({
          id: r.id,
          from: r.from,
          to: r.to,
          expandToAllLocales: r.expandToAllLocales,
        })),
      );
    },
  );
}
