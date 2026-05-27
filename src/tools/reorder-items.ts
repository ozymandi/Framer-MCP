import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshAll } from "../schema-cache.js";
import { errorResult, jsonResult, resolveCollection, resolveProject } from "./helpers.js";

export function registerReorderItems(server: McpServer): void {
  server.registerTool(
    "framer_reorder_items",
    {
      description:
        "Reorder items within a collection. Pass slugs in the desired order; unknown slugs are " +
        "ignored. Unspecified existing slugs keep their relative order at the tail of the list.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        collection: z.string().min(1).describe("Collection name."),
        slugs: z
          .array(z.string().min(1))
          .min(1)
          .max(500)
          .describe("Slugs in the desired final order (front of list = top of CMS)."),
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
      const allSlugs: string[] = [];
      for (const it of items) {
        idBySlug.set(it.slug, it.id);
        allSlugs.push(it.slug);
      }

      const resolvedIds: string[] = [];
      const usedSlugs = new Set<string>();
      const notFound: string[] = [];

      for (const slug of slugs) {
        const id = idBySlug.get(slug);
        if (!id) {
          notFound.push(slug);
          continue;
        }
        if (usedSlugs.has(slug)) continue;
        usedSlugs.add(slug);
        resolvedIds.push(id);
      }
      // Append untouched items at the end so they remain in the collection.
      for (const slug of allSlugs) {
        if (!usedSlugs.has(slug)) {
          const id = idBySlug.get(slug);
          if (id) resolvedIds.push(id);
        }
      }

      await framerColl.setItemOrder(resolvedIds);

      return jsonResult({
        collection: cached.name,
        ordered: slugs.filter((s) => idBySlug.has(s)),
        notFound,
      });
    },
  );
}
