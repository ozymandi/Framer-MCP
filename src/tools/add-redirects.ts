import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

const redirectSchema = z.object({
  from: z.string().min(1).describe("Source path (e.g. '/old-url'). Supports * wildcards."),
  to: z.string().min(1).describe("Destination path. Use :1, :2, ... to reference wildcards."),
  expandToAllLocales: z.boolean().optional().default(false),
});

export function registerAddRedirects(server: McpServer): void {
  server.registerTool(
    "framer_add_redirects",
    {
      description:
        "Add one or more URL redirects to the project. `from` may contain * wildcards; the " +
        "matched groups can be referenced in `to` as :1, :2, etc. Returns the created redirects.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        redirects: z.array(redirectSchema).min(1).max(100),
      },
    },
    async ({ project, redirects }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { framer } = proj.ctx;

      try {
        const created = await framer.addRedirects(
          redirects.map((r) => ({
            from: r.from,
            to: r.to,
            expandToAllLocales: r.expandToAllLocales ?? false,
          })),
        );
        return jsonResult(
          created.map((r: { id: string; from: string; to: string | null }) => ({
            id: r.id,
            from: r.from,
            to: r.to,
          })),
        );
      } catch (err) {
        return errorResult(
          `addRedirects failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}
