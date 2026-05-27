import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

export function registerRemoveRedirects(server: McpServer): void {
  server.registerTool(
    "framer_remove_redirects",
    {
      description:
        "Remove URL redirects from the project, identified by their `from` path. " +
        "Use framer_list_redirects first to see what exists. Returns the from-paths that were " +
        "matched and removed, plus any from-paths that could not be found.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        from: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .describe("Array of `from` paths to remove."),
      },
    },
    async ({ project, from }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { framer } = proj.ctx;

      const all = await framer.getRedirects();
      const idByFrom = new Map<string, string>();
      for (const r of all as ReadonlyArray<{ id: string; from: string }>) {
        idByFrom.set(r.from, r.id);
      }

      const toRemove: string[] = [];
      const removed: string[] = [];
      const notFound: string[] = [];
      for (const f of from) {
        const id = idByFrom.get(f);
        if (id) {
          toRemove.push(id);
          removed.push(f);
        } else {
          notFound.push(f);
        }
      }

      if (toRemove.length > 0) await framer.removeRedirects(toRemove);

      return jsonResult({ removed, notFound });
    },
  );
}
