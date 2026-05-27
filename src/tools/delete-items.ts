import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshAll } from "../schema-cache.js";
import { errorResult, jsonResult, resolveCollection, resolveProject } from "./helpers.js";

export function registerDeleteItems(server: McpServer): void {
  server.registerTool(
    "framer_delete_items",
    {
      description:
        "Delete one or more items from a collection, identified by slug.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        collection: z.string().min(1).describe("Collection name."),
        slugs: z.array(z.string().min(1)).min(1).max(500),
      },
    },
    async ({ project, collection, slugs }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { alias, framer } = proj.ctx;

      await refreshAll(framer, alias);
      const result = resolveCollection(alias, collection, { forWrite: true });
      if (!result.ok) return errorResult(result.error);
      const cached = result.collection;

      const framerColl = await framer.getCollection(cached.id);
      if (!framerColl) return errorResult(`Collection '${collection}' disappeared.`);

      const items = await framerColl.getItems();
      const idBySlug = new Map<string, string>();
      for (const it of items) idBySlug.set(it.slug, it.id);

      const toDelete: string[] = [];
      const notFound: string[] = [];
      for (const slug of slugs) {
        const id = idBySlug.get(slug);
        if (id) toDelete.push(id);
        else notFound.push(slug);
      }

      if (toDelete.length > 0) await framerColl.removeItems(toDelete);

      return jsonResult({
        deleted: slugs.filter((s) => !notFound.includes(s)),
        notFound,
      });
    },
  );
}
