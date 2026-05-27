import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CollectionItemInput } from "framer-api";
import { getFramer } from "../framer-client.js";
import { refreshAll } from "../schema-cache.js";
import { encodeFieldData, FieldEncodeError, type PlainFieldValue } from "../field-encoder.js";
import { newAssetCache } from "../asset-uploader.js";
import { errorResult, jsonResult, resolveCollection } from "./helpers.js";

const itemSchema = z.object({
  slug: z
    .string()
    .min(1)
    .describe(
      "URL-safe unique identifier within the collection (e.g. 'getting-started').",
    ),
  fields: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .describe("Flat map of fieldName → primitive value. Call framer_describe_collection first."),
});

export function registerCreateItems(server: McpServer): void {
  server.registerTool(
    "framer_create_items",
    {
      description:
        "Create one or more new items in a collection. " +
        "Field values are plain primitives (string, number, boolean, null). " +
        "Server resolves field IDs and validates types. " +
        "Slugs must be unique; duplicate slugs within the same call are rejected. " +
        "Call framer_describe_collection first to learn the schema.",
      inputSchema: {
        collection: z.string().min(1).describe("Collection name."),
        items: z.array(itemSchema).min(1).max(200),
      },
    },
    async ({ collection, items }) => {
      const framer = await getFramer();
      await refreshAll(framer);

      const result = resolveCollection(collection, { forWrite: true });
      if (!result.ok) return errorResult(result.error);
      const cached = result.collection;

      // De-dup check inside the call.
      const seen = new Set<string>();
      for (const it of items) {
        if (seen.has(it.slug)) {
          return errorResult(`Duplicate slug in this call: '${it.slug}'.`);
        }
        seen.add(it.slug);
      }

      const encoded: { slug: string; fieldData: Record<string, { type: string; value: unknown }> }[] = [];
      const cache = newAssetCache();
      try {
        for (const it of items) {
          const fieldData = await encodeFieldData(
            framer,
            cached,
            it.fields as Record<string, PlainFieldValue>,
            cache,
          );
          encoded.push({ slug: it.slug, fieldData });
        }
      } catch (err) {
        if (err instanceof FieldEncodeError) return errorResult(err.message);
        throw err;
      }

      const framerColl = await framer.getCollection(cached.id);
      if (!framerColl) return errorResult(`Collection '${collection}' disappeared.`);
      await framerColl.addItems(encoded as unknown as CollectionItemInput[]);

      return jsonResult({
        created: encoded.length,
        slugs: encoded.map((e) => e.slug),
      });
    },
  );
}
