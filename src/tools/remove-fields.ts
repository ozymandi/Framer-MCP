import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import { normalizeKey, refreshAll, suggestName } from "../schema-cache.js";
import { errorResult, jsonResult, resolveCollection } from "./helpers.js";

export function registerRemoveFields(server: McpServer): void {
  server.registerTool(
    "framer_remove_fields",
    {
      description:
        "Remove one or more fields from an existing collection by name. " +
        "WARNING: this drops any data stored in those fields across every item. " +
        "Only call this when you genuinely want to delete the column from the schema.",
      inputSchema: {
        collection: z.string().min(1).describe("Collection name."),
        fieldNames: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("Names of fields to remove (display name or snake_case key)."),
      },
    },
    async ({ collection, fieldNames }) => {
      const framer = await getFramer();
      await refreshAll(framer);

      const result = resolveCollection(collection, { forWrite: true });
      if (!result.ok) return errorResult(result.error);
      const cached = result.collection;

      const toRemoveIds: string[] = [];
      const removedNames: string[] = [];
      const notFound: { name: string; hint: string | null }[] = [];

      const knownDisplayNames = [...new Set(cached.orderedFields.map((f) => f.name))];

      for (const name of fieldNames) {
        const field = cached.fieldsByName.get(normalizeKey(name));
        if (!field) {
          notFound.push({ name, hint: suggestName(name, knownDisplayNames) });
          continue;
        }
        toRemoveIds.push(field.id);
        removedNames.push(field.name);
      }

      if (notFound.length > 0) {
        const lines = notFound.map(
          (n) =>
            `'${n.name}' not found` + (n.hint ? ` (did you mean '${n.hint}'?)` : ""),
        );
        return errorResult(
          `Some fields could not be resolved: ${lines.join("; ")}. ` +
            `No changes made. Available fields: ${knownDisplayNames.join(", ")}.`,
        );
      }

      const framerColl = await framer.getCollection(cached.id);
      if (!framerColl) return errorResult(`Collection '${collection}' disappeared.`);
      await framerColl.removeFields(toRemoveIds);

      await refreshAll(framer);

      return jsonResult({
        collection: cached.name,
        removed: removedNames,
      });
    },
  );
}
