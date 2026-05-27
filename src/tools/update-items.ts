import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CollectionItemInput } from "framer-api";
import { getFramer } from "../framer-client.js";
import { refreshAll } from "../schema-cache.js";
import {
  encodeFieldData,
  FieldEncodeError,
  newEncodeCaches,
  type PlainFieldValue,
} from "../field-encoder.js";
import { errorResult, jsonResult, resolveCollection } from "./helpers.js";

const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

const itemSchema = z.object({
  slug: z.string().min(1).describe("Slug of the item to update."),
  fields: z
    .record(fieldValueSchema)
    .describe(
      "Only the fields you want to change. Other fields stay untouched. " +
        "For collectionReference fields, pass a slug (string). For multiCollectionReference, " +
        "an array of slugs.",
    ),
});

export function registerUpdateItems(server: McpServer): void {
  server.registerTool(
    "framer_update_items",
    {
      description:
        "Update one or more existing items in a collection, identified by slug. " +
        "Pass only the fields you want to change. " +
        "Returns the slugs that were updated and any slugs that could not be found.",
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

      const framerColl = await framer.getCollection(cached.id);
      if (!framerColl) return errorResult(`Collection '${collection}' disappeared.`);

      const existing = await framerColl.getItems();
      const idBySlug = new Map<string, string>();
      for (const it of existing) idBySlug.set(it.slug, it.id);

      const notFound: string[] = [];
      const toUpsert: {
        id: string;
        slug: string;
        fieldData: Record<string, { type: string; value: unknown }>;
      }[] = [];

      const caches = newEncodeCaches();
      try {
        for (const it of items) {
          const id = idBySlug.get(it.slug);
          if (!id) {
            notFound.push(it.slug);
            continue;
          }
          const fieldData = await encodeFieldData(
            framer,
            cached,
            it.fields as Record<string, PlainFieldValue>,
            caches,
          );
          toUpsert.push({ id, slug: it.slug, fieldData });
        }
      } catch (err) {
        if (err instanceof FieldEncodeError) return errorResult(err.message);
        throw err;
      }

      if (toUpsert.length > 0) await framerColl.addItems(toUpsert as unknown as CollectionItemInput[]);

      return jsonResult({
        updated: toUpsert.map((t) => t.slug),
        notFound,
      });
    },
  );
}
