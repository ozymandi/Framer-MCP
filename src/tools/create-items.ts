import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CollectionItemInput } from "framer-api";
import { refreshAll } from "../schema-cache.js";
import {
  encodeFieldData,
  FieldEncodeError,
  newEncodeCaches,
  type PlainFieldValue,
} from "../field-encoder.js";
import { errorResult, jsonResult, resolveCollection, resolveProject } from "./helpers.js";

const WRITABLE_TYPES = new Set([
  "string",
  "formattedText",
  "number",
  "boolean",
  "date",
  "link",
  "color",
  "enum",
  "image",
  "file",
  "collectionReference",
  "multiCollectionReference",
]);

const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.string()),
]);

const itemSchema = z.object({
  slug: z.string().min(1).describe("URL-safe unique identifier (e.g. 'getting-started')."),
  fields: z
    .record(fieldValueSchema)
    .describe(
      "Flat map of fieldName → value. Primitives for most types. For collectionReference, " +
        "pass the slug of the target item. For multiCollectionReference, pass an array of slugs.",
    ),
});

export function registerCreateItems(server: McpServer): void {
  server.registerTool(
    "framer_create_items",
    {
      description:
        "Create COMPLETE items in a collection. Aim to populate every writable field — partial " +
        "items look broken when published. Call framer_describe_collection first. Image and file " +
        "fields accept a public URL, a data URL, or an asset id — the server uploads URLs " +
        "automatically. After this call, review the per-item completeness report.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        collection: z.string().min(1).describe("Collection name."),
        items: z.array(itemSchema).min(1).max(200),
      },
    },
    async ({ project, collection, items }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { alias, framer } = proj.ctx;

      await refreshAll(framer, alias);
      const result = resolveCollection(alias, collection, { forWrite: true });
      if (!result.ok) return errorResult(result.error);
      const cached = result.collection;

      const seen = new Set<string>();
      for (const it of items) {
        if (seen.has(it.slug)) {
          return errorResult(`Duplicate slug in this call: '${it.slug}'.`);
        }
        seen.add(it.slug);
      }

      const encoded: {
        slug: string;
        fieldData: Record<string, { type: string; value: unknown }>;
      }[] = [];
      const caches = newEncodeCaches();
      try {
        for (const it of items) {
          const fieldData = await encodeFieldData(
            framer,
            alias,
            cached,
            it.fields as Record<string, PlainFieldValue>,
            caches,
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

      const writableFields = cached.orderedFields.filter((f) => WRITABLE_TYPES.has(f.type));
      const totalWritable = writableFields.length;

      const perItemReports: string[] = [];
      let anyEmpty = false;
      for (const item of encoded) {
        const filledIds = new Set(Object.keys(item.fieldData));
        const filledCount = writableFields.filter((f) => filledIds.has(f.id)).length;
        const emptyNames = writableFields.filter((f) => !filledIds.has(f.id)).map((f) => f.name);
        if (emptyNames.length > 0) anyEmpty = true;
        const tail = emptyNames.length === 0 ? "complete" : `empty: ${emptyNames.join(", ")}`;
        perItemReports.push(`  ${item.slug}: ${filledCount}/${totalWritable} fields filled — ${tail}`);
      }

      const lines: string[] = [];
      lines.push(`Created ${encoded.length} item(s) in '${cached.name}'.`);
      lines.push(`Slugs: ${encoded.map((e) => e.slug).join(", ")}`);
      lines.push("");
      lines.push("Per-item completeness:");
      lines.push(...perItemReports);
      if (anyEmpty) {
        lines.push("");
        lines.push(
          "Some items have empty fields. Call framer_update_items with the missing values " +
            "to make these items publish-ready. If you genuinely have nothing for a field, leave it.",
        );
      }

      return {
        content: [
          { type: "text" as const, text: lines.join("\n") },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                created: encoded.length,
                slugs: encoded.map((e) => e.slug),
                completeness: encoded.map((item) => {
                  const filledIds = new Set(Object.keys(item.fieldData));
                  return {
                    slug: item.slug,
                    filled: writableFields.filter((f) => filledIds.has(f.id)).length,
                    total: totalWritable,
                    empty: writableFields
                      .filter((f) => !filledIds.has(f.id))
                      .map((f) => f.name),
                  };
                }),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
