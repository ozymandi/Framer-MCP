import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshAll } from "../schema-cache.js";
import { decodeFieldData, newEncodeCaches } from "../field-encoder.js";
import { errorResult, jsonResult, resolveCollection, resolveProject } from "./helpers.js";

export function registerListItems(server: McpServer): void {
  server.registerTool(
    "framer_list_items",
    {
      description:
        "List items in a collection. Returns { slug, draft, fields } where `fields` is a " +
        "flat map of fieldName → value (server resolves IDs and enum cases). Supports " +
        "pagination via limit + offset.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        collection: z.string().min(1).describe("Collection name."),
        limit: z.number().int().min(1).max(500).optional().describe("Max items. Default 50."),
        offset: z.number().int().min(0).optional().describe("Items to skip. Default 0."),
      },
    },
    async ({ project, collection, limit, offset }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { alias, framer } = proj.ctx;

      await refreshAll(framer, alias);
      const result = resolveCollection(alias, collection, { forWrite: false });
      if (!result.ok) return errorResult(result.error);
      const cached = result.collection;

      const framerColl = await framer.getCollection(cached.id);
      if (!framerColl) return errorResult(`Collection '${collection}' disappeared.`);

      const all = await framerColl.getItems();
      const start = offset ?? 0;
      const end = start + (limit ?? 50);
      const slice = all.slice(start, end);

      const caches = newEncodeCaches();
      const out: { slug: string; draft: boolean; fields: Record<string, unknown> }[] = [];
      for (const item of slice) {
        out.push({
          slug: item.slug,
          draft: item.draft,
          fields: await decodeFieldData(
            framer,
            alias,
            cached,
            item.fieldData as Record<string, { type: string; value: unknown } | undefined>,
            caches,
          ),
        });
      }

      return jsonResult({
        total: all.length,
        offset: start,
        returned: out.length,
        items: out,
      });
    },
  );
}
