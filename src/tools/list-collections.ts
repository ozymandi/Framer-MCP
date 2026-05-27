import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listCollections, refreshAll } from "../schema-cache.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

export function registerListCollections(server: McpServer): void {
  server.registerTool(
    "framer_list_collections",
    {
      description:
        "List all CMS collections in the project. Returns: array of " +
        "{ name, itemCount, fieldNames, writable }. Use 'name' in subsequent tool calls.",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe(
            "Project alias from framer_list_projects. Required in multi-project mode.",
          ),
      },
    },
    async ({ project }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { alias, framer } = proj.ctx;

      await refreshAll(framer, alias);

      const cached = listCollections(alias);
      const collections = await framer.getCollections();
      const itemCountById = new Map<string, number>();
      for (const c of collections) {
        const items = await c.getItems();
        itemCountById.set(c.id, items.length);
      }

      const out = cached.map((c) => ({
        name: c.name,
        itemCount: itemCountById.get(c.id) ?? 0,
        fieldNames: c.orderedFields.filter((f) => f.type !== "divider").map((f) => f.name),
        writable: c.managedBy !== "anotherPlugin",
      }));

      return jsonResult(out);
    },
  );
}
